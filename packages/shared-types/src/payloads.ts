import type { CameraEventType, IncidentPriority } from './enums.js';

/** Camera event as produced by the AI pipeline (Ray-Ban Meta → bridge app → AI). */
export interface CameraEventPayload {
  device_id: string;
  event_type: CameraEventType;
  confidence: number;
  location_id: string;
  priority: Uppercase<IncidentPriority>;
}

/** Drain reading after the gateway converts the Arduino serial line (e.g. `DRAIN001,78`). */
export interface DrainReadingPayload {
  device_code: string;
  value: number;
  unit: 'percent';
  recorded_at: string;
}

export interface HealthResponse {
  status: 'ok' | 'degraded';
  service: string;
  version: string;
  db: 'up' | 'down';
  postgis: string | null;
  uptime_s: number;
  ts: string;
}
