import { describe, expect, it } from 'vitest';
import {
  buildGraph,
  nearestNode,
  pathCoordinates,
  pointToSegmentMeters,
  shortestPath,
  type GraphEdge,
} from '../src/domain/pedestrian-graph.js';

/**
 * A 3×2 street grid (~100 m blocks):
 *
 *   A ── B ── C
 *   │    │    │
 *   D ── E ── F
 */
const LNG0 = -99.16;
const LAT0 = 19.42;
const DX = 0.00095; // ≈ 100 m
const DY = 0.0009; // ≈ 100 m
const P: Record<string, [number, number]> = {
  A: [LNG0, LAT0],
  B: [LNG0 + DX, LAT0],
  C: [LNG0 + 2 * DX, LAT0],
  D: [LNG0, LAT0 - DY],
  E: [LNG0 + DX, LAT0 - DY],
  F: [LNG0 + 2 * DX, LAT0 - DY],
};
const edge = (from: string, to: string, extra: Partial<{ name: string; steps: boolean }> = {}) => ({
  properties: {
    from,
    to,
    highway: 'residential',
    name: extra.name ?? `${from}${to}`,
    steps: extra.steps ?? false,
  },
  geometry: { coordinates: [P[from]!, P[to]!] },
});
const graph = buildGraph({
  features: [
    edge('A', 'B'),
    edge('B', 'C'),
    edge('D', 'E'),
    edge('E', 'F'),
    edge('A', 'D'),
    edge('B', 'E', { steps: true }),
    edge('C', 'F'),
  ],
});
const byName = (e: GraphEdge) => e.name;

describe('pedestrian graph', () => {
  it('builds nodes and adjacency from OSM-style edges', () => {
    expect(graph.nodes.size).toBe(6);
    expect(graph.edges).toHaveLength(7);
    expect(graph.adjacency.get('B')).toHaveLength(3);
    expect(graph.edges[0]!.length).toBeGreaterThan(95);
    expect(graph.edges[0]!.length).toBeLessThan(105);
  });

  it('snaps a point to the nearest node', () => {
    expect(nearestNode(graph, [LNG0 + 0.0001, LAT0 - 0.0001])).toMatchObject({ id: 'A' });
  });

  it('finds the shortest path with A*', () => {
    const path = shortestPath(graph, 'A', 'F', (e) => e.length)!;
    expect(path.edges.map((x) => byName(x.edge))).toHaveLength(3);
    expect(path.cost).toBeGreaterThan(290);
    expect(path.cost).toBeLessThan(310);
  });

  it('avoids impassable edges (steps in accessible mode) and blocked nodes', () => {
    // A→E: direct through B–E (steps) is 200 m; step-free goes A–D–E, also 200 m.
    const noSteps = shortestPath(graph, 'A', 'E', (e) => (e.steps ? Infinity : e.length))!;
    expect(noSteps.nodes).toEqual(['A', 'D', 'E']);

    // Block D: the only step-free way is gone → no route.
    const blocked = shortestPath(
      graph,
      'A',
      'E',
      (e) => (e.steps ? Infinity : e.length),
      (n) => (n === 'D' ? Infinity : 0),
    );
    expect(blocked === null || blocked.nodes.includes('B')).toBe(true);
  });

  it('adds corner penalties (e.g. no ramp) to steer the route', () => {
    // A→F via B (A-B-C-F) vs via D (A-D-E-F): equal length; penalize B.
    const path = shortestPath(
      graph,
      'A',
      'F',
      (e) => (e.steps ? Infinity : e.length),
      (n) => (n === 'B' ? 500 : 0),
    )!;
    expect(path.nodes).toEqual(['A', 'D', 'E', 'F']);
  });

  it('returns coordinates in walking order without duplicated joints', () => {
    const path = shortestPath(graph, 'F', 'D', (e) => e.length)!;
    const coords = pathCoordinates(path);
    expect(coords[0]).toEqual(P.F);
    expect(coords.at(-1)).toEqual(P.D);
    expect(new Set(coords.map((c) => c.join(','))).size).toBe(coords.length);
  });

  it('measures point-to-segment distance in meters', () => {
    const mid: [number, number] = [LNG0 + DX / 2, LAT0 + 0.00018]; // ~20 m north of A–B
    const d = pointToSegmentMeters(mid, P.A!, P.B!);
    expect(d).toBeGreaterThan(18);
    expect(d).toBeLessThan(22);
  });
});
