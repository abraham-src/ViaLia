import type {
  AccessibilityPointType,
  CameraEventType,
  AccessibilityStatus,
  DeviceStatus,
  DeviceType,
  DrainStatus,
  IncidentPriority,
  IncidentStatus,
  IncidentType,
  RoleName,
  RouteStatus,
  UserStatus,
} from './enums.js';
import type { GeoJsonLineString, LngLatTuple } from './geo.js';

/** All timestamps are ISO-8601 UTC strings. JSON objects are plain records. */
export type JsonObject = Record<string, unknown>;

// ───────────────────────────── Envelope ─────────────────────────────

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ListResponse<T> {
  data: T[];
}

export interface PaginatedResponse<T> {
  data: T[];
  meta: { page: number; page_size: number; total: number };
}

// ───────────────────────────── Auth ─────────────────────────────

export interface AuthUserDto {
  id: string;
  name: string;
  email: string;
  role: RoleName;
  status: UserStatus;
}

/** User as seen by administrators (GET /users). */
export interface UserAdminDto extends AuthUserDto {
  created_at: string;
  updated_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface TokenResponse {
  access_token: string;
  token_type: 'Bearer';
  /** Access-token lifetime in seconds. */
  expires_in: number;
  /** Also set as an httpOnly cookie; browsers should rely on the cookie. */
  refresh_token: string;
  user: AuthUserDto;
}

// ───────────────────────────── Devices ─────────────────────────────

export interface CameraInfoDto {
  model: string;
  location_description: string;
  stream_url: string | null;
  status: DeviceStatus;
}

export interface DrainInfoDto {
  obstruction_level: number;
  status: DrainStatus;
  last_reading_at: string | null;
}

export interface DeviceDto {
  id: string;
  device_code: string;
  type: DeviceType;
  name: string;
  latitude: number;
  longitude: number;
  status: DeviceStatus;
  last_heartbeat: string | null;
  metadata: JsonObject;
  camera: CameraInfoDto | null;
  drain: DrainInfoDto | null;
  created_at: string;
  updated_at: string;
}

export interface SensorReadingDto {
  id: string;
  device_code: string;
  value: number;
  unit: string;
  recorded_at: string;
  received_at: string;
  synced: boolean;
}

/** One bucket of GET /drains/:code/readings/series. */
export interface ReadingSeriesPoint {
  /** Bucket start, ISO-8601. */
  t: string;
  avg: number;
  max: number;
  /** Readings in the bucket. */
  n: number;
}

export interface ReadingInput {
  value: number;
  unit?: string;
  recorded_at: string;
  synced?: boolean;
  metadata?: JsonObject;
}

export interface ReadingIngestResult {
  device_code: string;
  received: number;
  inserted: number;
  duplicates: number;
  drain: DrainInfoDto;
}

export interface HeartbeatInput {
  status?: Extract<DeviceStatus, 'online' | 'degraded'>;
  health?: JsonObject;
}

export interface HeartbeatResult {
  device_code: string;
  status: DeviceStatus;
  received_at: string;
}

// ───────────────────────────── Incidents ─────────────────────────────

export interface IncidentDto {
  id: string;
  device_code: string | null;
  type: IncidentType;
  description: string;
  priority: IncidentPriority;
  confidence: number;
  status: IncidentStatus;
  latitude: number;
  longitude: number;
  created_at: string;
  updated_at: string;
  validated_at: string | null;
  resolved_at: string | null;
  assigned_to: { id: string; name: string } | null;
  metadata: JsonObject;
}

export interface IncidentEventDto {
  id: string;
  incident_id: string;
  event_type: string;
  payload: JsonObject;
  created_at: string;
}

/** Row of GET /incident-events (cross-incident audit log). */
export interface AuditLogEntryDto extends IncidentEventDto {
  incident_type: IncidentType;
  incident_priority: IncidentPriority;
  device_code: string | null;
}

export interface CreateIncidentInput {
  type: IncidentType;
  description: string;
  latitude: number;
  longitude: number;
  priority?: IncidentPriority;
  confidence?: number;
  device_code?: string;
  metadata?: JsonObject;
}

// ───────────────────────────── Accessibility ─────────────────────────────

export interface AccessibilityPointDto {
  id: string;
  type: AccessibilityPointType;
  status: AccessibilityStatus;
  latitude: number;
  longitude: number;
  source: string;
  name: string | null;
  metadata: JsonObject;
  ramp: { slope: number | null; width_m: number | null } | null;
}

export interface AccessibleRouteDto {
  id: string;
  status: RouteStatus;
  name: string | null;
  origin: LngLatTuple;
  destination: LngLatTuple;
  path: GeoJsonLineString;
  length_m: number;
  created_at: string;
  metadata: JsonObject;
}

/** Something the router avoided (or would have to cross). */
export interface RouteBlocker {
  kind: 'incident' | 'accessibility_point' | 'manual';
  id: string | null;
  label: string;
  latitude: number;
  longitude: number;
  radius_m: number;
}

export interface RouteStep {
  instruction: string;
  distance_m: number;
  street: string | null;
}

export interface ComputedRoute {
  path: GeoJsonLineString;
  length_m: number;
  duration_min: number;
  /** Ramps at the corners this route crosses. */
  ramps: Array<{ id: string; name: string | null; latitude: number; longitude: number }>;
  steps: RouteStep[];
}

/** Result of computing a route between two points (spec §7.2 Accesibilidad). */
export interface RouteComputation {
  found: boolean;
  accessible: boolean;
  /** active = the direct route is clear; alternative = it detours around blockers. */
  status: 'active' | 'alternative' | 'none';
  route: ComputedRoute | null;
  /** The route ignoring blockers, shown when an alternative was needed. */
  baseline: (ComputedRoute & { blocked_by: RouteBlocker[] }) | null;
  avoided: RouteBlocker[];
  origin_snap_m: number;
  destination_snap_m: number;
  message: string;
}

export interface RouteRequest {
  origin: LngLatTuple;
  destination: LngLatTuple;
  accessible?: boolean;
  /** Extra points to avoid (e.g. a closure reported by phone). */
  avoid?: Array<{ lng: number; lat: number; radius_m?: number }>;
}

// ───────────────────────────── Rules ─────────────────────────────

export interface RuleDto {
  id: string;
  name: string;
  description: string;
  conditions: JsonObject;
  action: JsonObject;
  enabled: boolean;
  sort_order: number;
  updated_at: string;
}

// ───────────────────────────── Device events (Phase 3) ─────────────────────────────

/** Stored camera detection or weather report (GET /events). */
export interface DeviceEventDto {
  id: string;
  device_code: string;
  event_type: string;
  confidence: number | null;
  payload: JsonObject;
  recorded_at: string;
  received_at: string;
  synced: boolean;
}

/** One item of POST /events/ingest (gateway store-and-forward batch). */
export type IngestEvent =
  | {
      type: 'camera_event';
      /** Camera code, e.g. CAM-001 (spec payload name). */
      device_id: string;
      event_type: CameraEventType;
      confidence: number;
      location_id?: string;
      priority?: Uppercase<IncidentPriority>;
      recorded_at?: string;
      synced?: boolean;
    }
  | {
      type: 'drain_reading';
      device_code: string;
      value: number;
      unit?: string;
      recorded_at: string;
      synced?: boolean;
    }
  | {
      type: 'weather';
      device_code: string;
      raining: boolean;
      intensity_mm_h?: number;
      zone?: string;
      recorded_at?: string;
      synced?: boolean;
    }
  | {
      type: 'heartbeat';
      device_code: string;
      status?: 'online' | 'degraded';
      recorded_at?: string;
    };

/**
 * Per-event ingest outcome. `rejected` is permanent (invalid event: the gateway
 * dead-letters it). `failed` is a server-side error: the gateway keeps it and retries.
 */
export type IngestItemStatus = 'accepted' | 'duplicate' | 'stale' | 'rejected' | 'failed';

export interface IngestResult {
  received: number;
  accepted: number;
  duplicates: number;
  stale: number;
  rejected: number;
  failed: number;
  results: Array<{ index: number; type: string; status: IngestItemStatus; error?: string }>;
}

export interface CameraEventResult {
  status: 'accepted' | 'duplicate';
  event_id: string | null;
  /** Incident created or refreshed by this detection, if any. */
  incident_id: string | null;
}

export interface WeatherDto {
  raining: boolean;
  intensity_mm_h: number | null;
  zone: string | null;
  device_code: string;
  recorded_at: string;
}

export interface AnalyzeRequest {
  device_id: string;
  location_id?: string;
  frame_ref?: string;
  /** Force a class (demo scenarios). */
  hint?: CameraEventType;
  /** Also process the detection as a camera event (default true). */
  ingest?: boolean;
}

export interface AnalyzeResponse {
  detection: {
    device_id: string;
    event_type: CameraEventType;
    confidence: number;
    location_id: string | null;
    priority: Uppercase<IncidentPriority>;
    analyzed_at: string;
    backend: 'ai-service' | 'mock' | 'mock-fallback';
  };
  ingested: CameraEventResult | null;
}
