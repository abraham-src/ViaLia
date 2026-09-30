/**
 * Domain enums shared by API, simulator and web.
 * They MUST stay in sync with the Postgres enums in database/schema.prisma.
 * apps/api/test/enums.test.ts fails if they drift apart.
 */

export const ROLE_NAMES = ['admin', 'operator', 'maintenance', 'citizen'] as const;
export type RoleName = (typeof ROLE_NAMES)[number];

export const USER_STATUSES = ['active', 'inactive', 'suspended'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const DEVICE_TYPES = ['camera', 'drain', 'traffic_light', 'sensor', 'gateway'] as const;
export type DeviceType = (typeof DEVICE_TYPES)[number];

export const DEVICE_STATUSES = ['online', 'offline', 'degraded', 'maintenance'] as const;
export type DeviceStatus = (typeof DEVICE_STATUSES)[number];

export const DRAIN_STATUSES = ['normal', 'caution', 'alert', 'critical'] as const;
export type DrainStatus = (typeof DRAIN_STATUSES)[number];

export const INCIDENT_TYPES = [
  'water_accumulation',
  'drain_obstruction',
  'accident',
  'obstacle',
  'infrastructure_failure',
  'accessibility_block',
  'flood_risk',
] as const;
export type IncidentType = (typeof INCIDENT_TYPES)[number];

export const INCIDENT_PRIORITIES = ['low', 'medium', 'high', 'critical'] as const;
export type IncidentPriority = (typeof INCIDENT_PRIORITIES)[number];

/** Severity rank (higher = more severe). Used to decide escalations. */
export const PRIORITY_RANK: Record<IncidentPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

export const INCIDENT_STATUSES = [
  'pending',
  'validated',
  'assigned',
  'in_progress',
  'resolved',
  'rejected',
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];

export const ACCESSIBILITY_POINT_TYPES = [
  'ramp',
  'sidewalk',
  'crosswalk',
  'accessible_route',
  'obstacle',
  'temporarily_disabled',
] as const;
export type AccessibilityPointType = (typeof ACCESSIBILITY_POINT_TYPES)[number];

export const ACCESSIBILITY_STATUSES = ['available', 'blocked', 'damaged', 'unknown'] as const;
export type AccessibilityStatus = (typeof ACCESSIBILITY_STATUSES)[number];

export const ROUTE_STATUSES = ['active', 'blocked', 'alternative'] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

/** Event types emitted by the camera / AI pipeline (payload contract, upper case). */
export const CAMERA_EVENT_TYPES = [
  'WATER_ACCUMULATION',
  'DRAIN_OBSTRUCTION',
  'ACCIDENT',
  'OBSTACLE',
  'INFRASTRUCTURE_FAILURE',
  'ACCESSIBILITY_BLOCK',
] as const;
export type CameraEventType = (typeof CAMERA_EVENT_TYPES)[number];

/** Camera detection → incident type. */
export const CAMERA_EVENT_TO_INCIDENT: Record<CameraEventType, IncidentType> = {
  WATER_ACCUMULATION: 'water_accumulation',
  DRAIN_OBSTRUCTION: 'drain_obstruction',
  ACCIDENT: 'accident',
  OBSTACLE: 'obstacle',
  INFRASTRUCTURE_FAILURE: 'infrastructure_failure',
  ACCESSIBILITY_BLOCK: 'accessibility_block',
};

/** device_events.event_type used for weather reports. */
export const WEATHER_EVENT_TYPE = 'WEATHER';

/** Operational zones used by camera payloads (`location_id`). */
export const ZONE_CODES = ['ZONE-001', 'ZONE-002', 'ZONE-003', 'ZONE-004'] as const;
export type ZoneCode = (typeof ZONE_CODES)[number];
