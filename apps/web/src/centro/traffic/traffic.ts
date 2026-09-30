import { useQuery } from '@tanstack/react-query';
import type { Feature, FeatureCollection, LineString } from 'geojson';
import type { ExpressionSpecification } from 'maplibre-gl';
import { useMemo } from 'react';
import { create } from 'zustand';

/**
 * Tráfico en tiempo real que genera el simulador de campo sobre tramos reales de la CDMX.
 * La red (geometría) se pide una vez; el estado de cada tramo, cada pocos segundos.
 * Todas las vistas de mapa leen de aquí, así el tráfico se ve igual en todas.
 */
export type TrafficLevel = 'free' | 'moderate' | 'heavy' | 'stopped';

export interface TrafficZone {
  code: string;
  name: string;
  enabled: boolean;
  mode: 'auto' | TrafficLevel;
  segments: number;
}

export interface TrafficSnapshot {
  updated_at: string;
  hour_cdmx: number;
  zones: TrafficZone[];
  segments: Array<{ id: string; c: number; level: TrafficLevel; speed_kmh: number }>;
}

interface SegmentProps {
  id: string;
  street: string;
  zone: string;
  free_kmh: number;
  length_m: number;
}

export interface LiveSegmentProps extends SegmentProps {
  c: number;
  level: TrafficLevel;
  speed_kmh: number;
}

export type TrafficNetwork = FeatureCollection<LineString, SegmentProps>;
export type LiveTraffic = FeatureCollection<LineString, LiveSegmentProps>;

const BASE = '/simulator';
export const TRAFFIC_POLL_MS = 3000;

export const TRAFFIC_COLOR: Record<TrafficLevel, string> = {
  free: '#16a34a',
  moderate: '#f59e0b',
  heavy: '#ef4444',
  stopped: '#9f1239',
};

export const TRAFFIC_LABEL: Record<TrafficLevel, string> = {
  free: 'Libre',
  moderate: 'Moderado',
  heavy: 'Denso',
  stopped: 'Detenido',
};

export const TRAFFIC_LINE_COLOR = [
  'match',
  ['get', 'level'],
  'free',
  TRAFFIC_COLOR.free,
  'moderate',
  TRAFFIC_COLOR.moderate,
  'heavy',
  TRAFFIC_COLOR.heavy,
  TRAFFIC_COLOR.stopped,
] as unknown as ExpressionSpecification;

/** Grosor por zoom; `extra` sirve para el contorno blanco. */
export function trafficLineWidth(extra = 0): ExpressionSpecification {
  const stops = [11, 1.6, 14, 3.2, 17, 7, 19, 12];
  return [
    'interpolate',
    ['exponential', 1.5],
    ['zoom'],
    ...stops.map((v, i) => (i % 2 ? v + extra : v)),
  ] as unknown as ExpressionSpecification;
}

async function getJson<T>(path: string): Promise<T> {
  const r = await fetch(`${BASE}${path}`, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`simulador ${path}: ${r.status}`);
  return (await r.json()) as T;
}

/** Mostrar/ocultar el tráfico, compartido por todos los mapas. */
export const useTrafficUi = create<{ visible: boolean; toggle(): void }>((set) => ({
  visible: true,
  toggle: () => set((s) => ({ visible: !s.visible })),
}));

const EMPTY: LiveTraffic = { type: 'FeatureCollection', features: [] };

export function useTraffic() {
  const network = useQuery({
    queryKey: ['traffic', 'network'],
    queryFn: () => getJson<TrafficNetwork>('/traffic/network'),
    staleTime: Infinity,
    retry: 2,
  });
  const state = useQuery({
    queryKey: ['traffic', 'state'],
    queryFn: () => getJson<TrafficSnapshot>('/traffic'),
    refetchInterval: TRAFFIC_POLL_MS,
    refetchIntervalInBackground: false,
    retry: 1,
  });

  const live = useMemo<LiveTraffic>(() => {
    if (!network.data || !state.data) return EMPTY;
    const byId = new Map(state.data.segments.map((s) => [s.id, s]));
    const features: Array<Feature<LineString, LiveSegmentProps>> = [];
    for (const f of network.data.features) {
      const s = byId.get(f.properties.id);
      if (!s) continue;
      features.push({
        ...f,
        properties: { ...f.properties, c: s.c, level: s.level, speed_kmh: s.speed_kmh },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [network.data, state.data]);

  return {
    live,
    snapshot: state.data,
    /** El simulador no responde (se muestran los últimos datos si los hay). */
    offline: state.isError || network.isError,
    loading: state.isLoading || network.isLoading,
  };
}

/** Promedio ponderado por longitud de la congestión de un conjunto de tramos. */
export function avgCongestion(
  features: ReadonlyArray<Feature<LineString, LiveSegmentProps>>,
): number {
  let w = 0;
  let acc = 0;
  for (const f of features) {
    w += f.properties.length_m;
    acc += f.properties.c * f.properties.length_m;
  }
  return w ? acc / w : 0;
}

export function levelOf(c: number): TrafficLevel {
  return c < 0.35 ? 'free' : c < 0.6 ? 'moderate' : c < 0.82 ? 'heavy' : 'stopped';
}
