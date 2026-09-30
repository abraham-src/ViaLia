import type {
  AccessibilityPointDto,
  AccessibleRouteDto,
  RouteComputation,
  RuleDto,
} from '@simu/shared-types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bearer,
  createTestApp,
  hasTestDb,
  tokensFor,
  type DemoRole,
  type TestContext,
} from './helpers.js';

describe.skipIf(!hasTestDb)('accessibility', () => {
  let t: TestContext;
  let tok: Record<DemoRole, string>;
  beforeAll(async () => {
    t = await createTestApp();
    tok = await tokensFor(t.app);
  });
  afterAll(async () => t?.close());

  const get = (url: string, role: DemoRole = 'citizen') =>
    t.app.inject({ method: 'GET', url, headers: bearer(tok[role]) });

  it('lists the 30 seeded points for any signed-in user', async () => {
    const res = await get('/accessibility/points');
    expect(res.statusCode).toBe(200);
    expect(res.json<{ data: AccessibilityPointDto[] }>().data).toHaveLength(30);
  });

  it('filters ramps and includes their slope and width', async () => {
    const res = await get('/accessibility/points?type=ramp');
    const ramps = res.json<{ data: AccessibilityPointDto[] }>().data;
    expect(ramps).toHaveLength(11);
    const ne = ramps.find((r) => r.name === 'Rampa Álvaro Obregón y Orizaba, esquina NE');
    expect(ne?.ramp).toEqual({ slope: 6, width_m: 1.2 });
  });

  it('filters by bbox (Coyoacán) and by status', async () => {
    const coyoacan = await get('/accessibility/points?bbox=-99.170,19.344,-99.156,19.354');
    expect(coyoacan.json<{ data: AccessibilityPointDto[] }>().data).toHaveLength(6);
    const blocked = await get('/accessibility/points?status=blocked');
    expect(blocked.json<{ data: AccessibilityPointDto[] }>().data).toHaveLength(5);
  });

  it('returns stored routes as GeoJSON with their length in meters', async () => {
    const res = await get('/accessibility/routes');
    const routes = res.json<{ data: AccessibleRouteDto[] }>().data;
    expect(routes).toHaveLength(2);
    for (const r of routes) {
      expect(r.path.type).toBe('LineString');
      expect(r.length_m).toBeGreaterThan(300);
    }
  });

  it('finds routes near an origin/destination using geography distance', async () => {
    const near = await get(
      '/accessibility/routes?origin=-99.1602,19.4199&destination=-99.1573,19.4187&radius_m=50',
    );
    const names = near.json<{ data: AccessibleRouteDto[] }>().data.map((r) => r.name);
    expect(names).toEqual(['Orizaba y Colima → Álvaro Obregón y Mérida por Córdoba']);

    const far = await get('/accessibility/routes?origin=-99.1627,19.3501&radius_m=50');
    expect(far.json<{ data: AccessibleRouteDto[] }>().data).toHaveLength(0);

    expect((await get('/accessibility/routes?origin=abc')).statusCode).toBe(400);
  });
});

/** Local metric distance (fine at street scale). */
function meters(a: [number, number], b: [number, number]): number {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110_540);
}
const minDistance = (coords: [number, number][], p: [number, number]) =>
  Math.min(...coords.map((c) => meters(c, p)));

/** Scenario 5 (docs/escenarios-demo.md): accessible route with an alternative around obstacles. */
describe.skipIf(!hasTestDb)('accessible routing (scenario 5)', () => {
  let t: TestContext;
  let tok: Record<DemoRole, string>;
  beforeAll(async () => {
    t = await createTestApp();
    tok = await tokensFor(t.app);
  });
  afterAll(async () => t?.close());

  const ORIGIN: [number, number] = [-99.160194, 19.41985]; // Orizaba y Colima
  const DEST: [number, number] = [-99.157323, 19.418656]; // Álvaro Obregón y Mérida
  const WORKS: [number, number] = [-99.15916, 19.4184]; // seeded construction on Álvaro Obregón

  const compute = async (accessible = true) => {
    const res = await t.app.inject({
      method: 'GET',
      url: `/accessibility/routes?origin=${ORIGIN.join(',')}&destination=${DEST.join(',')}&accessible=${accessible}`,
      headers: bearer(tok.citizen),
    });
    expect(res.statusCode).toBe(200);
    return res.json<{ data: AccessibleRouteDto[]; computed: RouteComputation }>().computed;
  };

  it('detours around the construction and says what it avoided', async () => {
    const c = await compute();
    expect(c.found).toBe(true);
    expect(c.status).toBe('alternative');
    expect(c.avoided.length).toBeGreaterThan(0);
    expect(c.avoided.some((b) => b.label.includes('Álvaro Obregón'))).toBe(true);

    const route = c.route!.path.coordinates as [number, number][];
    expect(minDistance(route, WORKS)).toBeGreaterThan(15);
    // The blocked direct route goes right through it.
    expect(minDistance(c.baseline!.path.coordinates as [number, number][], WORKS)).toBeLessThan(25);
    expect(c.route!.length_m).toBeGreaterThanOrEqual(c.baseline!.length_m);
    expect(c.route!.duration_min).toBeGreaterThanOrEqual(1);
    expect(c.route!.steps.at(-1)?.instruction).toBe('Llegas a tu destino');
  });

  it('re-routes when a new accessibility block appears on the alternative', async () => {
    const before = await compute();
    const path = before.route!.path.coordinates as [number, number][];
    const mid = path[Math.floor(path.length / 2)]!;

    const created = await t.app.inject({
      method: 'POST',
      url: '/incidents',
      headers: bearer(tok.operator),
      payload: {
        type: 'accessibility_block',
        description: 'Coche estacionado sobre la rampa',
        longitude: mid[0],
        latitude: mid[1],
      },
    });
    expect(created.statusCode).toBe(201);

    const after = await compute();
    if (after.found) {
      expect(minDistance(after.route!.path.coordinates as [number, number][], mid)).toBeGreaterThan(
        20,
      );
    } else {
      expect(after.message).toMatch(/No hay ruta accesible/);
    }
  });

  it('computes and stores an alternative that avoids extra points', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/accessibility/routes/alternative',
      headers: bearer(tok.citizen),
      payload: {
        origin: ORIGIN,
        destination: DEST,
        accessible: true,
        avoid: [{ lng: -99.158, lat: 19.4195, radius_m: 30 }],
      },
    });
    expect([200, 201]).toContain(res.statusCode);
    const body = res.json<{ computed: RouteComputation; saved_id: string | null }>();
    if (body.computed.found) {
      expect(body.saved_id).toMatch(/^[0-9a-f-]{36}$/);
      const list = await t.app.inject({
        method: 'GET',
        url: '/accessibility/routes',
        headers: bearer(tok.citizen),
      });
      expect(
        list.json<{ data: AccessibleRouteDto[] }>().data.some((r) => r.id === body.saved_id),
      ).toBe(true);
    }
  });

  it('rejects points outside the pedestrian network', async () => {
    const res = await t.app.inject({
      method: 'GET',
      url: '/accessibility/routes?origin=-99.2500,19.5000&destination=-99.1573,19.4190',
      headers: bearer(tok.citizen),
    });
    const c = res.json<{ computed: RouteComputation }>().computed;
    expect(c.found).toBe(false);
    expect(c.message).toMatch(/fuera de la red peatonal/);
  });

  it('validates the alternative request', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/accessibility/routes/alternative',
      headers: bearer(tok.citizen),
      payload: { origin: [-99.15, 19.42] },
    });
    expect(res.statusCode).toBe(400);
  });
});

describe.skipIf(!hasTestDb)('GIS layers', () => {
  let t: TestContext;
  let tok: Record<DemoRole, string>;
  beforeAll(async () => {
    t = await createTestApp();
    tok = await tokensFor(t.app);
  });
  afterAll(async () => t?.close());

  it('serves the flood-risk and zone layers as GeoJSON to any signed-in user', async () => {
    const flood = await t.app.inject({
      method: 'GET',
      url: '/gis/flood-risk-zones',
      headers: bearer(tok.citizen),
    });
    expect(flood.statusCode).toBe(200);
    const fc = flood.json<{ type: string; features: Array<{ properties: { code: string } }> }>();
    expect(fc.type).toBe('FeatureCollection');
    expect(fc.features.map((f) => f.properties.code)).toContain('FLOOD-001');

    const zones = await t.app.inject({
      method: 'GET',
      url: '/gis/zones',
      headers: bearer(tok.operator),
    });
    expect(zones.json<{ features: unknown[] }>().features).toHaveLength(4);
  });

  it('rejects unknown layers and anonymous access', async () => {
    expect(
      (await t.app.inject({ method: 'GET', url: '/gis/secret', headers: bearer(tok.admin) }))
        .statusCode,
    ).toBe(404);
    expect((await t.app.inject({ method: 'GET', url: '/gis/zones' })).statusCode).toBe(401);
  });
});

describe.skipIf(!hasTestDb)('rules', () => {
  let t: TestContext;
  let tok: Record<DemoRole, string>;
  beforeAll(async () => {
    t = await createTestApp();
    tok = await tokensFor(t.app);
  });
  afterAll(async () => t?.close());

  it('lists the three rules in evaluation order', async () => {
    const res = await t.app.inject({ method: 'GET', url: '/rules', headers: bearer(tok.operator) });
    const rules = res.json<{ data: RuleDto[] }>().data;
    expect(rules.map((r) => r.sort_order)).toEqual([10, 20, 30]);
    expect(rules[2]?.action).toMatchObject({ set_priority: 'critical' });
  });

  it('lets only admins edit rules', async () => {
    const [rule] = await t.prisma.rule.findMany({ orderBy: { sortOrder: 'asc' }, take: 1 });
    const url = `/rules/${rule?.id}`;
    for (const role of ['operator', 'maintenance', 'citizen'] as const) {
      const res = await t.app.inject({
        method: 'PATCH',
        url,
        headers: bearer(tok[role]),
        payload: { enabled: false },
      });
      expect(res.statusCode).toBe(403);
    }
    expect(
      (await t.app.inject({ method: 'GET', url: '/rules', headers: bearer(tok.citizen) }))
        .statusCode,
    ).toBe(403);

    const ok = await t.app.inject({
      method: 'PATCH',
      url,
      headers: bearer(tok.admin),
      payload: { enabled: false },
    });
    expect(ok.json<RuleDto>().enabled).toBe(false);
    await t.app.inject({
      method: 'PATCH',
      url,
      headers: bearer(tok.admin),
      payload: { enabled: true },
    });
  });

  it('validates the rules DSL', async () => {
    const [rule] = await t.prisma.rule.findMany({ take: 1 });
    const url = `/rules/${rule?.id}`;
    const badFact = await t.app.inject({
      method: 'PATCH',
      url,
      headers: bearer(tok.admin),
      payload: { conditions: { all: [{ fact: 'drain.temperature', op: 'gt', value: 80 }] } },
    });
    expect(badFact.statusCode).toBe(400);

    const badAction = await t.app.inject({
      method: 'PATCH',
      url,
      headers: bearer(tok.admin),
      payload: { action: { incident_type: 'flood_risk', set_priority: 'urgentísimo' } },
    });
    expect(badAction.statusCode).toBe(400);
  });
});
