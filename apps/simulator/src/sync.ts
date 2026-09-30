import type { IngestEvent } from '@simu/shared-types';
import { HttpError, NetworkDownError, type IngestSender } from './api-client.js';
import type { Outbox, OutboxItem } from './store.js';

export interface SyncOptions {
  batchSize: number;
  /** Delay between runs while healthy. */
  intervalMs: number;
  /** First retry delay; doubles on every consecutive failure. */
  backoffBaseMs: number;
  backoffMaxMs: number;
  /** An item is reported as synced=false if it waited longer than this (or was retried). */
  lateAfterMs: number;
  now?: () => number;
  /** 0..1; injectable so tests get deterministic jitter. */
  random?: () => number;
}

export interface SyncStatus {
  running: boolean;
  lastRunAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
  consecutiveFailures: number;
  nextRunInMs: number;
  totalSent: number;
  totalDead: number;
}

export type RunResult = 'idle' | 'synced' | 'failed';

type Logger = { info(obj: object, msg: string): void; warn(obj: object, msg: string): void };

/** Only types whose schema carries `synced`. */
const CARRIES_SYNCED: ReadonlySet<IngestEvent['type']> = new Set([
  'drain_reading',
  'camera_event',
  'weather',
]);

/**
 * Ships the outbox to the API (spec §6.1):
 * - FIFO batches; each item's own result decides synced / dead / retry
 * - network or server failure → items stay pending, retry with exponential backoff + jitter
 * - HTTP 400 on a batch → retry one item at a time to isolate the poison item
 */
export class SyncWorker {
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private inFlight: Promise<RunResult> | null = null;
  private isolate = false;
  private nextRunAt = 0;
  private readonly status: Omit<SyncStatus, 'nextRunInMs' | 'running'> = {
    lastRunAt: null,
    lastSuccessAt: null,
    lastFailureAt: null,
    lastError: null,
    consecutiveFailures: 0,
    totalSent: 0,
    totalDead: 0,
  };

  constructor(
    private readonly outbox: Outbox,
    private readonly send: IngestSender,
    private readonly opts: SyncOptions,
    private readonly log?: Logger,
  ) {}

  private now(): number {
    return (this.opts.now ?? Date.now)();
  }

  getStatus(): SyncStatus {
    return {
      ...this.status,
      running: this.running,
      nextRunInMs: Math.max(0, this.nextRunAt - this.now()),
    };
  }

  /** Delay before the next run given the current failure streak. */
  delayMs(): number {
    const n = this.status.consecutiveFailures;
    if (n === 0) return this.opts.intervalMs;
    const exp = Math.min(this.opts.backoffMaxMs, this.opts.backoffBaseMs * 2 ** (n - 1));
    const jitter = 0.8 + 0.4 * (this.opts.random ?? Math.random)(); // ±20 %
    return Math.round(exp * jitter);
  }

  private toWire(item: OutboxItem): IngestEvent {
    if (!CARRIES_SYNCED.has(item.kind)) return item.payload;
    const late =
      item.attempts > 0 || this.now() - new Date(item.createdAt).getTime() > this.opts.lateAfterMs;
    return { ...item.payload, synced: !late } as IngestEvent;
  }

  /** One sync attempt. Never throws. */
  runOnce(): Promise<RunResult> {
    this.inFlight ??= this.doRun().finally(() => {
      this.inFlight = null;
    });
    return this.inFlight;
  }

  private async doRun(): Promise<RunResult> {
    this.status.lastRunAt = new Date(this.now()).toISOString();
    const batch = this.outbox.nextBatch(this.isolate ? 1 : this.opts.batchSize);
    if (batch.length === 0) {
      this.isolate = false;
      return 'idle';
    }
    const ids = batch.map((i) => i.id);

    try {
      const result = await this.send(batch.map((i) => this.toWire(i)));
      const synced: number[] = [];
      const retry: number[] = [];
      let retryError = '';
      for (const r of result.results) {
        const item = batch[r.index];
        if (!item) continue;
        if (r.status === 'rejected') {
          this.outbox.markDead(item.id, r.error ?? 'rechazado por la API');
          this.status.totalDead += 1;
        } else if (r.status === 'failed') {
          // Server-side error on this event: keep it pending, never dead-letter it.
          retry.push(item.id);
          retryError = r.error ?? 'error del servidor';
        } else {
          synced.push(item.id); // accepted, duplicate (already stored) or stale (acknowledged)
        }
      }
      this.outbox.markSynced(synced);
      this.status.totalSent += synced.length;
      if (retry.length > 0) {
        this.outbox.markFailed(retry, retryError);
        return this.backOff(retryError);
      }
      this.status.consecutiveFailures = 0;
      this.status.lastError = null;
      this.status.lastSuccessAt = new Date(this.now()).toISOString();
      if (this.isolate && batch.length === 1) this.isolate = false;
      return 'synced';
    } catch (err) {
      if (err instanceof HttpError && err.status === 400) {
        if (batch.length === 1) {
          // The single item is malformed: dead-letter it, keep the queue moving.
          const only = batch[0]!;
          this.outbox.markDead(only.id, err.message);
          this.status.totalDead += 1;
          this.isolate = false;
          return 'synced';
        }
        this.isolate = true; // retry item by item to find the poison one
        return 'failed';
      }
      const message =
        err instanceof NetworkDownError || err instanceof HttpError
          ? err.message
          : `Servidor no disponible: ${(err as Error).message}`;
      this.outbox.markFailed(ids, message);
      return this.backOff(message);
    }
  }

  private backOff(message: string): RunResult {
    this.status.consecutiveFailures += 1;
    this.status.lastError = message;
    this.status.lastFailureAt = new Date(this.now()).toISOString();
    if (this.status.consecutiveFailures === 1) {
      this.log?.warn(
        { pending: this.outbox.stats().pending, error: message },
        'sync failed, backing off',
      );
    }
    return 'failed';
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.schedule(0); // on start: ship whatever was pending from the previous run
  }

  /** Runs as soon as possible (e.g. right after connectivity returns). */
  kick(): void {
    if (!this.running) return;
    this.status.consecutiveFailures = 0;
    this.schedule(0);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  /** Single timer: kick() replaces the pending one, so two loops never run at once. */
  private schedule(delay: number): void {
    if (!this.running) return;
    if (this.timer) clearTimeout(this.timer);
    this.nextRunAt = this.now() + delay;
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.tick();
    }, delay);
  }

  private async tick(): Promise<void> {
    const result = await this.runOnce();
    if (!this.running || this.timer) return; // stopped, or kicked while running
    // While a backlog remains keep draining immediately; otherwise wait (or back off).
    const backlog = result === 'synced' && this.outbox.stats().pending > 0;
    this.schedule(backlog ? 0 : this.delayMs());
  }
}
