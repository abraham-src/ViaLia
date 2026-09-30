import { readFileSync } from 'node:fs';
import type { LngLatTuple } from '@simu/shared-types';
import { haversineMeters } from '@simu/shared-utils';

/**
 * Walkable street graph (database/gis/pedestrian-network.geojson, from OpenStreetMap).
 * Pure: no database. Edge costs come from a caller-supplied function, so accessibility
 * rules and live blockers live in the routing service.
 */

export interface GraphEdge {
  index: number;
  from: string;
  to: string;
  coords: LngLatTuple[];
  length: number;
  highway: string;
  name: string | null;
  steps: boolean;
}

export interface Graph {
  nodes: Map<string, LngLatTuple>;
  /** node id → incident edge indexes */
  adjacency: Map<string, number[]>;
  edges: GraphEdge[];
}

interface NetworkFile {
  features: Array<{
    properties: { from: string; to: string; highway: string; name: string | null; steps: boolean };
    geometry: { coordinates: LngLatTuple[] };
  }>;
}

const toLL = ([lng, lat]: LngLatTuple) => ({ lng, lat });

function lineLength(coords: readonly LngLatTuple[]): number {
  let total = 0;
  for (let i = 1; i < coords.length; i++)
    total += haversineMeters(toLL(coords[i - 1]!), toLL(coords[i]!));
  return total;
}

export function buildGraph(network: NetworkFile): Graph {
  const nodes = new Map<string, LngLatTuple>();
  const adjacency = new Map<string, number[]>();
  const edges: GraphEdge[] = [];
  for (const f of network.features) {
    const coords = f.geometry.coordinates;
    const first = coords[0];
    const last = coords[coords.length - 1];
    if (!first || !last || coords.length < 2) continue;
    const { from, to } = f.properties;
    if (from === to) continue;
    const index = edges.length;
    edges.push({
      index,
      from,
      to,
      coords,
      length: lineLength(coords),
      highway: f.properties.highway,
      name: f.properties.name,
      steps: f.properties.steps,
    });
    nodes.set(from, first);
    nodes.set(to, last);
    for (const n of [from, to]) {
      const list = adjacency.get(n);
      if (list) list.push(index);
      else adjacency.set(n, [index]);
    }
  }
  return { nodes, adjacency, edges };
}

export function loadGraph(file: string): Graph {
  return buildGraph(JSON.parse(readFileSync(file, 'utf8')) as NetworkFile);
}

/** Nearest graph node (linear scan: ~7k nodes, well under 1 ms). */
export function nearestNode(graph: Graph, p: LngLatTuple): { id: string; distance: number } | null {
  let best: { id: string; distance: number } | null = null;
  for (const [id, coord] of graph.nodes) {
    const d = haversineMeters(toLL(p), toLL(coord));
    if (!best || d < best.distance) best = { id, distance: d };
  }
  return best;
}

/** Meters from point p to segment a–b (local equirectangular projection; fine < 1 km). */
export function pointToSegmentMeters(p: LngLatTuple, a: LngLatTuple, b: LngLatTuple): number {
  const kx = 111_320 * Math.cos((p[1] * Math.PI) / 180);
  const ky = 110_540;
  const ax = (a[0] - p[0]) * kx;
  const ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx;
  const by = (b[1] - p[1]) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

export function pointToEdgeMeters(p: LngLatTuple, edge: GraphEdge): number {
  let best = Infinity;
  for (let i = 1; i < edge.coords.length; i++) {
    best = Math.min(best, pointToSegmentMeters(p, edge.coords[i - 1]!, edge.coords[i]!));
  }
  return best;
}

/** Cost of traversing an edge; Infinity = impassable. */
export type EdgeCost = (edge: GraphEdge) => number;
/** Extra cost of passing through a node (e.g. a corner without a ramp); Infinity = impassable. */
export type NodeCost = (nodeId: string) => number;

export interface PathResult {
  nodes: string[];
  /** Edges in walking order with the direction they were walked. */
  edges: Array<{ edge: GraphEdge; reversed: boolean }>;
  cost: number;
}

/** Minimal binary heap keyed by f-score. */
class MinHeap {
  private items: Array<[number, string]> = [];
  get size(): number {
    return this.items.length;
  }
  push(item: [number, string]): void {
    const a = this.items;
    a.push(item);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (a[p]![0] <= a[i]![0]) break;
      [a[p], a[i]] = [a[i]!, a[p]!];
      i = p;
    }
  }
  pop(): [number, string] | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && a[l]![0] < a[m]![0]) m = l;
        if (r < a.length && a[r]![0] < a[m]![0]) m = r;
        if (m === i) break;
        [a[m], a[i]] = [a[i]!, a[m]!];
        i = m;
      }
    }
    return top;
  }
}

/**
 * A* over the graph. Costs are meter-equivalents; `minCostFactor` is the smallest
 * cost/length ratio any edge can have (bonuses < 1), used to keep the haversine
 * heuristic admissible so the result stays optimal.
 */
export function shortestPath(
  graph: Graph,
  start: string,
  goal: string,
  edgeCost: EdgeCost,
  nodeCost: NodeCost = () => 0,
  minCostFactor = 1,
): PathResult | null {
  const goalCoord = graph.nodes.get(goal);
  if (!goalCoord || !graph.nodes.has(start)) return null;
  const h = (id: string) =>
    minCostFactor * haversineMeters(toLL(graph.nodes.get(id)!), toLL(goalCoord));

  const g = new Map<string, number>([[start, 0]]);
  const came = new Map<string, { prev: string; edge: GraphEdge }>();
  const open = new MinHeap();
  open.push([h(start), start]);
  const closed = new Set<string>();

  while (open.size > 0) {
    const [, current] = open.pop()!;
    if (current === goal) break;
    if (closed.has(current)) continue;
    closed.add(current);

    for (const index of graph.adjacency.get(current) ?? []) {
      const edge = graph.edges[index]!;
      const next = edge.from === current ? edge.to : edge.from;
      if (closed.has(next)) continue;
      const step = edgeCost(edge) + (next === goal ? 0 : nodeCost(next));
      if (!Number.isFinite(step)) continue;
      const tentative = (g.get(current) ?? Infinity) + step;
      if (tentative < (g.get(next) ?? Infinity)) {
        g.set(next, tentative);
        came.set(next, { prev: current, edge });
        open.push([tentative + h(next), next]);
      }
    }
  }

  if (!g.has(goal)) return null;
  const nodes: string[] = [goal];
  const edges: PathResult['edges'] = [];
  let cursor = goal;
  while (cursor !== start) {
    const step = came.get(cursor);
    if (!step) return null;
    edges.unshift({ edge: step.edge, reversed: step.edge.from !== step.prev });
    nodes.unshift(step.prev);
    cursor = step.prev;
  }
  return { nodes, edges, cost: g.get(goal)! };
}

/** Coordinates of a path in walking order, without duplicated joints. */
export function pathCoordinates(path: PathResult): LngLatTuple[] {
  const out: LngLatTuple[] = [];
  for (const { edge, reversed } of path.edges) {
    const coords = reversed ? [...edge.coords].reverse() : edge.coords;
    for (const c of out.length ? coords.slice(1) : coords) out.push(c);
  }
  return out;
}
