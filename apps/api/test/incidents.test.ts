import type {
  GeoJsonFeatureCollection,
  IncidentDto,
  IncidentEventDto,
  PaginatedResponse,
  WsMessage,
} from '@simu/shared-types';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bearer,
  connectWs,
  createTestApp,
  DEMO,
  hasTestDb,
  isControl,
  isData,
  tokensFor,
  type DemoRole,
  type TestContext,
} from './helpers.js';

const ROMA_NORTE = { latitude: 19.4178, longitude: -99.1601 };

describe.skipIf(!hasTestDb)('incidents', () => {
  let t: TestContext;
  let tok: Record<DemoRole, string>;
  let maintenanceId: string;

  beforeAll(async () => {
    t = await createTestApp();
    tok = await tokensFor(t.app);
    maintenanceId = (await t.prisma.user.findUniqueOrThrow({ where: { email: DEMO.maintenance } }))
      .id;
  });
  afterAll(async () => t?.close());

  const req = (
    method: 'GET' | 'POST' | 'PATCH',
    url: string,
    role: DemoRole,
    payload?: InjectOptions['payload'],
  ) =>
    t.app.inject({
      method,
      url,
      headers: bearer(tok[role]),
      ...(payload !== undefined && { payload }),
    });

  it('lists the 5 seeded incidents with pagination metadata', async () => {
    const res = await req('GET', '/incidents?page_size=2', 'operator');
    const body = res.json<PaginatedResponse<IncidentDto>>();
    expect(body.meta).toEqual({ page: 1, page_size: 2, total: 5 });
    expect(body.data).toHaveLength(2);
  });

  it('filters by status, type, priority and bbox', async () => {
    const pending = await req('GET', '/incidents?status=pending', 'operator');
    expect(pending.json<PaginatedResponse<IncidentDto>>().meta.total).toBe(2);

    const coyoacan = await req('GET', '/incidents?bbox=-99.170,19.344,-99.156,19.354', 'operator');
    const items = coyoacan.json<PaginatedResponse<IncidentDto>>().data;
    expect(items.map((i) => i.type)).toEqual(['obstacle']);

    const bad = await req('GET', '/incidents?bbox=1,2,3', 'operator');
    expect(bad.statusCode).toBe(400);
    const badEnum = await req('GET', '/incidents?priority=urgent', 'operator');
    expect(badEnum.statusCode).toBe(400);
  });

  it('searches descriptions case-insensitively', async () => {
    const res = await req('GET', '/incidents?q=MOTOCICLETA', 'operator');
    const items = res.json<PaginatedResponse<IncidentDto>>().data;
    expect(items.map((i) => i.type)).toEqual(['accident']);
  });

  it('lists assignable maintenance staff (id and name only) for operators', async () => {
    const res = await req('GET', '/users/assignees', 'operator');
    expect(res.statusCode).toBe(200);
    const list = res.json<{ data: Array<Record<string, unknown>> }>().data;
    expect(list).toEqual([{ id: maintenanceId, name: 'Mantenimiento Demo' }]);
    expect((await req('GET', '/users/assignees', 'maintenance')).statusCode).toBe(403);
    expect((await req('GET', '/users/assignees', 'citizen')).statusCode).toBe(403);
  });

  it('sorts by priority, most severe first', async () => {
    const res = await req('GET', '/incidents?sort=-priority', 'operator');
    const priorities = res.json<PaginatedResponse<IncidentDto>>().data.map((i) => i.priority);
    expect(priorities[0]).toBe('high');
    expect(priorities.at(-1)).toBe('low');
  });

  it('returns incidents assigned to the maintenance user with assigned_to=me', async () => {
    const res = await req('GET', '/incidents?assigned_to=me', 'maintenance');
    const items = res.json<PaginatedResponse<IncidentDto>>().data;
    expect(items).toHaveLength(1);
    expect(items[0]?.assigned_to?.id).toBe(maintenanceId);
  });

  it('serves GeoJSON', async () => {
    const res = await req('GET', '/incidents?format=geojson&status=pending,validated', 'citizen');
    expect(res.json<GeoJsonFeatureCollection>().features.length).toBe(4);
  });

  it('runs the full lifecycle: citizen report → validate → assign → start → resolve', async () => {
    const client = await connectWs(t.app, tok.citizen);
    client.ws.send(JSON.stringify({ subscribe: 'incidents' }));
    await client.next(isControl('subscribed'));

    // Citizens cannot set priority or confidence.
    const created = await req('POST', '/incidents', 'citizen', {
      type: 'accessibility_block',
      description: 'Auto estacionado sobre la rampa de la esquina',
      priority: 'critical',
      confidence: 0.1,
      ...ROMA_NORTE,
    });
    expect(created.statusCode).toBe(201);
    const incident = created.json<IncidentDto>();
    expect(incident).toMatchObject({ status: 'pending', priority: 'medium', confidence: 1 });
    expect(incident.metadata.source).toBe('citizen_report');

    const pushed = (await client.next(isData('incidents', 'created'))) as WsMessage<IncidentDto>;
    expect(pushed.data.id).toBe(incident.id);

    const validated = await req('POST', `/incidents/${incident.id}/validate`, 'operator');
    expect(validated.json<IncidentDto>()).toMatchObject({ status: 'validated' });
    expect(validated.json<IncidentDto>().validated_at).not.toBeNull();

    const assigned = await req('POST', `/incidents/${incident.id}/assign`, 'operator', {
      user_id: maintenanceId,
    });
    expect(assigned.json<IncidentDto>()).toMatchObject({
      status: 'assigned',
      assigned_to: { id: maintenanceId, name: 'Mantenimiento Demo' },
    });

    const started = await req('PATCH', `/incidents/${incident.id}`, 'maintenance', {
      status: 'in_progress',
      note: 'Cuadrilla en sitio',
    });
    expect(started.json<IncidentDto>().status).toBe('in_progress');

    const resolved = await req('POST', `/incidents/${incident.id}/resolve`, 'maintenance', {
      note: 'Vehículo retirado',
    });
    expect(resolved.json<IncidentDto>().status).toBe('resolved');
    expect(resolved.json<IncidentDto>().resolved_at).not.toBeNull();

    const changed = (await client.next(
      (m) =>
        isData('incidents', 'status_changed')(m) &&
        (m as WsMessage<IncidentDto>).data.status === 'resolved',
    )) as WsMessage<IncidentDto & { previous_status: string }>;
    expect(changed.data.previous_status).toBe('in_progress');
    client.close();

    const events = await req('GET', `/incidents/${incident.id}/events`, 'operator');
    const log = events.json<{ data: IncidentEventDto[] }>().data;
    expect(log.map((e) => e.event_type)).toEqual([
      'created',
      'validated',
      'assigned',
      'started',
      'resolved',
    ]);
    // Audit trail stores ids and roles, never names or emails.
    expect(JSON.stringify(log)).not.toContain('@simu.local');
    expect(log[3]?.payload).toMatchObject({
      note: 'Cuadrilla en sitio',
      actor: { role: 'maintenance' },
    });
  });

  it('rejects invalid transitions with 409', async () => {
    const [done] = await t.prisma.incident.findMany({ where: { status: 'resolved' }, take: 1 });
    const res = await req('POST', `/incidents/${done?.id}/validate`, 'operator');
    expect(res.statusCode).toBe(409);
    expect(res.json().error.details.status).toBe('resolved');
  });

  it('enforces who may act on an incident', async () => {
    const pending = await t.prisma.incident.findFirstOrThrow({ where: { status: 'pending' } });
    expect((await req('POST', `/incidents/${pending.id}/validate`, 'citizen')).statusCode).toBe(
      403,
    );
    expect((await req('POST', `/incidents/${pending.id}/validate`, 'maintenance')).statusCode).toBe(
      403,
    );
    // Maintenance cannot resolve an incident that is not assigned to them.
    expect((await req('POST', `/incidents/${pending.id}/resolve`, 'maintenance')).statusCode).toBe(
      403,
    );
    // Maintenance cannot edit fields.
    expect(
      (await req('PATCH', `/incidents/${pending.id}`, 'maintenance', { priority: 'high' }))
        .statusCode,
    ).toBe(403);
    // Citizens cannot read the internal event log.
    expect((await req('GET', `/incidents/${pending.id}/events`, 'citizen')).statusCode).toBe(403);
  });

  it('only assigns to active maintenance staff', async () => {
    const operatorId = (await t.prisma.user.findUniqueOrThrow({ where: { email: DEMO.operator } }))
      .id;
    const pending = await t.prisma.incident.findFirstOrThrow({ where: { status: 'pending' } });
    const res = await req('POST', `/incidents/${pending.id}/assign`, 'operator', {
      user_id: operatorId,
    });
    expect(res.statusCode).toBe(400);
  });

  it('records priority changes in the event log', async () => {
    const pending = await t.prisma.incident.findFirstOrThrow({
      where: { status: 'pending', type: 'drain_obstruction' },
    });
    const res = await req('PATCH', `/incidents/${pending.id}`, 'operator', { priority: 'high' });
    expect(res.json<IncidentDto>().priority).toBe('high');
    const last = await t.prisma.incidentEvent.findFirstOrThrow({
      where: { incidentId: pending.id },
      orderBy: { id: 'desc' },
    });
    expect(last.eventType).toBe('priority_changed');
    expect(last.payload).toMatchObject({ changes: { priority: { from: 'low', to: 'high' } } });
  });

  it('validates creation input', async () => {
    const outside = await req('POST', '/incidents', 'operator', {
      type: 'obstacle',
      description: 'Obstáculo en Guadalajara',
      latitude: 20.6597,
      longitude: -103.3496,
    });
    expect(outside.statusCode).toBe(400);

    const short = await req('POST', '/incidents', 'operator', {
      type: 'obstacle',
      description: 'x',
      ...ROMA_NORTE,
    });
    expect(short.json().error.code).toBe('VALIDATION_ERROR');

    const unknownDevice = await req('POST', '/incidents', 'operator', {
      type: 'obstacle',
      description: 'Obstáculo reportado por cámara',
      device_code: 'CAM-999',
      ...ROMA_NORTE,
    });
    expect(unknownDevice.statusCode).toBe(404);

    const notFound = await req(
      'GET',
      '/incidents/00000000-0000-4000-8000-000000000000',
      'operator',
    );
    expect(notFound.statusCode).toBe(404);
  });
});
