import type {
  AnalyzeResponse,
  DeviceEventDto,
  IngestResult,
  PaginatedResponse,
  WeatherDto,
} from '@simu/shared-types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bearer,
  createTestApp,
  DEVICE_KEY,
  hasTestDb,
  tokensFor,
  type DemoRole,
  type TestContext,
} from './helpers.js';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

describe.skipIf(!hasTestDb)('camera events', () => {
  let t: TestContext;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  const camera = (overrides: Record<string, unknown>) =>
    t.app.inject({
      method: 'POST',
      url: '/events/ingest',
      headers: { 'x-device-key': DEVICE_KEY },
      payload: {
        events: [
          {
            type: 'camera_event',
            device_id: 'CAM-002',
            event_type: 'ACCIDENT',
            confidence: 0.9,
            recorded_at: minutesAgo(1),
            ...overrides,
          },
        ],
      },
    });

  const accidents = () =>
    t.prisma.incident.findMany({
      where: { device: { deviceCode: 'CAM-002' }, type: 'accident' },
      include: { events: { orderBy: { id: 'asc' } } },
    });

  it('accepts the spec payload and is idempotent on camera + type + recorded_at', async () => {
    const seeded = (await accidents()).length;
    const recorded_at = minutesAgo(2);
    const first = await camera({ recorded_at, location_id: 'ZONE-002', priority: 'HIGH' });
    const again = await camera({ recorded_at, location_id: 'ZONE-002', priority: 'HIGH' });
    expect(first.json<IngestResult>().results[0]?.status).toBe('accepted');
    expect(again.json<IngestResult>().results[0]?.status).toBe('duplicate');
    // The seeded accident (22 min old, outside the dedup window) stays; one new one is added.
    expect(await accidents()).toHaveLength(seeded + 1);
  });

  it('refreshes the open incident when the same camera repeats the detection', async () => {
    const before = await accidents();
    await camera({ confidence: 0.97, recorded_at: minutesAgo(0.5) });
    const after = await accidents();
    expect(after).toHaveLength(before.length);
    const refreshed = after.find((i) => i.events.some((e) => e.eventType === 'redetected'));
    expect(refreshed?.confidence.toNumber()).toBe(0.97);
  });

  it('stores low-confidence detections without creating incidents', async () => {
    const res = await camera({ event_type: 'OBSTACLE', confidence: 0.4 });
    expect(res.json<IngestResult>().accepted).toBe(1);
    const obstacles = await t.prisma.incident.count({
      where: { device: { deviceCode: 'CAM-002' }, type: 'obstacle' },
    });
    expect(obstacles).toBe(0);
  });

  it('flags late (store-and-forward) detections as synced=false and does not act on stale ones', async () => {
    await camera({ event_type: 'INFRASTRUCTURE_FAILURE', recorded_at: minutesAgo(120) });
    const stored = await t.prisma.deviceEvent.findFirstOrThrow({
      where: { eventType: 'INFRASTRUCTURE_FAILURE' },
    });
    expect(stored.synced).toBe(false);
    expect(await t.prisma.incident.count({ where: { type: 'infrastructure_failure' } })).toBe(0);
  });

  it('rejects detections from devices that are not cameras', async () => {
    const res = await camera({ device_id: 'DRAIN-001' });
    const item = res.json<IngestResult>().results[0];
    expect(item?.status).toBe('rejected');
    expect(item?.error).toMatch(/Cámara DRAIN-001/);
  });
});

describe.skipIf(!hasTestDb)('POST /events/ingest (store-and-forward batch)', () => {
  let t: TestContext;
  let tok: Record<DemoRole, string>;
  beforeAll(async () => {
    t = await createTestApp();
    tok = await tokensFor(t.app);
  });
  afterAll(async () => t?.close());

  const ingest = (
    events: unknown[],
    headers: Record<string, string> = { 'x-device-key': DEVICE_KEY },
  ) => t.app.inject({ method: 'POST', url: '/events/ingest', headers, payload: { events } });

  it('processes a mixed backlog in chronological order with per-item results', async () => {
    const res = await ingest([
      { type: 'drain_reading', device_code: 'DRAIN-002', value: 70, recorded_at: minutesAgo(3) },
      { type: 'drain_reading', device_code: 'DRAIN-002', value: 66, recorded_at: minutesAgo(6) },
      { type: 'heartbeat', device_code: 'GW-001', recorded_at: minutesAgo(10) },
      { type: 'heartbeat', device_code: 'GW-001' },
      { type: 'drain_reading', device_code: 'DRAIN-999', value: 10, recorded_at: minutesAgo(2) },
      { type: 'weather', device_code: 'GW-001', raining: false },
    ]);
    expect(res.statusCode).toBe(200);
    const body = res.json<IngestResult>();
    expect(body).toMatchObject({
      received: 6,
      accepted: 4,
      stale: 1,
      rejected: 1,
      failed: 0,
      duplicates: 0,
    });
    expect(body.results.map((r) => r.status)).toEqual([
      'accepted',
      'accepted',
      'stale',
      'accepted',
      'rejected',
      'accepted',
    ]);

    // Both readings are older than the drain's current one (seeded 'now'): stored and flagged
    // as late, but they must not overwrite the fresher level.
    const drain = await t.prisma.drain.findFirstOrThrow({
      where: { device: { deviceCode: 'DRAIN-002' } },
    });
    expect(drain.obstructionLevel).toBe(64);
    const late = await t.prisma.sensorReading.findMany({
      where: {
        device: { deviceCode: 'DRAIN-002' },
        metadata: { path: ['via'], equals: 'events/ingest' },
      },
    });
    expect(late.every((r) => r.synced === false)).toBe(true);
  });

  it('re-sending the same backlog stores nothing twice', async () => {
    const batch = [
      { type: 'drain_reading', device_code: 'DRAIN-003', value: 20, recorded_at: minutesAgo(4) },
      { type: 'weather', device_code: 'GW-001', raining: false, recorded_at: minutesAgo(4) },
    ];
    await ingest(batch);
    const again = await ingest(batch);
    expect(again.json<IngestResult>()).toMatchObject({ accepted: 0, duplicates: 2 });
  });

  it('validates the whole payload shape before processing anything', async () => {
    expect((await ingest([{ type: 'teleport', device_code: 'GW-001' }])).statusCode).toBe(400);
    expect((await ingest([])).statusCode).toBe(400);
    expect(
      (
        await ingest([
          {
            type: 'drain_reading',
            device_code: 'DRAIN-001',
            value: 150,
            recorded_at: minutesAgo(1),
          },
        ])
      ).statusCode,
    ).toBe(400);
  });

  it('requires the device key or a staff token', async () => {
    const event = [{ type: 'heartbeat', device_code: 'GW-001' }];
    expect((await ingest(event, {})).statusCode).toBe(401);
    expect((await ingest(event, bearer(tok.citizen))).statusCode).toBe(403);
    expect((await ingest(event, bearer(tok.operator))).statusCode).toBe(200);
  });

  it('lists stored events with filters (GET /events)', async () => {
    const all = await t.app.inject({
      method: 'GET',
      url: '/events',
      headers: bearer(tok.operator),
    });
    const body = all.json<PaginatedResponse<DeviceEventDto>>();
    expect(body.meta.total).toBeGreaterThanOrEqual(2);
    expect(body.data.every((e) => e.event_type === 'WEATHER')).toBe(true);

    const byDevice = await t.app.inject({
      method: 'GET',
      url: '/events?device_id=CAM-001&type=WATER_ACCUMULATION',
      headers: bearer(tok.operator),
    });
    expect(byDevice.json<PaginatedResponse<DeviceEventDto>>().meta.total).toBe(0);
    expect(
      (await t.app.inject({ method: 'GET', url: '/events', headers: bearer(tok.citizen) }))
        .statusCode,
    ).toBe(403);
  });

  it('reports the current weather (GET /weather)', async () => {
    await ingest([{ type: 'weather', device_code: 'GW-001', raining: true, intensity_mm_h: 12 }]);
    const res = await t.app.inject({
      method: 'GET',
      url: '/weather',
      headers: bearer(tok.citizen),
    });
    expect(res.json<{ data: WeatherDto }>().data).toMatchObject({
      raining: true,
      intensity_mm_h: 12,
      device_code: 'GW-001',
    });
  });
});

describe.skipIf(!hasTestDb)('POST /ai/analyze', () => {
  let t: TestContext;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  const analyze = (payload: Record<string, unknown>) =>
    t.app.inject({
      method: 'POST',
      url: '/ai/analyze',
      headers: { 'x-device-key': DEVICE_KEY },
      payload,
    });

  it('uses the internal mock and ingests the detection (scenario 3)', async () => {
    const res = await analyze({ device_id: 'CAM-003', hint: 'OBSTACLE' });
    expect(res.statusCode).toBe(200);
    const body = res.json<AnalyzeResponse>();
    expect(body.detection).toMatchObject({
      device_id: 'CAM-003',
      event_type: 'OBSTACLE',
      location_id: 'ZONE-003',
      priority: 'MEDIUM',
      backend: 'mock',
    });
    expect(body.detection.confidence).toBeGreaterThanOrEqual(0.85);
    expect(body.ingested?.status).toBe('accepted');

    const incident = await t.prisma.incident.findUniqueOrThrow({
      where: { id: body.ingested!.incident_id! },
    });
    expect(incident).toMatchObject({ type: 'obstacle', status: 'pending' });
  });

  it('can analyze without ingesting', async () => {
    const res = await analyze({ device_id: 'CAM-003', hint: 'ACCIDENT', ingest: false });
    expect(res.json<AnalyzeResponse>().ingested).toBeNull();
    expect(
      await t.prisma.incident.count({
        where: { device: { deviceCode: 'CAM-003' }, type: 'accident' },
      }),
    ).toBe(0);
  });

  it('only analyzes known cameras', async () => {
    expect((await analyze({ device_id: 'DRAIN-001' })).statusCode).toBe(400);
    expect((await analyze({ device_id: 'CAM-999' })).statusCode).toBe(404);
  });
});

describe.skipIf(!hasTestDb)('POST /ai/analyze with ai-service down', () => {
  let t: TestContext;
  beforeAll(async () => {
    // Nothing listens on port 9: the proxy must fall back to the mock.
    t = await createTestApp({ AI_SERVICE_URL: 'http://127.0.0.1:9' });
  });
  afterAll(async () => t?.close());

  it('falls back to the mock', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/ai/analyze',
      headers: { 'x-device-key': DEVICE_KEY },
      payload: { device_id: 'CAM-001', hint: 'WATER_ACCUMULATION', ingest: false },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<AnalyzeResponse>().detection.backend).toBe('mock-fallback');
  });
});
