import type { GeoJsonFeatureCollection, GeoJsonPoint } from '@simu/shared-types';

/** Wraps any DTO with latitude/longitude into a Point FeatureCollection for MapLibre. */
export function toPointCollection<T extends { id: string; latitude: number; longitude: number }>(
  items: readonly T[],
): GeoJsonFeatureCollection<GeoJsonPoint, Omit<T, 'latitude' | 'longitude'>> {
  return {
    type: 'FeatureCollection',
    features: items.map(({ latitude, longitude, ...properties }) => ({
      type: 'Feature',
      id: properties.id,
      geometry: { type: 'Point', coordinates: [longitude, latitude] },
      properties,
    })),
  };
}
