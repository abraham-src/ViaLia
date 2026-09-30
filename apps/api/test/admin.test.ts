import type {
  AuditLogEntryDto,
  IncidentDto,
  PaginatedResponse,
  RuleDto,
  TokenResponse,
  UserAdminDto,
} from '@simu/shared-types';
import type { InjectOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bearer,
  createTestApp,
  DEMO,
  hasTestDb,
  tokensFor,
  type DemoRole,
  type TestContext,
} from './helpers.js';

describe.skipIf(!hasTestDb)('users administration', () => {
  let t: TestContext;
  let tok: Record<DemoRole, string>;
  beforeAll(async () => {
    t = await createTestApp();
    tok = await tokensFor(t.app);
  });
  afterAll(async () => t?.close());

  const call = (
    method: InjectOptions['method'],
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

  it('lets only admins list users, never exposing password hashes', async () => {
    const res = await call('GET', '/users', 'admin');
    const users = res.json<{ data: UserAdminDto[] }>().data;
    expect(users).toHaveLength(4);
    expect(JSON.stringify(users)).not.toMatch(/password|\$2[aby]\$/);
    for (const role of ['operator', 'maintenance', 'citizen'] as const) {
      expect((await call('GET', '/users', role)).statusCode).toBe(403);
    }
  });

  it('creates a user who can log in, and rejects duplicates and weak passwords', async () => {
    const created = await call('POST', '/users', 'admin', {
      name: 'Cuadrilla Norte',
      email: 'Cuadrilla.Norte@simu.local',
      password: 'segura-2026',
      role: 'maintenance',
    });
    expect(created.statusCode).toBe(201);
    expect(created.json<UserAdminDto>()).toMatchObject({
      email: 'cuadrilla.norte@simu.local',
      role: 'maintenance',
    });

    const login = await t.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'cuadrilla.norte@simu.local', password: 'segura-2026' },
    });
    expect(login.statusCode).toBe(200);

    expect(
      (
        await call('POST', '/users', 'admin', {
          name: 'X',
          email: 'cuadrilla.norte@simu.local',
          password: 'segura-2026',
          role: 'citizen',
        })
      ).statusCode,
    ).toBe(400); // name too short
    expect(
      (
        await call('POST', '/users', 'admin', {
          name: 'Otra',
          email: 'cuadrilla.norte@simu.local',
          password: 'segura-2026',
          role: 'citizen',
        })
      ).statusCode,
    ).toBe(409);
    expect(
      (
        await call('POST', '/users', 'admin', {
          name: 'Otra',
          email: 'otra@simu.local',
          password: '123',
          role: 'citizen',
        })
      ).statusCode,
    ).toBe(400);
  });

  it('new maintenance staff appear as assignees', async () => {
    const res = await call('GET', '/users/assignees', 'operator');
    expect(res.json<{ data: Array<{ name: string }> }>().data.map((u) => u.name)).toContain(
      'Cuadrilla Norte',
    );
  });

  it('changing the role revokes open sessions', async () => {
    const login = await t.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'cuadrilla.norte@simu.local', password: 'segura-2026' },
    });
    const { refresh_token } = login.json<TokenResponse>();
    const list = await call('GET', '/users?q=cuadrilla', 'admin');
    const user = list.json<{ data: UserAdminDto[] }>().data[0]!;

    const patched = await call('PATCH', `/users/${user.id}`, 'admin', { role: 'operator' });
    expect(patched.json<UserAdminDto>().role).toBe('operator');

    const refresh = await t.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token },
    });
    expect(refresh.statusCode).toBe(401);
  });

  it('deactivates (soft delete) and blocks login', async () => {
    const user = (await call('GET', '/users?q=cuadrilla', 'admin')).json<{ data: UserAdminDto[] }>()
      .data[0]!;
    expect((await call('DELETE', `/users/${user.id}`, 'admin')).statusCode).toBe(204);
    const after = (await call('GET', `/users?q=cuadrilla`, 'admin')).json<{
      data: UserAdminDto[];
    }>().data[0]!;
    expect(after.status).toBe('inactive');
    const login = await t.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'cuadrilla.norte@simu.local', password: 'segura-2026' },
    });
    expect(login.statusCode).toBe(401);
  });

  it('prevents admins from locking themselves out', async () => {
    const me = (await call('GET', `/users?q=${encodeURIComponent(DEMO.admin)}`, 'admin')).json<{
      data: UserAdminDto[];
    }>().data[0]!;
    expect((await call('PATCH', `/users/${me.id}`, 'admin', { role: 'citizen' })).statusCode).toBe(
      409,
    );
    expect(
      (await call('PATCH', `/users/${me.id}`, 'admin', { status: 'suspended' })).statusCode,
    ).toBe(409);
    expect((await call('DELETE', `/users/${me.id}`, 'admin')).statusCode).toBe(409);
  });
});

describe.skipIf(!hasTestDb)('rules CRUD', () => {
  let t: TestContext;
  let tok: Record<DemoRole, string>;
  beforeAll(async () => {
    t = await createTestApp();
    tok = await tokensFor(t.app);
  });
  afterAll(async () => t?.close());

  const rule = {
    name: 'Coladera sobre 95 %',
    description: 'SI coladera > 95% ENTONCES RIESGO CRÍTICO',
    sort_order: 40,
    conditions: { all: [{ fact: 'drain.obstruction_level', op: 'gt', value: 95 }] },
    action: {
      incident_type: 'drain_obstruction',
      set_priority: 'critical',
      emit_alert: true,
      label: 'CRÍTICO',
    },
  };

  it('creates, lists and deletes a rule (admin only)', async () => {
    const forbidden = await t.app.inject({
      method: 'POST',
      url: '/rules',
      headers: bearer(tok.operator),
      payload: rule,
    });
    expect(forbidden.statusCode).toBe(403);

    const created = await t.app.inject({
      method: 'POST',
      url: '/rules',
      headers: bearer(tok.admin),
      payload: rule,
    });
    expect(created.statusCode).toBe(201);
    const id = created.json<RuleDto>().id;

    const dup = await t.app.inject({
      method: 'POST',
      url: '/rules',
      headers: bearer(tok.admin),
      payload: rule,
    });
    expect(dup.statusCode).toBe(409);

    const list = await t.app.inject({
      method: 'GET',
      url: '/rules',
      headers: bearer(tok.operator),
    });
    expect(list.json<{ data: RuleDto[] }>().data.map((r) => r.sort_order)).toEqual([
      10, 20, 30, 40,
    ]);

    expect(
      (await t.app.inject({ method: 'DELETE', url: `/rules/${id}`, headers: bearer(tok.admin) }))
        .statusCode,
    ).toBe(204);
    expect(
      (await t.app.inject({ method: 'DELETE', url: `/rules/${id}`, headers: bearer(tok.admin) }))
        .statusCode,
    ).toBe(404);
  });

  it('rejects an invalid DSL on create', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/rules',
      headers: bearer(tok.admin),
      payload: { ...rule, name: 'Mala', conditions: { all: [] } },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe.skipIf(!hasTestDb)('maintenance flow and audit log', () => {
  let t: TestContext;
  let tok: Record<DemoRole, string>;
  let assigned: IncidentDto;
  beforeAll(async () => {
    t = await createTestApp();
    tok = await tokensFor(t.app);
    const res = await t.app.inject({
      method: 'GET',
      url: '/incidents?assigned_to=me',
      headers: bearer(tok.maintenance),
    });
    assigned = res.json<PaginatedResponse<IncidentDto>>().data[0]!;
  });
  afterAll(async () => t?.close());

  it('PENDIENTE → ACEPTADA: only the assignee accepts, once', async () => {
    expect(assigned.status).toBe('assigned');
    const byOperator = await t.app.inject({
      method: 'POST',
      url: `/incidents/${assigned.id}/accept`,
      headers: bearer(tok.operator),
    });
    expect(byOperator.statusCode).toBe(403);

    const ok = await t.app.inject({
      method: 'POST',
      url: `/incidents/${assigned.id}/accept`,
      headers: bearer(tok.maintenance),
    });
    expect(ok.statusCode).toBe(200);
    const dto = ok.json<IncidentDto>();
    expect(dto.status).toBe('assigned');
    expect(typeof dto.metadata.accepted_at).toBe('string');

    const again = await t.app.inject({
      method: 'POST',
      url: `/incidents/${assigned.id}/accept`,
      headers: bearer(tok.maintenance),
    });
    expect(again.statusCode).toBe(409);
  });

  it('cannot accept an incident that is not assigned', async () => {
    const pending = await t.prisma.incident.findFirstOrThrow({ where: { status: 'pending' } });
    const res = await t.app.inject({
      method: 'POST',
      url: `/incidents/${pending.id}/accept`,
      headers: bearer(tok.admin),
    });
    expect(res.statusCode).toBe(409);
  });

  it('exposes the cross-incident audit log to staff, filterable by type', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/incident-events?event_type=accepted,created',
      headers: bearer(tok.operator),
    });
    const body = res.json<PaginatedResponse<AuditLogEntryDto>>();
    expect(body.meta.total).toBeGreaterThanOrEqual(6);
    expect(new Set(body.data.map((e) => e.event_type))).toEqual(new Set(['accepted', 'created']));
    expect(body.data[0]).toHaveProperty('incident_type');
    const citizen = await t.app.inject({
      method: 'GET',
      url: '/incident-events',
      headers: bearer(tok.citizen),
    });
    expect(citizen.statusCode).toBe(403);
  });
});
