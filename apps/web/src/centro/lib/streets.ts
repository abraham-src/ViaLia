import { useQuery } from '@tanstack/react-query';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import { distanceM, pointSegmentM, type LngLat } from './geo';

/**
 * Red de calles de OpenStreetMap que ya trae el repo (database/gis/pedestrian-network.geojson),
 * compactada en public/cx/streets.geojson. Sirve para dos cosas sin Internet:
 * mapa base de respaldo y "dirección" legible de una incidencia.
 * Datos © colaboradores de OpenStreetMap (ODbL).
 */
export type StreetClass = 'major' | 'minor' | 'foot';
export type StreetFeature = Feature<LineString, { c: StreetClass; n?: string }>;
export type StreetCollection = FeatureCollection<LineString, { c: StreetClass; n?: string }>;

export const STREETS_URL = '/cx/streets.geojson';

let cache: Promise<StreetCollection> | null = null;

export function loadStreets(): Promise<StreetCollection> {
  cache ??= fetch(STREETS_URL)
    .then((r) => {
      if (!r.ok) throw new Error(`calles: ${r.status}`);
      return r.json() as Promise<StreetCollection>;
    })
    .catch((err: unknown) => {
      cache = null;
      throw err;
    });
  return cache;
}

export function useStreets() {
  return useQuery({ queryKey: ['cx', 'streets'], queryFn: loadStreets, staleTime: Infinity });
}

/** Nombres de las calles más cercanas, sin repetir: ["Álvaro Obregón", "Orizaba"]. */
export function nearestStreetNames(
  streets: StreetCollection | undefined,
  point: LngLat,
  maxM = 90,
  limit = 2,
): string[] {
  if (!streets) return [];
  const best = new Map<string, number>();
  for (const f of streets.features) {
    const name = f.properties.n;
    if (!name || f.properties.c === 'foot') continue;
    const coords = f.geometry.coordinates;
    const first = coords[0];
    if (!first || distanceM(point, [first[0] ?? 0, first[1] ?? 0]) > 800) continue;
    for (let i = 1; i < coords.length; i++) {
      const a = coords[i - 1];
      const b = coords[i];
      if (!a || !b) continue;
      const d = pointSegmentM(point, [a[0] ?? 0, a[1] ?? 0], [b[0] ?? 0, b[1] ?? 0]);
      if (d <= maxM && d < (best.get(name) ?? Infinity)) best.set(name, d);
    }
  }
  return [...best.entries()]
    .sort((a, b) => a[1] - b[1])
    .slice(0, limit)
    .map(([n]) => shortStreet(n));
}

/** "Avenida Álvaro Obregón" → "Av. Álvaro Obregón"; "Calle Orizaba" → "Orizaba". */
export function shortStreet(name: string): string {
  return name
    .replace(/^Avenida\s+/i, 'Av. ')
    .replace(/^Calle\s+/i, '')
    .replace(/^Calzada\s+/i, 'Calz. ')
    .replace(/^Eje Central\s+/i, 'Eje Central ');
}

export function streetAddress(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return names[0] ?? null;
  return `${names[0]} esq. ${names[1]}`;
}
