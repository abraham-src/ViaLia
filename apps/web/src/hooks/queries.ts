import type {
  AccessibilityPointDto,
  DeviceDto,
  IncidentDto,
  ListResponse,
  PaginatedResponse,
  ReadingSeriesPoint,
  SensorReadingDto,
  WeatherDto,
} from '@simu/shared-types';
import { useQuery } from '@tanstack/react-query';
import { api, qs } from '../lib/api';

export interface IncidentQuery {
  status?: string;
  priority?: string;
  type?: string;
  bbox?: string;
  assigned_to?: string;
  q?: string;
  sort?: string;
  page?: number;
  page_size?: number;
}

/** Query keys in one place so the live sync can patch/invalidate them. */
export const qk = {
  devices: ['devices'] as const,
  incidents: (q: IncidentQuery) => ['incidents', q] as const,
  incidentsAll: ['incidents'] as const,
  readings: (code: string) => ['readings', code] as const,
  series: (code: string, hours: number, bucketMin: number) =>
    ['series', code, hours, bucketMin] as const,
  weather: ['weather'] as const,
  points: (q: Record<string, string | undefined>) => ['points', q] as const,
};

export function useDevices(enabled = true) {
  return useQuery({
    queryKey: qk.devices,
    queryFn: ({ signal }) =>
      api.get<ListResponse<DeviceDto>>('/devices', signal).then((r) => r.data),
    enabled,
    // Live updates arrive over WebSocket; polling is only a safety net.
    refetchInterval: 60_000,
  });
}

export function useIncidents(q: IncidentQuery, enabled = true) {
  return useQuery({
    queryKey: qk.incidents(q),
    queryFn: ({ signal }) =>
      api.get<PaginatedResponse<IncidentDto>>(`/incidents${qs({ ...q })}`, signal),
    enabled,
    refetchInterval: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useReadings(code: string, enabled = true) {
  return useQuery({
    queryKey: qk.readings(code),
    queryFn: ({ signal }) =>
      api
        .get<ListResponse<SensorReadingDto>>(`/drains/${code}/readings`, signal)
        .then((r) => r.data),
    enabled,
    staleTime: 5 * 60_000,
  });
}

/** Aggregated drain series (Postgres date_bin). Default: 24 h in 30-min buckets. */
export function useReadingSeries(code: string, hours = 24, bucketMin = 30, enabled = true) {
  return useQuery({
    queryKey: qk.series(code, hours, bucketMin),
    queryFn: ({ signal }) =>
      api
        .get<ListResponse<ReadingSeriesPoint>>(
          `/drains/${code}/readings/series${qs({ hours, bucket_min: bucketMin })}`,
          signal,
        )
        .then((r) => r.data),
    enabled,
    refetchInterval: 60_000,
  });
}

export function useWeather() {
  return useQuery({
    queryKey: qk.weather,
    queryFn: ({ signal }) =>
      api.get<{ data: WeatherDto | null }>('/weather', signal).then((r) => r.data),
    refetchInterval: 60_000,
  });
}

export function useAccessibilityPoints(q: Record<string, string | undefined> = {}) {
  return useQuery({
    queryKey: qk.points(q),
    queryFn: ({ signal }) =>
      api
        .get<ListResponse<AccessibilityPointDto>>(`/accessibility/points${qs(q)}`, signal)
        .then((r) => r.data),
    staleTime: 60_000,
  });
}
