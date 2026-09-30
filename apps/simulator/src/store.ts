import { mkdirSync } from 'node:fs';
import path from 'node:path';
import type { IngestEvent } from '@simu/shared-types';
import Database from 'better-sqlite3';

/**
 * Local store-and-forward outbox (spec §6.1), backed by SQLite (simu-gateway.db).
 *
 * Every event the gateway produces is written here FIRST with synced = 0, then the sync
 * worker ships it to the API. Rows survive process restarts, so pending data is sent on
 * the next start. Events the API permanently rejects are moved to a dead letter
 * (dead = 1) instead of blocking the queue forever.
 */

export interface OutboxItem {
  id: number;
  kind: IngestEvent['type'];
  payload: IngestEvent;
  recordedAt: string;
  createdAt: string;
  attempts: number;
}

export interface OutboxStats {
  pending: number;
  synced: number;
  dead: number;
  oldestPendingAt: string | null;
  lastError: string | null;
}

interface Row {
  id: number;
  kind: string;
  payload: string;
  recorded_at: string;
  created_at: string;
  attempts: number;
}

export class Outbox {
  private readonly db: Database.Database;
  private readonly insertStmt: Database.Statement;
  private readonly batchStmt: Database.Statement;

  constructor(readonly file: string) {
    if (file !== ':memory:') mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
    this.db = new Database(file);
    // WAL: writes by the emitters never block reads by the sync worker.
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS outbox (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        kind        TEXT    NOT NULL,
        payload     TEXT    NOT NULL,
        recorded_at TEXT    NOT NULL,
        created_at  TEXT    NOT NULL,
        synced      INTEGER NOT NULL DEFAULT 0,
        synced_at   TEXT,
        attempts    INTEGER NOT NULL DEFAULT 0,
        last_error  TEXT,
        dead        INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS outbox_pending_idx ON outbox (synced, dead, id);
    `);
    this.insertStmt = this.db.prepare(
      `INSERT INTO outbox (kind, payload, recorded_at, created_at) VALUES (?, ?, ?, ?)`,
    );
    this.batchStmt = this.db.prepare(
      `SELECT id, kind, payload, recorded_at, created_at, attempts
       FROM outbox WHERE synced = 0 AND dead = 0 ORDER BY id LIMIT ?`,
    );
  }

  /** Persists an event before any network attempt. Returns its local id. */
  enqueue(event: IngestEvent, now: Date = new Date()): number {
    const recordedAt = event.recorded_at ?? now.toISOString();
    const stored = { ...event, recorded_at: recordedAt } as IngestEvent;
    const res = this.insertStmt.run(
      event.type,
      JSON.stringify(stored),
      recordedAt,
      now.toISOString(),
    );
    return Number(res.lastInsertRowid);
  }

  /** Oldest pending items first (FIFO), excluding dead letters. */
  nextBatch(limit: number): OutboxItem[] {
    return (this.batchStmt.all(limit) as Row[]).map((r) => ({
      id: r.id,
      kind: r.kind as IngestEvent['type'],
      payload: JSON.parse(r.payload) as IngestEvent,
      recordedAt: r.recorded_at,
      createdAt: r.created_at,
      attempts: r.attempts,
    }));
  }

  markSynced(ids: readonly number[], now: Date = new Date()): void {
    if (ids.length === 0) return;
    const stmt = this.db.prepare(`UPDATE outbox SET synced = 1, synced_at = ? WHERE id = ?`);
    this.db.transaction(() => {
      for (const id of ids) stmt.run(now.toISOString(), id);
    })();
  }

  markFailed(ids: readonly number[], error: string): void {
    if (ids.length === 0) return;
    const stmt = this.db.prepare(
      `UPDATE outbox SET attempts = attempts + 1, last_error = ? WHERE id = ?`,
    );
    this.db.transaction(() => {
      for (const id of ids) stmt.run(error, id);
    })();
  }

  /** Permanently rejected by the API: keep for inspection, never retry. */
  markDead(id: number, error: string): void {
    this.db
      .prepare(`UPDATE outbox SET dead = 1, attempts = attempts + 1, last_error = ? WHERE id = ?`)
      .run(error, id);
  }

  stats(): OutboxStats {
    const counts = this.db
      .prepare(
        `SELECT
           SUM(CASE WHEN synced = 0 AND dead = 0 THEN 1 ELSE 0 END) AS pending,
           SUM(CASE WHEN synced = 1 THEN 1 ELSE 0 END) AS synced,
           SUM(CASE WHEN dead = 1 THEN 1 ELSE 0 END) AS dead,
           MIN(CASE WHEN synced = 0 AND dead = 0 THEN recorded_at END) AS oldest
         FROM outbox`,
      )
      .get() as {
      pending: number | null;
      synced: number | null;
      dead: number | null;
      oldest: string | null;
    };
    const last = this.db
      .prepare(
        `SELECT last_error FROM outbox WHERE last_error IS NOT NULL AND synced = 0 ORDER BY id DESC LIMIT 1`,
      )
      .get() as { last_error: string } | undefined;
    return {
      pending: counts.pending ?? 0,
      synced: counts.synced ?? 0,
      dead: counts.dead ?? 0,
      oldestPendingAt: counts.oldest,
      lastError: last?.last_error ?? null,
    };
  }

  /** Bounds the file size: synced rows older than `maxAgeMs` are deleted. */
  purgeSynced(maxAgeMs: number, now: Date = new Date()): number {
    const cutoff = new Date(now.getTime() - maxAgeMs).toISOString();
    return this.db.prepare(`DELETE FROM outbox WHERE synced = 1 AND synced_at < ?`).run(cutoff)
      .changes;
  }

  close(): void {
    this.db.close();
  }
}
