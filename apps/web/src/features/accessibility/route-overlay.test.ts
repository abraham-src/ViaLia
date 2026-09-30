import type { RouteComputation } from '@simu/shared-types';
import { describe, expect, it } from 'vitest';
import { routeBounds, routeOverlay } from './route-overlay';

const computed: RouteComputation = {
  found: true,
  accessible: true,
  status: 'alternative',
  route: {
    path: {
      type: 'LineString',
      coordinates: [
        [-99.1602, 19.4198],
        [-99.1587, 19.4194],
        [-99.1573, 19.4187],
      ],
    },
    length_m: 456,
    duration_min: 8,
    ramps: [],
    steps: [],
  },
  baseline: {
    path: {
      type: 'LineString',
      coordinates: [
        [-99.1602, 19.4198],
        [-99.1598, 19.4184],
        [-99.1573, 19.4187],
      ],
    },
    length_m: 452,
    duration_min: 8,
    ramps: [],
    steps: [],
    blocked_by: [],
  },
  avoided: [
    {
      kind: 'accessibility_point',
      id: 'x',
      label: 'Obra',
      latitude: 19.4184,
      longitude: -99.15916,
      radius_m: 20,
    },
  ],
  origin_snap_m: 3,
  destination_snap_m: 4,
  message: 'Ruta alternativa',
};

describe('routeOverlay', () => {
  it('draws baseline, route, avoided points and both endpoints with roles', () => {
    const fc = routeOverlay([-99.1602, 19.4198], [-99.1573, 19.4187], computed);
    expect(fc.features.map((f) => f.properties?.role)).toEqual([
      'baseline',
      'route',
      'avoided',
      'origin',
      'destination',
    ]);
    expect(fc.features[1]?.properties?.status).toBe('alternative');
  });

  it('shows only the endpoints before a route is computed', () => {
    const fc = routeOverlay([-99.16, 19.42], [-99.157, 19.418], undefined);
    expect(fc.features.map((f) => f.properties?.role)).toEqual(['origin', 'destination']);
  });
});

describe('routeBounds', () => {
  it('covers the route and the blocked baseline', () => {
    expect(routeBounds(computed)).toEqual([
      [-99.1602, 19.4184],
      [-99.1573, 19.4198],
    ]);
  });
  it('is null without a route', () => {
    expect(routeBounds(undefined)).toBeNull();
  });
});
