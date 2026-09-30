import type { Feature, FeatureCollection, Polygon, Position } from 'geojson';

/** [lng, lat] en EPSG:4326, como MapLibre y GeoJSON. */
export type LngLat = [number, number];

const R = 6_371_008.8;
const rad = (d: number) => (d * Math.PI) / 180;
const deg = (r: number) => (r * 180) / Math.PI;

/** Distancia en metros sobre la esfera. */
export function distanceM(a: LngLat, b: LngLat): number {
  const dLat = rad(b[1] - a[1]);
  const dLng = rad(b[0] - a[0]);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(rad(a[1])) * Math.cos(rad(b[1])) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Rumbo inicial de a hacia b, 0–360° (0 = norte, 90 = oriente). */
export function bearingDeg(a: LngLat, b: LngLat): number {
  const y = Math.sin(rad(b[0] - a[0])) * Math.cos(rad(b[1]));
  const x =
    Math.cos(rad(a[1])) * Math.sin(rad(b[1])) -
    Math.sin(rad(a[1])) * Math.cos(rad(b[1])) * Math.cos(rad(b[0] - a[0]));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Punto a `distance` metros de `from` con rumbo `bearing`. */
export function destination(from: LngLat, bearing: number, distance: number): LngLat {
  const d = distance / R;
  const b = rad(bearing);
  const lat1 = rad(from[1]);
  const lng1 = rad(from[0]);
  const lat2 = Math.asin(Math.sin(lat1) * Math.cos(d) + Math.cos(lat1) * Math.sin(d) * Math.cos(b));
  const lng2 =
    lng1 +
    Math.atan2(
      Math.sin(b) * Math.sin(d) * Math.cos(lat1),
      Math.cos(d) - Math.sin(lat1) * Math.sin(lat2),
    );
  return [deg(lng2), deg(lat2)];
}

export function circle(
  center: LngLat,
  radiusM: number,
  props: Record<string, unknown> = {},
  steps = 72,
): Feature<Polygon> {
  const ring: Position[] = [];
  for (let i = 0; i <= steps; i++) ring.push(destination(center, (i * 360) / steps, radiusM));
  return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } };
}

/** Cono de visión de una cámara: vértice en la cámara, abierto `spread` grados. */
export function cone(
  center: LngLat,
  heading: number,
  spread: number,
  rangeM: number,
  props: Record<string, unknown> = {},
  steps = 18,
): Feature<Polygon> {
  const ring: Position[] = [center];
  for (let i = 0; i <= steps; i++) {
    ring.push(destination(center, heading - spread / 2 + (spread * i) / steps, rangeM));
  }
  ring.push(center);
  return { type: 'Feature', properties: props, geometry: { type: 'Polygon', coordinates: [ring] } };
}

export function fc<T extends Feature>(features: T[]): FeatureCollection {
  return { type: 'FeatureCollection', features };
}

/** Ray casting sobre el anillo exterior. */
export function pointInRing(pt: LngLat, ring: readonly Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (!a || !b) continue;
    const [xi = 0, yi = 0] = a;
    const [xj = 0, yj = 0] = b;
    if (yi > pt[1] !== yj > pt[1] && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

export function ringCenter(ring: readonly Position[]): LngLat {
  let x = 0;
  let y = 0;
  const pts = ring.length > 1 ? ring.slice(0, -1) : ring;
  for (const p of pts) {
    x += p[0] ?? 0;
    y += p[1] ?? 0;
  }
  return [x / Math.max(1, pts.length), y / Math.max(1, pts.length)];
}

const COMPASS = [
  'norte',
  'noreste',
  'oriente',
  'sureste',
  'sur',
  'suroeste',
  'poniente',
  'noroeste',
];

/** "al oriente", "al noreste"… */
export function compassWord(bearing: number): string {
  return COMPASS[Math.round(bearing / 45) % 8] ?? 'norte';
}

export function formatDistance(m: number): string {
  if (m < 1000) return `${Math.round(m)} m`;
  return `${(m / 1000).toFixed(m < 10_000 ? 1 : 0)} km`;
}

/** Punto a segmento en metros (proyección local equirectangular, precisa a escala de barrio). */
export function pointSegmentM(p: LngLat, a: LngLat, b: LngLat): number {
  const kx = Math.cos(rad(p[1])) * 111_320;
  const ky = 110_540;
  const ax = (a[0] - p[0]) * kx;
  const ay = (a[1] - p[1]) * ky;
  const bx = (b[0] - p[0]) * kx;
  const by = (b[1] - p[1]) * ky;
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / len2));
  const x = ax + t * dx;
  const y = ay + t * dy;
  return Math.sqrt(x * x + y * y);
}

export interface ScreenPoint<T> {
  x: number;
  y: number;
  item: T;
}

export interface ScreenCluster<T> {
  x: number;
  y: number;
  items: T[];
}

/**
 * Agrupa puntos en pantalla: cada punto se une al primer grupo cuyo centro esté a menos de
 * `radiusPx`. Suficiente para decenas de marcadores sin depender de supercluster.
 */
export function clusterScreen<T>(points: ScreenPoint<T>[], radiusPx: number): ScreenCluster<T>[] {
  const clusters: ScreenCluster<T>[] = [];
  for (const p of points) {
    const hit = clusters.find((c) => Math.hypot(c.x - p.x, c.y - p.y) <= radiusPx);
    if (hit) {
      const n = hit.items.length;
      hit.x = (hit.x * n + p.x) / (n + 1);
      hit.y = (hit.y * n + p.y) / (n + 1);
      hit.items.push(p.item);
    } else {
      clusters.push({ x: p.x, y: p.y, items: [p.item] });
    }
  }
  return clusters;
}
