import type { DeviceDto, IncidentDto, IncidentPriority, WeatherDto } from '@simu/shared-types';
import { useQuery } from '@tanstack/react-query';
import type { Feature, FeatureCollection, Polygon } from 'geojson';
import { useMemo } from 'react';
import { create } from 'zustand';
import { useDevices, useIncidents, useWeather } from '../../hooks/queries';
import { api } from '../../lib/api';
import { ACTIVE_INCIDENT_STATUSES } from '../../lib/labels';
import { isStaff, useAuth } from '../../stores/auth';
import { bearingDeg, distanceM, pointInRing, type LngLat } from '../lib/geo';
import { PRIORITY_RANK } from '../lib/visuals';

const ACTIVE = ACTIVE_INCIDENT_STATUSES.join(',');

export interface ZoneInfo {
  code: string;
  name: string;
  alcaldia: string | null;
  ring: Polygon['coordinates'][number];
}

/** Mismas llaves que la consola: la caché se comparte y el WebSocket la mantiene viva. */
export function useGis() {
  const flood = useQuery({
    queryKey: ['gis', 'flood-risk-zones'],
    queryFn: ({ signal }) => api.get<FeatureCollection>('/gis/flood-risk-zones', signal),
    staleTime: Infinity,
  });
  const zones = useQuery({
    queryKey: ['gis', 'zones'],
    queryFn: ({ signal }) => api.get<FeatureCollection>('/gis/zones', signal),
    staleTime: Infinity,
  });
  return { flood, zones };
}

export const lngLatOf = (x: { longitude: number; latitude: number }): LngLat => [
  x.longitude,
  x.latitude,
];

export function useCxData() {
  const user = useAuth((s) => s.user);
  const staff = isStaff(user);
  const devicesQ = useDevices(staff);
  const incidentsQ = useIncidents({ status: ACTIVE, sort: '-priority', page_size: 200 });
  const weatherQ = useWeather();
  const { flood, zones } = useGis();

  const devices = useMemo(() => devicesQ.data ?? [], [devicesQ.data]);
  const incidents = useMemo(() => {
    const list = incidentsQ.data?.data ?? [];
    return [...list].sort(
      (a, b) =>
        PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] ||
        b.created_at.localeCompare(a.created_at),
    );
  }, [incidentsQ.data]);

  const zoneList = useMemo<ZoneInfo[]>(
    () =>
      (zones.data?.features ?? [])
        .filter((f): f is Feature<Polygon> => f.geometry?.type === 'Polygon')
        .map((f) => ({
          code: String(f.properties?.code ?? ''),
          name: String(f.properties?.name ?? ''),
          alcaldia: typeof f.properties?.alcaldia === 'string' ? f.properties.alcaldia : null,
          ring: f.geometry.coordinates[0] ?? [],
        })),
    [zones.data],
  );

  return useMemo(() => {
    const byCode = new Map(devices.map((d) => [d.device_code, d]));
    const zoneOf = (p: LngLat): ZoneInfo | null =>
      zoneList.find((z) => pointInRing(p, z.ring)) ?? null;
    /** Zona de un dispositivo o incidencia: primero la que trae el dato; si no, por ubicación. */
    const zoneOfItem = (x: {
      longitude: number;
      latitude: number;
      metadata: Record<string, unknown>;
    }) => {
      const code = typeof x.metadata.zone === 'string' ? x.metadata.zone : null;
      return (code && zoneList.find((z) => z.code === code)) || zoneOf([x.longitude, x.latitude]);
    };
    const counts: Record<IncidentPriority, number> = { critical: 0, high: 0, medium: 0, low: 0 };
    for (const i of incidents) counts[i.priority]++;
    return {
      user,
      staff,
      loading: devicesQ.isLoading || incidentsQ.isLoading,
      error: incidentsQ.error ?? (staff ? devicesQ.error : null),
      devices,
      incidents,
      weather: (weatherQ.data ?? null) as WeatherDto | null,
      flood: flood.data ?? null,
      zones: zones.data ?? null,
      zoneList,
      byCode,
      cameras: devices.filter((d) => d.type === 'camera'),
      drains: devices.filter((d) => d.type === 'drain'),
      lights: devices.filter((d) => d.type === 'traffic_light'),
      zoneOf,
      zoneOfItem,
      counts,
    };
  }, [
    user,
    staff,
    devices,
    incidents,
    weatherQ.data,
    flood.data,
    zones.data,
    zoneList,
    devicesQ.isLoading,
    incidentsQ.isLoading,
    incidentsQ.error,
    devicesQ.error,
  ]);
}

export type CxData = ReturnType<typeof useCxData>;

/** La cámara "mira" hacia la coladera o incidencia más cercana (el seed no trae orientación). */
export function cameraHeading(
  cam: DeviceDto,
  devices: DeviceDto[],
  incidents: IncidentDto[],
): number {
  if (typeof cam.metadata.heading === 'number') return cam.metadata.heading;
  const p = lngLatOf(cam);
  const targets = [
    ...devices.filter((d) => d.type === 'drain').map(lngLatOf),
    ...incidents.map(lngLatOf),
  ]
    .map((t) => ({ t, d: distanceM(p, t) }))
    .filter((x) => x.d > 3 && x.d < 400)
    .sort((a, b) => a.d - b.d);
  const first = targets[0];
  return first ? bearingDeg(p, first.t) : 135;
}

export function nearest<T extends { longitude: number; latitude: number }>(
  p: LngLat,
  items: readonly T[],
): { item: T; distance: number } | null {
  let best: { item: T; distance: number } | null = null;
  for (const item of items) {
    const d = distanceM(p, lngLatOf(item));
    if (!best || d < best.distance) best = { item, distance: d };
  }
  return best;
}

// ── Historial corto de niveles de coladera (para la tendencia de la predicción) ──

interface DrainHistory {
  samples: Record<string, Array<{ t: number; level: number }>>;
  record(devices: DeviceDto[]): void;
}

export const useDrainHistory = create<DrainHistory>((set, get) => ({
  samples: {},
  record: (devices) => {
    const now = Date.now();
    const next = { ...get().samples };
    let changed = false;
    for (const d of devices) {
      if (!d.drain) continue;
      const list = next[d.device_code] ?? [];
      const last = list[list.length - 1];
      if (last && last.level === d.drain.obstruction_level && now - last.t < 60_000) continue;
      next[d.device_code] = [...list, { t: now, level: d.drain.obstruction_level }]
        .filter((s) => now - s.t <= 30 * 60_000)
        .slice(-60);
      changed = true;
    }
    if (changed) set({ samples: next });
  },
}));

/** Pendiente en puntos por hora de los últimos 10 min (0 si no hay datos suficientes). */
export function trendPerHour(samples: Array<{ t: number; level: number }> | undefined): number {
  if (!samples || samples.length < 2) return 0;
  const now = samples[samples.length - 1]?.t ?? Date.now();
  const recent = samples.filter((s) => now - s.t <= 10 * 60_000);
  const a = recent[0];
  const b = recent[recent.length - 1];
  if (!a || !b || b.t - a.t < 5_000) return 0;
  return ((b.level - a.level) / (b.t - a.t)) * 3_600_000;
}
