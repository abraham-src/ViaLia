import type { AccessibilityPoint, Incident, IncidentType } from '@prisma/client';
import type {
  ComputedRoute,
  LngLatTuple,
  RouteBlocker,
  RouteComputation,
  RouteRequest,
  RouteStep,
} from '@simu/shared-types';
import { ACTIVE_STATUSES } from '../domain/incident-workflow.js';
import {
  nearestNode,
  pathCoordinates,
  pointToEdgeMeters,
  shortestPath,
  type Graph,
  type GraphEdge,
  type PathResult,
} from '../domain/pedestrian-graph.js';
import { asObject } from '../lib/serialize.js';
import type { ServiceContext } from './context.js';

// ── Tunables (meters / meter-equivalents) ──
const MAX_SNAP_M = 300;
const WALK_SPEED_MS = 1.3;
/** Wheelchair / reduced-mobility speed. */
const ACCESSIBLE_SPEED_MS = 0.9;
const OBSTACLE_RADIUS_M = 20;
const RAMP_RADIUS_M = 25;
const SIDEWALK_RADIUS_M = 25;
const ACCESSIBLE_ROUTE_RADIUS_M = 30;
const UNKNOWN_CORNER_PENALTY = 35;
const DAMAGED_RAMP_PENALTY = 250;
const ACCESSIBLE_ROUTE_FACTOR = 0.85;
const DAMAGED_SIDEWALK_FACTOR = 1.6;

/** Active incidents that physically obstruct a sidewalk or crossing, with their radius. */
const BLOCKING_INCIDENTS: Partial<Record<IncidentType, number>> = {
  accessibility_block: 25,
  obstacle: 25,
  accident: 25,
  infrastructure_failure: 25,
  water_accumulation: 30,
  flood_risk: 40,
};

const INCIDENT_LABEL: Record<IncidentType, string> = {
  water_accumulation: 'Acumulación de agua',
  drain_obstruction: 'Coladera obstruida',
  accident: 'Accidente',
  obstacle: 'Obstáculo',
  infrastructure_failure: 'Falla de infraestructura',
  accessibility_block: 'Bloqueo de accesibilidad',
  flood_risk: 'Riesgo de inundación',
};

export interface RoutingData {
  points: AccessibilityPoint[];
  incidents: Incident[];
}

export async function loadRoutingData(ctx: ServiceContext): Promise<RoutingData> {
  const [points, incidents] = await Promise.all([
    ctx.prisma.accessibilityPoint.findMany(),
    ctx.prisma.incident.findMany({
      where: {
        status: { in: [...ACTIVE_STATUSES] },
        type: { in: Object.keys(BLOCKING_INCIDENTS) as IncidentType[] },
      },
    }),
  ]);
  return { points, incidents };
}

const ll = (lat: number, lng: number): LngLatTuple => [lng, lat];
const pointName = (p: AccessibilityPoint): string | null => {
  const name = asObject(p.metadata).name;
  return typeof name === 'string' ? name : null;
};
function metersBetween(a: LngLatTuple, b: LngLatTuple): number {
  const kx = 111_320 * Math.cos((a[1] * Math.PI) / 180);
  return Math.hypot((a[0] - b[0]) * kx, (a[1] - b[1]) * 110_540);
}

interface Rules {
  blockers: RouteBlocker[];
  blockedEdges: Set<number>;
  blockedNodes: Set<string>;
  edgeFactor: Map<number, number>;
  rampByNode: Map<string, AccessibilityPoint>;
  damagedRampNodes: Set<string>;
}

function collectBlockers(
  data: RoutingData,
  req: RouteRequest,
  accessible: boolean,
): RouteBlocker[] {
  const blockers: RouteBlocker[] = [];
  for (const i of data.incidents) {
    blockers.push({
      kind: 'incident',
      id: i.id,
      label: `${INCIDENT_LABEL[i.type]}: ${i.description}`,
      latitude: i.latitude,
      longitude: i.longitude,
      radius_m: BLOCKING_INCIDENTS[i.type] ?? 25,
    });
  }
  if (accessible) {
    for (const p of data.points) {
      if ((p.type === 'obstacle' || p.type === 'temporarily_disabled') && p.status === 'blocked') {
        blockers.push({
          kind: 'accessibility_point',
          id: p.id,
          label: pointName(p) ?? 'Obstáculo temporal',
          latitude: p.latitude,
          longitude: p.longitude,
          radius_m: OBSTACLE_RADIUS_M,
        });
      }
    }
  }
  for (const a of req.avoid ?? []) {
    blockers.push({
      kind: 'manual',
      id: null,
      label: 'Punto a evitar',
      latitude: a.lat,
      longitude: a.lng,
      radius_m: a.radius_m ?? 25,
    });
  }
  return blockers;
}

function buildRules(
  graph: Graph,
  data: RoutingData,
  blockers: RouteBlocker[],
  accessible: boolean,
): Rules {
  const blockedEdges = new Set<number>();
  const blockedNodes = new Set<string>();
  const edgeFactor = new Map<number, number>();
  const rampByNode = new Map<string, AccessibilityPoint>();
  const damagedRampNodes = new Set<string>();

  for (const b of blockers) {
    const p = ll(b.latitude, b.longitude);
    for (const e of graph.edges)
      if (pointToEdgeMeters(p, e) <= b.radius_m) blockedEdges.add(e.index);
    for (const [id, c] of graph.nodes) if (metersBetween(p, c) <= b.radius_m) blockedNodes.add(id);
  }

  if (accessible) {
    const preferred = data.points.filter(
      (p) => p.type === 'accessible_route' && p.status === 'available',
    );
    const damaged = data.points.filter((p) => p.type === 'sidewalk' && p.status === 'damaged');
    for (const e of graph.edges) {
      let factor = 1;
      if (
        preferred.some(
          (p) => pointToEdgeMeters(ll(p.latitude, p.longitude), e) <= ACCESSIBLE_ROUTE_RADIUS_M,
        )
      ) {
        factor *= ACCESSIBLE_ROUTE_FACTOR;
      }
      if (
        damaged.some((p) => pointToEdgeMeters(ll(p.latitude, p.longitude), e) <= SIDEWALK_RADIUS_M)
      ) {
        factor *= DAMAGED_SIDEWALK_FACTOR;
      }
      if (factor !== 1) edgeFactor.set(e.index, factor);
    }
    const ramps = data.points.filter((p) => p.type === 'ramp');
    for (const [id, c] of graph.nodes) {
      for (const r of ramps) {
        if (metersBetween(ll(r.latitude, r.longitude), c) > RAMP_RADIUS_M) continue;
        if (r.status === 'available') rampByNode.set(id, r);
        else if (r.status === 'damaged' || r.status === 'blocked') damagedRampNodes.add(id);
      }
    }
  }
  return { blockers, blockedEdges, blockedNodes, edgeFactor, rampByNode, damagedRampNodes };
}

function route(
  graph: Graph,
  start: string,
  goal: string,
  rules: Rules,
  accessible: boolean,
  applyBlockers: boolean,
): PathResult | null {
  const edgeCost = (e: GraphEdge) => {
    if (applyBlockers && rules.blockedEdges.has(e.index)) return Infinity;
    if (accessible && e.steps) return Infinity;
    return e.length * (rules.edgeFactor.get(e.index) ?? 1);
  };
  const nodeCost = (id: string) => {
    if (applyBlockers && rules.blockedNodes.has(id)) return Infinity;
    if (!accessible) return 0;
    // Only real corners (3+ edges) involve a curb to cross.
    if ((graph.adjacency.get(id)?.length ?? 0) < 3) return 0;
    if (rules.rampByNode.has(id)) return 0;
    return rules.damagedRampNodes.has(id) ? DAMAGED_RAMP_PENALTY : UNKNOWN_CORNER_PENALTY;
  };
  return shortestPath(
    graph,
    start,
    goal,
    edgeCost,
    nodeCost,
    accessible ? ACCESSIBLE_ROUTE_FACTOR : 1,
  );
}

function steps(path: PathResult, rules: Rules): RouteStep[] {
  const out: RouteStep[] = [];
  let current: RouteStep | null = null;
  path.edges.forEach(({ edge }, i) => {
    const street = edge.name;
    if (!current || current.street !== street) {
      if (current) out.push(current);
      const via = street ?? 'andador sin nombre';
      current = {
        instruction: `${out.length === 0 ? 'Sal por' : 'Continúa por'} ${via}`,
        distance_m: 0,
        street,
      };
      // A ramp at the corner where the street changes.
      const corner = path.nodes[i];
      const ramp = corner ? rules.rampByNode.get(corner) : undefined;
      if (ramp && out.length > 0)
        current.instruction += ` (cruza por la rampa: ${pointName(ramp) ?? 'rampa disponible'})`;
    }
    current.distance_m += edge.length;
  });
  if (current) out.push(current);
  return out.map((s) => ({ ...s, distance_m: Math.round(s.distance_m) }));
}

function toComputed(
  path: PathResult,
  origin: LngLatTuple,
  destination: LngLatTuple,
  rules: Rules,
  accessible: boolean,
): ComputedRoute {
  const coords = pathCoordinates(path);
  const first = coords[0];
  const last = coords[coords.length - 1];
  const full: LngLatTuple[] = [origin, ...coords, destination];
  const walked = path.edges.reduce((s, e) => s + e.edge.length, 0);
  const connectors =
    (first ? metersBetween(origin, first) : 0) + (last ? metersBetween(last, destination) : 0);
  const length = walked + connectors;
  const ramps = [...new Set(path.nodes)]
    .map((n) => rules.rampByNode.get(n))
    .filter((r): r is AccessibilityPoint => !!r)
    .filter((r, i, arr) => arr.findIndex((x) => x.id === r.id) === i)
    .map((r) => ({ id: r.id, name: pointName(r), latitude: r.latitude, longitude: r.longitude }));
  const routeSteps = steps(path, rules);
  routeSteps.push({
    instruction: 'Llegas a tu destino',
    distance_m: Math.round(connectors),
    street: null,
  });
  return {
    path: { type: 'LineString', coordinates: full },
    length_m: Math.round(length),
    duration_min: Math.max(
      1,
      Math.round(length / (accessible ? ACCESSIBLE_SPEED_MS : WALK_SPEED_MS) / 60),
    ),
    ramps,
    steps: routeSteps,
  };
}

/** Blockers that intersect a path (why the direct route is not usable). */
function blockersOn(path: PathResult, rules: Rules): RouteBlocker[] {
  return rules.blockers.filter((b) => {
    const p = ll(b.latitude, b.longitude);
    return path.edges.some(({ edge }) => pointToEdgeMeters(p, edge) <= b.radius_m);
  });
}

/** Computes the best route and, when blockers force a detour, the blocked direct one too. */
export function computeRoute(graph: Graph, data: RoutingData, req: RouteRequest): RouteComputation {
  const accessible = req.accessible ?? true;
  const start = nearestNode(graph, req.origin);
  const goal = nearestNode(graph, req.destination);
  const empty = (message: string): RouteComputation => ({
    found: false,
    accessible,
    status: 'none',
    route: null,
    baseline: null,
    avoided: [],
    origin_snap_m: Math.round(start?.distance ?? 0),
    destination_snap_m: Math.round(goal?.distance ?? 0),
    message,
  });
  if (!start || !goal || start.distance > MAX_SNAP_M || goal.distance > MAX_SNAP_M) {
    return empty(
      'El origen o el destino están fuera de la red peatonal disponible (Roma Norte, Condesa, Centro Histórico y Coyoacán).',
    );
  }

  const rules = buildRules(graph, data, collectBlockers(data, req, accessible), accessible);
  const primary = route(graph, start.id, goal.id, rules, accessible, true);
  const direct = route(graph, start.id, goal.id, rules, accessible, false);
  const blockedBy = direct ? blockersOn(direct, rules) : [];

  if (!primary) {
    const out = empty(
      accessible
        ? 'No hay ruta accesible disponible: los obstáculos activos bloquean todos los caminos.'
        : 'No hay ruta disponible: las incidencias activas bloquean todos los caminos.',
    );
    if (direct)
      out.baseline = {
        ...toComputed(direct, req.origin, req.destination, rules, accessible),
        blocked_by: blockedBy,
      };
    out.avoided = blockedBy;
    return out;
  }

  const route_ = toComputed(primary, req.origin, req.destination, rules, accessible);
  const detoured = blockedBy.length > 0;
  return {
    found: true,
    accessible,
    status: detoured ? 'alternative' : 'active',
    route: route_,
    baseline:
      detoured && direct
        ? {
            ...toComputed(direct, req.origin, req.destination, rules, accessible),
            blocked_by: blockedBy,
          }
        : null,
    avoided: blockedBy,
    origin_snap_m: Math.round(start.distance),
    destination_snap_m: Math.round(goal.distance),
    message: detoured
      ? `Ruta alternativa: evita ${blockedBy.length} obstáculo${blockedBy.length === 1 ? '' : 's'} en el camino directo.`
      : accessible
        ? 'Ruta accesible óptima.'
        : 'Ruta más corta.',
  };
}

/** Persists a computed alternative in accessible_routes (history + map layer). */
export async function saveRoute(
  ctx: ServiceContext,
  req: RouteRequest,
  result: RouteComputation,
): Promise<string | null> {
  if (!result.route) return null;
  const wkt = `LINESTRING(${result.route.path.coordinates.map(([x, y]) => `${x} ${y}`).join(', ')})`;
  const metadata = {
    name: `Ruta ${result.status === 'alternative' ? 'alternativa' : 'accesible'} calculada`,
    source: 'router',
    accessible: result.accessible,
    length_m: result.route.length_m,
    avoided: result.avoided.map((b) => ({ kind: b.kind, id: b.id, label: b.label })),
  };
  const rows = await ctx.prisma.$queryRaw<Array<{ id: string }>>`
    INSERT INTO accessible_routes (origin, destination, path, status, metadata)
    VALUES (
      ST_SetSRID(ST_MakePoint(${req.origin[0]}, ${req.origin[1]}), 4326),
      ST_SetSRID(ST_MakePoint(${req.destination[0]}, ${req.destination[1]}), 4326),
      ST_GeomFromText(${wkt}, 4326),
      ${result.status === 'alternative' ? 'alternative' : 'active'}::route_status,
      ${JSON.stringify(metadata)}::jsonb
    )
    RETURNING id::text AS id`;
  return rows[0]?.id ?? null;
}
