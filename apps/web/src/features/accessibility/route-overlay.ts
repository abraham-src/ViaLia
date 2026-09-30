import type { RouteComputation } from '@simu/shared-types';
import type { Feature, FeatureCollection } from 'geojson';

export type LngLat = [number, number];

/** Map overlay for a computed route: blocked direct route, route, avoided points, A/B. */
export function routeOverlay(
  origin: LngLat | null,
  destination: LngLat | null,
  result: RouteComputation | undefined,
): FeatureCollection {
  const features: Feature[] = [];
  if (result?.baseline) {
    features.push({
      type: 'Feature',
      geometry: result.baseline.path,
      properties: { role: 'baseline' },
    });
  }
  if (result?.route) {
    features.push({
      type: 'Feature',
      geometry: result.route.path,
      properties: { role: 'route', status: result.status },
    });
  }
  for (const b of result?.avoided ?? []) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [b.longitude, b.latitude] },
      properties: { role: 'avoided', label: b.label },
    });
  }
  if (origin) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: origin },
      properties: { role: 'origin' },
    });
  }
  if (destination) {
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: destination },
      properties: { role: 'destination' },
    });
  }
  return { type: 'FeatureCollection', features };
}

/** Bounds that contain every coordinate of the route (and its baseline). */
export function routeBounds(result: RouteComputation | undefined): [LngLat, LngLat] | null {
  const coords = [
    ...(result?.route?.path.coordinates ?? []),
    ...(result?.baseline?.path.coordinates ?? []),
  ];
  if (coords.length === 0) return null;
  let [minX, minY] = coords[0]!;
  let [maxX, maxY] = coords[0]!;
  for (const [x, y] of coords) {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  }
  return [
    [minX, minY],
    [maxX, maxY],
  ];
}
