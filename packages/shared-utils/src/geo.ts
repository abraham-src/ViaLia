import type { BBox, LngLat } from '@simu/shared-types';

/** Mean Earth radius (IUGG), meters. */
const EARTH_RADIUS_M = 6_371_008.8;

/** Approximate bounding box of Mexico City (16 alcaldías). */
export const CDMX_BBOX: BBox = [-99.365, 19.048, -98.94, 19.593];

const toRad = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in meters between two WGS84 points. */
export function haversineMeters(a: LngLat, b: LngLat): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function isValidLngLat(p: LngLat): boolean {
  return (
    Number.isFinite(p.lng) &&
    Number.isFinite(p.lat) &&
    p.lng >= -180 &&
    p.lng <= 180 &&
    p.lat >= -90 &&
    p.lat <= 90
  );
}

/**
 * Parses a `bbox` query param: "minLng,minLat,maxLng,maxLat".
 * @throws RangeError when the string is malformed or the box is inverted.
 */
export function parseBbox(input: string): BBox {
  const parts = input.split(',').map((s) => s.trim());
  if (parts.length !== 4 || parts.some((s) => s === '')) {
    throw new RangeError('bbox debe tener el formato minLng,minLat,maxLng,maxLat');
  }
  const [minLng, minLat, maxLng, maxLat] = parts.map(Number) as [number, number, number, number];
  if (
    !isValidLngLat({ lng: minLng, lat: minLat }) ||
    !isValidLngLat({ lng: maxLng, lat: maxLat })
  ) {
    throw new RangeError('bbox contiene coordenadas fuera de rango');
  }
  if (minLng >= maxLng || minLat >= maxLat) {
    throw new RangeError('bbox invertido: min debe ser menor que max');
  }
  return [minLng, minLat, maxLng, maxLat];
}

export function isPointInBbox(p: LngLat, bbox: BBox): boolean {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return p.lng >= minLng && p.lng <= maxLng && p.lat >= minLat && p.lat <= maxLat;
}
