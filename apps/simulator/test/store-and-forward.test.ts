import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { IngestEvent, IngestResult } from '@simu/shared-types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Connectivity, HttpError, NetworkDownError, type IngestSender } from '../src/api-client.js';
import { Simulation, toSerialLine } from '../src/simulation.js';
import { Outbox } from '../src/store.js';
import { SyncWorker, type SyncOptions } from '../src/sync.js';

const reading = (value: number, recorded_at: string): IngestEvent => ({
  type: 'drain_reading',
  device_code: 'DRAIN-001',
  value,
  unit: 'percent',
  recorded_at,
});

/** Fake API: records batches; accepts everything unless told otherwise. */
function fakeApi() {
  const received: IngestEvent[][] = [];
  let mode: 'ok' | 'down' | 'http500' | 'http400' = 'ok';
  const rejectIndex = new Set<number>();
  const failIndex = new Set<number>();
  const send: IngestSender = async (events) => {
    if (mode === 'down') throw new NetworkDownError();
    if (mode === 'http500') throw new HttpError(503, 'API respondió 503');
    if (mode === 'http400') throw new HttpError(400, 'API respondió 400');
    received.push(events);
    const result: IngestResult = {
      received: events.length,
      accepted: 0,
      duplicates: 0,
      stale: 0,
      rejected: 0,
      failed: 0,
      results: events.map((e, index) =>
        rejectIndex.has(index)
          ? { index, type: e.type, status: 'rejected', error: 'Dispositivo inexistente' }
          : failIndex.has(index)
            ? {
                index,
                type: e.type,
                status: 'failed',
                error: 'Error interno al procesar el evento',
              }
            : { index, type: e.type, status: 'accepted' },
      ),
    };
    return result;
  };
  return {
    send,
    received,
    setMode: (m: typeof mode) => (mode = m),
    rejectIndex,
    failIndex,
  };
}

const OPTS: SyncOptions = {
  batchSize: 100,
  intervalMs: 2000,
  backoffBaseMs: 1000,
  backoffMaxMs: 60_000,
  lateAfterMs: 15_000,
  random: () => 0.5, // no jitter → deterministic delays
};

describe('Outbox (SQLite simu-gateway.db)', () => {
  let dir: string;
  let file: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'simu-outbox-'));
    file = path.join(dir, 'simu-gateway.db');
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('stores every event with synced = 0 and returns them in FIFO order', () => {
    const box = new Outbox(file);
    box.enqueue(reading(42, '2026-09-29T15:30:00.000Z'));
    box.enqueue(reading(71, '2026-09-29T15:30:05.000Z'));
    const batch = box.nextBatch(10);
    expect(batch.map((b) => (b.payload as { value: number }).value)).toEqual([42, 71]);
    expect(box.stats()).toMatchObject({ pending: 2, synced: 0, dead: 0 });
    box.close();
  });

  it('marks items synced and dead independently', () => {
    const box = new Outbox(file);
    const a = box.enqueue(reading(1, '2026-09-29T15:30:00.000Z'));
    const b = box.enqueue(reading(2, '2026-09-29T15:30:01.000Z'));
    box.markSynced([a]);
    box.markDead(b, 'rechazado');
    expect(box.stats()).toMatchObject({ pending: 0, synced: 1, dead: 1 });
    expect(box.nextBatch(10)).toHaveLength(0);
    box.close();
  });

  it('survives a restart: pending events are still there after reopening the file', () => {
    const first = new Outbox(file);
    first.enqueue(reading(88, '2026-09-29T15:31:00.000Z'));
    first.markFailed([1], 'Sin Internet (simulado)');
    first.close();

    const second = new Outbox(file);
    const [item] = second.nextBatch(10);
    expect(item?.attempts).toBe(1);
    expect(second.stats()).toMatchObject({ pending: 1, lastError: 'Sin Internet (simulado)' });
    second.close();
  });

  it('purges old synced rows but never pending ones', () => {
    const box = new Outbox(file);
    const a = box.enqueue(reading(1, '2026-09-29T15:30:00.000Z'));
    box.enqueue(reading(2, '2026-09-29T15:30:01.000Z'));
    box.markSynced([a], new Date('2026-09-29T15:00:00.000Z'));
    expect(box.purgeSynced(3600_000, new Date('2026-09-29T17:00:00.000Z'))).toBe(1);
    expect(box.stats()).toMatchObject({ pending: 1, synced: 0 });
    box.close();
  });
});

describe('SyncWorker (store-and-forward)', () => {
  let box: Outbox;
  let now: number;
  beforeEach(() => {
    box = new Outbox(':memory:');
    now = Date.parse('2026-09-29T15:30:00.000Z');
  });
  afterEach(() => box.close());

  const worker = (send: IngestSender) => new SyncWorker(box, send, { ...OPTS, now: () => now });

  it('sends pending events and marks them synced on 2xx', async () => {
    const api = fakeApi();
    box.enqueue(reading(42, new Date(now).toISOString()), new Date(now));
    box.enqueue(reading(71, new Date(now + 5000).toISOString()), new Date(now + 5000));
    const w = worker(api.send);

    expect(await w.runOnce()).toBe('synced');
    expect(api.received).toHaveLength(1);
    expect(api.received[0]?.map((e) => (e as { value: number }).value)).toEqual([42, 71]);
    expect(box.stats()).toMatchObject({ pending: 0, synced: 2 });
    expect(await w.runOnce()).toBe('idle');
  });

  it('keeps data locally while offline and backs off exponentially', async () => {
    const api = fakeApi();
    api.setMode('down');
    box.enqueue(reading(55, new Date(now).toISOString()), new Date(now));
    const w = worker(api.send);

    const delays: number[] = [];
    for (let i = 0; i < 8; i++) {
      expect(await w.runOnce()).toBe('failed');
      delays.push(w.delayMs());
    }
    expect(delays).toEqual([1000, 2000, 4000, 8000, 16000, 32000, 60000, 60000]);
    expect(box.stats()).toMatchObject({
      pending: 1,
      synced: 0,
      lastError: 'Sin Internet (simulado)',
    });
    expect(api.received).toHaveLength(0);
  });

  it('recovers when the server comes back: nothing is lost, late items are flagged synced=false', async () => {
    const api = fakeApi();
    api.setMode('http500');
    box.enqueue(reading(55, new Date(now).toISOString()), new Date(now));
    box.enqueue(reading(70, new Date(now + 25_000).toISOString()), new Date(now + 25_000));
    const w = worker(api.send);
    await w.runOnce();
    await w.runOnce();
    expect(w.getStatus().consecutiveFailures).toBe(2);

    api.setMode('ok');
    now += 60_000;
    expect(await w.runOnce()).toBe('synced');
    expect(w.getStatus().consecutiveFailures).toBe(0);
    expect(w.delayMs()).toBe(OPTS.intervalMs);
    expect(box.stats()).toMatchObject({ pending: 0, synced: 2 });
    // Both waited and were retried: the API is told they arrived late.
    expect(api.received[0]?.every((e) => (e as { synced?: boolean }).synced === false)).toBe(true);
  });

  it('reports fresh, first-attempt items as synced=true', async () => {
    const api = fakeApi();
    box.enqueue(reading(40, new Date(now).toISOString()), new Date(now));
    await worker(api.send).runOnce();
    expect((api.received[0]?.[0] as { synced?: boolean }).synced).toBe(true);
  });

  it('moves permanently rejected items to the dead letter without blocking the rest', async () => {
    const api = fakeApi();
    api.rejectIndex.add(1);
    box.enqueue(reading(1, new Date(now).toISOString()), new Date(now));
    box.enqueue(reading(2, new Date(now).toISOString()), new Date(now));
    box.enqueue(reading(3, new Date(now).toISOString()), new Date(now));
    await worker(api.send).runOnce();
    expect(box.stats()).toMatchObject({ pending: 0, synced: 2, dead: 1 });
  });

  it('keeps items that failed on the server pending and retries them with backoff', async () => {
    const api = fakeApi();
    api.failIndex.add(1);
    box.enqueue(reading(1, new Date(now).toISOString()), new Date(now));
    box.enqueue(reading(2, new Date(now).toISOString()), new Date(now));
    const w = worker(api.send);

    expect(await w.runOnce()).toBe('failed');
    expect(box.stats()).toMatchObject({ pending: 1, synced: 1, dead: 0 });
    expect(w.getStatus().consecutiveFailures).toBe(1);

    api.failIndex.clear();
    expect(await w.runOnce()).toBe('synced');
    expect(box.stats()).toMatchObject({ pending: 0, synced: 2, dead: 0 });
    // The retried item is flagged as late: it did not arrive on time.
    expect((api.received[1]?.[0] as { synced?: boolean }).synced).toBe(false);
  });

  it('isolates a poison item when the API rejects the whole batch with 400', async () => {
    const api = fakeApi();
    box.enqueue(reading(1, new Date(now).toISOString()), new Date(now));
    box.enqueue(reading(2, new Date(now).toISOString()), new Date(now));
    const w = worker(api.send);

    api.setMode('http400');
    expect(await w.runOnce()).toBe('failed'); // batch of 2 → switch to one-by-one
    expect(await w.runOnce()).toBe('synced'); // single item still 400 → dead letter
    api.setMode('ok');
    expect(await w.runOnce()).toBe('synced'); // the healthy item goes through
    expect(box.stats()).toMatchObject({ pending: 0, synced: 1, dead: 1 });
  });

  it('drains a large backlog in batches, oldest first', async () => {
    const api = fakeApi();
    for (let i = 0; i < 250; i++)
      box.enqueue(reading(i % 100, new Date(now + i * 5000).toISOString()), new Date(now));
    const w = worker(api.send);
    while ((await w.runOnce()) === 'synced') {
      /* drain */
    }
    expect(api.received.map((b) => b.length)).toEqual([100, 100, 50]);
    expect(box.stats().synced).toBe(250);
  });
});

describe('Connectivity (demo "Internet OFF")', () => {
  it('goes offline for N seconds and comes back by itself', () => {
    let t = 0;
    const net = new Connectivity(() => t);
    net.goOffline(30);
    expect(net.isOnline()).toBe(false);
    t = 12_000;
    expect(net.remainingSeconds()).toBe(18);
    t = 30_000;
    expect(net.isOnline()).toBe(true);
  });
});

describe('Simulation → gateway conversion', () => {
  it('formats the Arduino serial line like the firmware', () => {
    expect(toSerialLine('DRAIN-001', 78.4)).toBe('DRAIN001,78');
  });

  it('produces spec-shaped readings through the serial parser', () => {
    const box = new Outbox(':memory:');
    const sim = new Simulation(box, () => 0.5);
    sim.setDrainLevel('DRAIN-001', 88);
    sim.sampleDrains(new Date('2026-09-29T15:30:00.000Z'));
    const readings = box.nextBatch(10).map((b) => b.payload);
    expect(readings).toHaveLength(4);
    expect(readings[0]).toEqual({
      type: 'drain_reading',
      device_code: 'DRAIN-001',
      value: 88,
      unit: 'percent',
      recorded_at: '2026-09-29T15:30:00.000Z',
    });
    box.close();
  });

  it('keeps unforced drains near their baseline', () => {
    const box = new Outbox(':memory:');
    let r = 0;
    const sim = new Simulation(box, () => ((r = (r + 0.37) % 1), r));
    for (let i = 0; i < 200; i++) sim.sampleDrains();
    for (const d of sim.drains.values()) {
      expect(Math.abs(d.level - d.base)).toBeLessThanOrEqual(6);
    }
    box.close();
  });

  it('sends a heartbeat for all 11 devices, with degraded overrides', () => {
    const box = new Outbox(':memory:');
    const sim = new Simulation(box);
    sim.setHealth('CAM-002', 'degraded');
    sim.sendHeartbeats();
    const beats = box.nextBatch(50).map((b) => b.payload) as Array<{
      device_code: string;
      status: string;
    }>;
    expect(beats).toHaveLength(11);
    expect(beats.find((b) => b.device_code === 'CAM-002')?.status).toBe('degraded');
    box.close();
  });
});
