import type {
  DeviceDto,
  DeviceStatusEvent,
  DrainReadingEvent,
  GeoJsonFeatureCollection,
  ReadingIngestResult,
  ReadingSeriesPoint,
  SensorReadingDto,
  WsMessage,
} from '@simu/shared-types';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bearer,
  connectWs,
  createTestApp,
  DEVICE_KEY,
  hasTestDb,
  isControl,
  isData,
  tokensFor,
  type DemoRole,
  type TestContext,
} from './helpers.js';

describe.skipIf(!hasTestDb)('devices, cameras, drains', () => {
  let t: TestContext;
  let tok: Record<DemoRole, string>;
  beforeAll(async () => {
    t = await createTestApp();
    tok = await tokensFor(t.app);
  });
  afterAll(async () => t?.close());

  const get = (url: string, role: DemoRole = 'operator') =>
    t.app.inject({ method: 'GET', url, headers: bearer(tok[role]) });

  it('lists all 11 seeded devices, filterable by type', async () => {
    const all = await get('/devices');
    expect(all.statusCode).toBe(200);
    expect(all.json<{ data: DeviceDto[] }>().data).toHaveLength(11);

    const lights = await get('/devices?type=traffic_light,gateway');
    const codes = lights.json<{ data: DeviceDto[] }>().data.map((d) => d.device_code);
    expect(codes).toEqual(['GW-001', 'TL-001', 'TL-002']);
  });

  it('returns GeoJSON for the map', async () => {
    const res = await get('/devices?format=geojson');
    const fc = res.json<GeoJsonFeatureCollection>();
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features).toHaveLength(11);
    expect(fc.features[0]?.geometry.coordinates[0]).toBeLessThan(-99);
  });

  it('keeps device internals away from citizens', async () => {
    expect((await get('/devices', 'citizen')).statusCode).toBe(403);
    expect((await get('/drains', 'citizen')).statusCode).toBe(403);
  });

  it('serves cameras and drains with their sub-records', async () => {
    const cam = (await get('/cameras/CAM-001')).json<DeviceDto>();
    expect(cam.camera?.model).toMatch(/Ray-Ban Meta/);

    const drain = (await get('/drains/DRAIN-001')).json<DeviceDto>();
    expect(drain.drain).toMatchObject({ obstruction_level: 35, status: 'normal' });

    expect((await get('/cameras/DRAIN-001')).statusCode).toBe(404);
    expect((await get('/devices/NOPE-999')).statusCode).toBe(404);
    expect((await get('/devices/bad code')).statusCode).toBe(400);
  });

  it('returns the last 24 h of seeded readings', async () => {
    const res = await get('/drains/DRAIN-003/readings');
    const readings = res.json<{ data: SensorReadingDto[] }>().data;
    expect(readings.length).toBeGreaterThanOrEqual(47);
    expect(readings.at(-1)?.value).toBe(12);
  });

  it('returns the most recent N readings (oldest → newest) when the window exceeds the limit', async () => {
    const res = await get('/drains/DRAIN-003/readings?limit=5');
    const readings = res.json<{ data: SensorReadingDto[] }>().data;
    expect(readings).toHaveLength(5);
    expect(readings.at(-1)?.value).toBe(12);
    const times = readings.map((r) => Date.parse(r.recorded_at));
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });

  it('aggregates a 24 h series in Postgres for sparklines', async () => {
    const res = await get('/drains/DRAIN-003/readings/series?hours=24&bucket_min=30');
    expect(res.statusCode).toBe(200);
    const series = res.json<{ data: ReadingSeriesPoint[] }>().data;
    expect(series.length).toBeGreaterThanOrEqual(47);
    expect(series.length).toBeLessThanOrEqual(49);
    expect(series.at(-1)).toMatchObject({ avg: 12, max: 12 });
    expect(series.every((p) => p.n >= 1 && p.max >= p.avg)).toBe(true);
    expect((await get('/drains/DRAIN-003/readings/series?bucket_min=0')).statusCode).toBe(400);
  });

  it('changes device status and broadcasts devices:status', async () => {
    const client = await connectWs(t.app, tok.operator);
    client.ws.send(JSON.stringify({ subscribe: 'devices:status' }));
    await client.next(isControl('subscribed'));

    const res = await t.app.inject({
      method: 'PATCH',
      url: '/devices/TL-002/status',
      headers: bearer(tok.maintenance),
      payload: { status: 'maintenance', reason: 'cambio de lámpara' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<DeviceDto>().status).toBe('maintenance');

    const msg = (await client.next(isData('devices:status'))) as WsMessage<DeviceStatusEvent>;
    expect(msg.data).toMatchObject({
      device_code: 'TL-002',
      status: 'maintenance',
      previous_status: 'online',
      reason: 'cambio de lámpara',
    });
    client.close();
  });

  it('keeps maintenance status when a heartbeat arrives, then resumes online', async () => {
    const hb = await t.app.inject({
      method: 'POST',
      url: '/devices/TL-002/heartbeat',
      headers: { 'x-device-key': DEVICE_KEY },
    });
    expect(hb.statusCode).toBe(200);
    expect(hb.json().status).toBe('maintenance');

    await t.app.inject({
      method: 'PATCH',
      url: '/devices/TL-002/status',
      headers: bearer(tok.operator),
      payload: { status: 'online' },
    });
    const beats = await t.prisma.heartbeat.count({ where: { device: { deviceCode: 'TL-002' } } });
    expect(beats).toBe(1);
  });

  it('marks a camera degraded from its heartbeat and mirrors cameras.status', async () => {
    const hb = await t.app.inject({
      method: 'POST',
      url: '/devices/CAM-004/heartbeat',
      headers: { 'x-device-key': DEVICE_KEY },
      payload: { status: 'degraded', health: { visibility: 'low' } },
    });
    expect(hb.json().status).toBe('degraded');
    const cam = (await get('/cameras/CAM-004')).json<DeviceDto>();
    expect(cam.status).toBe('degraded');
    expect(cam.camera?.status).toBe('degraded');
    expect(cam.metadata.last_health).toEqual({ visibility: 'low' });
  });

  it('rejects heartbeats without a valid device key or staff token', async () => {
    const none = await t.app.inject({ method: 'POST', url: '/devices/CAM-001/heartbeat' });
    const wrong = await t.app.inject({
      method: 'POST',
      url: '/devices/CAM-001/heartbeat',
      headers: { 'x-device-key': 'nope' },
    });
    const citizen = await t.app.inject({
      method: 'POST',
      url: '/devices/CAM-001/heartbeat',
      headers: bearer(tok.citizen),
    });
    expect([none.statusCode, wrong.statusCode, citizen.statusCode]).toEqual([401, 401, 403]);
  });

  describe('drain readings ingest', () => {
    // Set after the suite's seed ran: newer than the seed's last reading, so the first post
    // updates the drain.
    let base = 0;
    beforeAll(() => {
      base = Date.now() + 1000;
    });
    const at = (offsetMs: number) => new Date(base + offsetMs).toISOString();
    const post = (payload: InjectOptions['payload']) =>
      t.app.inject({
        method: 'POST',
        url: '/drains/DRAIN-001/readings',
        headers: { 'x-device-key': DEVICE_KEY },
        payload,
      });

    it('accepts the spec payload, updates the drain and broadcasts', async () => {
      const client = await connectWs(t.app, tok.operator);
      client.ws.send(JSON.stringify({ subscribe: 'drain-readings' }));
      await client.next(isControl('subscribed'));

      const res = await post({
        device_code: 'DRAIN-001',
        value: 88,
        unit: 'percent',
        recorded_at: at(0),
      });
      expect(res.statusCode).toBe(201);
      expect(res.json<ReadingIngestResult>()).toMatchObject({
        inserted: 1,
        duplicates: 0,
        drain: { obstruction_level: 88, status: 'alert' },
      });

      const msg = (await client.next(isData('drain-readings'))) as WsMessage<DrainReadingEvent>;
      expect(msg.data).toMatchObject({
        device_code: 'DRAIN-001',
        value: 88,
        drain_status: 'alert',
      });
      client.close();
    });

    it('is idempotent: the same reading twice is stored once', async () => {
      const res = await post({ value: 88, recorded_at: at(0) });
      expect(res.statusCode).toBe(200);
      expect(res.json<ReadingIngestResult>()).toMatchObject({ inserted: 0, duplicates: 1 });
    });

    it('stores a late store-and-forward batch without overwriting the newer level', async () => {
      const res = await post({
        readings: [
          { value: 42, recorded_at: at(-30_000), synced: false },
          { value: 71, recorded_at: at(-20_000), synced: false },
          { value: 88, recorded_at: at(0) },
        ],
      });
      expect(res.json<ReadingIngestResult>()).toMatchObject({
        received: 3,
        inserted: 2,
        duplicates: 1,
        drain: { obstruction_level: 88 },
      });
      const late = await t.prisma.sensorReading.findMany({
        where: { device: { deviceCode: 'DRAIN-001' }, synced: false },
      });
      expect(late.map((r) => r.value.toNumber()).sort()).toEqual([42, 71]);
    });

    it('rejects invalid readings', async () => {
      expect((await post({ value: 140, recorded_at: at(0) })).statusCode).toBe(400);
      expect((await post({ value: 50, recorded_at: 'ayer' })).statusCode).toBe(400);
      expect(
        (await post({ value: 50, recorded_at: new Date(Date.now() + 3_600_000).toISOString() }))
          .statusCode,
      ).toBe(400);
      expect(
        (await post({ device_code: 'DRAIN-002', value: 50, recorded_at: at(1) })).statusCode,
      ).toBe(400);
      const cam = await t.app.inject({
        method: 'POST',
        url: '/drains/CAM-001/readings',
        headers: { 'x-device-key': DEVICE_KEY },
        payload: { value: 50, recorded_at: at(1) },
      });
      expect(cam.statusCode).toBe(404);
    });
  });
});
