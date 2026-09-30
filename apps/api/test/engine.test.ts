import type { AlertEvent, IncidentDto, IngestResult, WsMessage } from '@simu/shared-types';
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
  type WsTestClient,
} from './helpers.js';

/** Scenarios 2 and 4 of docs/escenarios-demo.md, end to end against PostGIS. */
describe.skipIf(!hasTestDb)('rules engine (scenarios 2 and 4)', () => {
  let t: TestContext;
  let tok: Record<DemoRole, string>;
  let ws: WsTestClient;
  // Seconds after the seed: the seed's last reading is 'now', and an older reading would
  // (correctly) never overwrite the current level.
  const start = Date.now() + 1000;
  const at = (seconds: number) => new Date(start + seconds * 1000).toISOString();

  beforeAll(async () => {
    t = await createTestApp();
    tok = await tokensFor(t.app);
    ws = await connectWs(t.app, tok.operator);
    for (const channel of ['alerts', 'incidents', 'camera-events']) {
      ws.ws.send(JSON.stringify({ subscribe: channel }));
      await ws.next((m) => isControl('subscribed')(m) && 'channel' in m && m.channel === channel);
    }
  });
  afterAll(async () => {
    ws?.close();
    await t?.close();
  });

  const reading = (value: number, recorded_at: string) =>
    t.app.inject({
      method: 'POST',
      url: '/drains/DRAIN-001/readings',
      headers: { 'x-device-key': DEVICE_KEY },
      payload: { device_code: 'DRAIN-001', value, unit: 'percent', recorded_at },
    });

  const ingest = (events: unknown[]) =>
    t.app.inject({
      method: 'POST',
      url: '/events/ingest',
      headers: { 'x-device-key': DEVICE_KEY },
      payload: { events },
    });

  const engineIncidents = () =>
    t.prisma.incident.findMany({
      where: {
        device: { deviceCode: 'DRAIN-001' },
        metadata: { path: ['source'], equals: 'rules_engine' },
      },
      include: { events: { orderBy: { id: 'asc' } } },
    });

  const alerts = () =>
    ws.received.filter(isData('alerts')).map((m) => (m as WsMessage<AlertEvent>).data);

  it('scenario 2: 42 % and 71 % raise nothing; 88 % raises an ALERTA', async () => {
    expect((await reading(42, at(0))).statusCode).toBe(201);
    expect((await reading(71, at(3))).statusCode).toBe(201);
    expect(await engineIncidents()).toHaveLength(0);

    const res = await reading(88, at(6));
    expect(res.json().drain).toMatchObject({ obstruction_level: 88, status: 'alert' });

    const [incident, ...rest] = await engineIncidents();
    expect(rest).toHaveLength(0);
    expect(incident).toMatchObject({
      type: 'drain_obstruction',
      priority: 'medium',
      status: 'pending',
    });

    const alert = (await ws.next(isData('alerts', 'created'))) as WsMessage<AlertEvent>;
    expect(alert.data).toMatchObject({
      label: 'ALERTA',
      priority: 'medium',
      device_code: 'DRAIN-001',
      source: 'rules_engine',
      rule_name: 'Coladera sobre 80 %',
      facts: { 'drain.obstruction_level': 88 },
    });
  });

  it('a further reading at the same risk level changes nothing (no alert spam)', async () => {
    const before = alerts().length;
    await reading(89, at(7));
    const [incident] = await engineIncidents();
    expect(incident?.events.map((e) => e.eventType)).toEqual(['created']);
    expect(alerts()).toHaveLength(before);
  });

  it('rain in another zone does not escalate DRAIN-001', async () => {
    const res = await ingest([
      {
        type: 'weather',
        device_code: 'GW-001',
        raining: true,
        zone: 'ZONE-003',
        recorded_at: at(8),
      },
    ]);
    expect(res.json<IngestResult>().accepted).toBe(1);
    const [incident] = await engineIncidents();
    expect(incident?.priority).toBe('medium');
  });

  it('scenario 4a: rain in the drain zone → RIESGO ALTO (same incident, escalated)', async () => {
    await ingest([
      {
        type: 'weather',
        device_code: 'GW-001',
        raining: true,
        intensity_mm_h: 22,
        zone: 'ZONE-001',
        recorded_at: at(9),
      },
    ]);
    const [incident, ...rest] = await engineIncidents();
    expect(rest).toHaveLength(0);
    expect(incident).toMatchObject({ type: 'flood_risk', priority: 'high' });

    const alert = (await ws.next(isData('alerts', 'escalated'))) as WsMessage<AlertEvent>;
    expect(alert.data).toMatchObject({ label: 'RIESGO ALTO', priority: 'high', kind: 'escalated' });
  });

  it('scenario 4b: CAM-001 detects water on the same corner → RIESGO CRÍTICO', async () => {
    const res = await ingest([
      {
        type: 'camera_event',
        device_id: 'CAM-001',
        event_type: 'WATER_ACCUMULATION',
        confidence: 0.92,
        location_id: 'ZONE-001',
        priority: 'HIGH',
        recorded_at: at(10),
      },
    ]);
    expect(res.json<IngestResult>().results[0]?.status).toBe('accepted');

    // The detection itself becomes a water_accumulation incident on the camera...
    const camera = await t.prisma.incident.findFirstOrThrow({
      where: { device: { deviceCode: 'CAM-001' }, type: 'water_accumulation' },
    });
    expect(camera).toMatchObject({ priority: 'high', status: 'pending' });
    expect(camera.confidence.toNumber()).toBe(0.92);

    // ...and the drain's risk incident escalates to critical.
    const [incident, ...rest] = await engineIncidents();
    expect(rest).toHaveLength(0);
    expect(incident).toMatchObject({ type: 'flood_risk', priority: 'critical' });
    expect(incident?.description).toBe(
      'RIESGO CRÍTICO: coladera DRAIN-001 al 89 % con lluvia y agua detectada por cámara',
    );

    const critical = (await ws.next(
      (m) =>
        isData('alerts', 'escalated')(m) &&
        (m as WsMessage<AlertEvent>).data.priority === 'critical',
    )) as WsMessage<AlertEvent>;
    expect(critical.data).toMatchObject({
      label: 'RIESGO CRÍTICO',
      facts: {
        'drain.obstruction_level': 89,
        'weather.raining': true,
        'camera.water_detected': true,
      },
    });

    // Published before the escalation, so read it from the buffer rather than waiting.
    const pushed = ws.received.find(isData('camera-events', 'detected')) as
      WsMessage<{ incident_id: string }> | undefined;
    expect(pushed?.data.incident_id).toBe(camera.id);
  });

  it('keeps a complete audit trail on one incident', async () => {
    const [incident] = await engineIncidents();
    expect(incident?.events.map((e) => e.eventType)).toEqual([
      'created',
      'priority_raised',
      'priority_raised',
    ]);
    expect(incident?.events[1]?.payload).toMatchObject({
      from: 'medium',
      to: 'high',
      label: 'RIESGO ALTO',
    });
    expect(incident?.events[2]?.payload).toMatchObject({
      from: 'high',
      to: 'critical',
      label: 'RIESGO CRÍTICO',
      trigger: { kind: 'camera', device_code: 'CAM-001' },
    });

    const api = await t.app.inject({
      method: 'GET',
      url: `/incidents/${incident?.id}`,
      headers: bearer(tok.operator),
    });
    expect(api.json<IncidentDto>().metadata).toMatchObject({
      source: 'rules_engine',
      label: 'RIESGO CRÍTICO',
    });
  });

  it('never downgrades automatically: resolving is a human decision', async () => {
    await ingest([
      {
        type: 'weather',
        device_code: 'GW-001',
        raining: false,
        zone: 'ZONE-001',
        recorded_at: at(11),
      },
    ]);
    const [incident] = await engineIncidents();
    expect(incident?.priority).toBe('critical');
  });

  it('opens a new risk incident after the previous one is resolved', async () => {
    const [incident] = await engineIncidents();
    // Workflow: a pending incident must be validated before it can be resolved.
    const validated = await t.app.inject({
      method: 'POST',
      url: `/incidents/${incident?.id}/validate`,
      headers: bearer(tok.operator),
    });
    expect(validated.statusCode).toBe(200);
    const resolved = await t.app.inject({
      method: 'POST',
      url: `/incidents/${incident?.id}/resolve`,
      headers: bearer(tok.operator),
      payload: { note: 'Coladera desazolvada' },
    });
    expect(resolved.statusCode).toBe(200);

    await reading(91, at(12));
    const all = await engineIncidents();
    expect(all).toHaveLength(2);
    expect(all.filter((i) => i.status !== 'resolved')).toHaveLength(1);
  });
});

describe.skipIf(!hasTestDb)('rules engine configuration', () => {
  let t: TestContext;
  let tok: Record<DemoRole, string>;
  beforeAll(async () => {
    t = await createTestApp();
    tok = await tokensFor(t.app);
  });
  afterAll(async () => t?.close());

  it('respects disabled rules and edited thresholds', async () => {
    const rules = await t.prisma.rule.findMany({ orderBy: { sortOrder: 'asc' } });
    // Lower the ALERTA threshold to 60 % through the admin API.
    const patch = await t.app.inject({
      method: 'PATCH',
      url: `/rules/${rules[0]?.id}`,
      headers: bearer(tok.admin),
      payload: { conditions: { all: [{ fact: 'drain.obstruction_level', op: 'gt', value: 60 }] } },
    });
    expect(patch.statusCode).toBe(200);

    await t.app.inject({
      method: 'POST',
      url: '/drains/DRAIN-004/readings',
      headers: { 'x-device-key': DEVICE_KEY },
      payload: { value: 65, recorded_at: new Date().toISOString() },
    });
    const created = await t.prisma.incident.findMany({
      where: {
        device: { deviceCode: 'DRAIN-004' },
        metadata: { path: ['source'], equals: 'rules_engine' },
      },
    });
    expect(created).toHaveLength(1);

    // Disable every rule: the engine does nothing.
    await t.prisma.rule.updateMany({ data: { enabled: false } });
    await t.app.inject({
      method: 'POST',
      url: '/drains/DRAIN-003/readings',
      headers: { 'x-device-key': DEVICE_KEY },
      payload: { value: 99, recorded_at: new Date().toISOString() },
    });
    const none = await t.prisma.incident.count({
      where: {
        device: { deviceCode: 'DRAIN-003' },
        metadata: { path: ['source'], equals: 'rules_engine' },
      },
    });
    expect(none).toBe(0);
  });
});
