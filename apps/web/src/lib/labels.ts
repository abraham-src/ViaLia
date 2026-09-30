import type {
  AccessibilityPointType,
  AccessibilityStatus,
  DeviceStatus,
  DeviceType,
  DrainStatus,
  IncidentPriority,
  IncidentStatus,
  IncidentType,
  RoleName,
} from '@simu/shared-types';

/** UI labels (es-MX). The API speaks English enums; only the UI translates them. */

export const INCIDENT_TYPE_LABEL: Record<IncidentType, string> = {
  water_accumulation: 'Acumulación de agua',
  drain_obstruction: 'Coladera obstruida',
  accident: 'Accidente',
  obstacle: 'Obstáculo',
  infrastructure_failure: 'Falla de infraestructura',
  accessibility_block: 'Bloqueo de accesibilidad',
  flood_risk: 'Riesgo de inundación',
};

export const PRIORITY_LABEL: Record<IncidentPriority, string> = {
  low: 'Baja',
  medium: 'Media',
  high: 'Alta',
  critical: 'Crítica',
};

export const INCIDENT_STATUS_LABEL: Record<IncidentStatus, string> = {
  pending: 'Pendiente',
  validated: 'Validada',
  assigned: 'Asignada',
  in_progress: 'En atención',
  resolved: 'Resuelta',
  rejected: 'Rechazada',
};

export const DEVICE_STATUS_LABEL: Record<DeviceStatus, string> = {
  online: 'En línea',
  offline: 'Fuera de línea',
  degraded: 'Degradado',
  maintenance: 'Mantenimiento',
};

export const DEVICE_TYPE_LABEL: Record<DeviceType, string> = {
  camera: 'Cámara',
  drain: 'Coladera',
  traffic_light: 'Semáforo',
  sensor: 'Sensor',
  gateway: 'Gateway',
};

export const DRAIN_STATUS_LABEL: Record<DrainStatus, string> = {
  normal: 'Normal',
  caution: 'Precaución',
  alert: 'Alerta',
  critical: 'Crítico',
};

export const ROLE_LABEL: Record<RoleName, string> = {
  admin: 'Administración',
  operator: 'Operación',
  maintenance: 'Mantenimiento',
  citizen: 'Ciudadanía',
};

export const ACCESSIBILITY_TYPE_LABEL: Record<AccessibilityPointType, string> = {
  ramp: 'Rampa',
  sidewalk: 'Banqueta',
  crosswalk: 'Cruce',
  accessible_route: 'Ruta accesible',
  obstacle: 'Obstáculo',
  temporarily_disabled: 'Inhabilitado temporal',
};

export const ACCESSIBILITY_STATUS_LABEL: Record<AccessibilityStatus, string> = {
  available: 'Disponible',
  blocked: 'Bloqueado',
  damaged: 'Dañado',
  unknown: 'Sin dato',
};

export const ACTIVE_INCIDENT_STATUSES: readonly IncidentStatus[] = [
  'pending',
  'validated',
  'assigned',
  'in_progress',
];
