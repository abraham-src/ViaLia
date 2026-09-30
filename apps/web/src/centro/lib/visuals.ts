import type {
  DeviceStatus,
  DrainStatus,
  IncidentPriority,
  IncidentStatus,
  IncidentType,
} from '@simu/shared-types';

/** Orden de severidad de mayor a menor (el código usa 4 niveles; el maquetado usaba 3 + normal). */
export const PRIORITIES: readonly IncidentPriority[] = ['critical', 'high', 'medium', 'low'];

export const PRIORITY_RANK: Record<IncidentPriority, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export const PRIORITY_COLOR: Record<IncidentPriority, string> = {
  critical: '#e5484d',
  high: '#f5812a',
  medium: '#eeb000',
  low: '#3b9cf0',
};

export const PRIORITY_SOFT: Record<IncidentPriority, string> = {
  critical: '#fdecec',
  high: '#fff1e6',
  medium: '#fff7d6',
  low: '#e8f3fe',
};

export const PRIORITY_TEXT: Record<IncidentPriority, string> = {
  critical: 'Crítica',
  high: 'Alta',
  medium: 'Media',
  low: 'Baja',
};

export const OK_COLOR = '#1fa464';
export const BLUE = '#2563eb';
export const NAVY = '#0b1b34';

export const DRAIN_COLOR: Record<DrainStatus, string> = {
  normal: OK_COLOR,
  caution: '#eeb000',
  alert: '#f5812a',
  critical: '#e5484d',
};

export const DEVICE_STATUS_COLOR: Record<DeviceStatus, string> = {
  online: OK_COLOR,
  degraded: '#eeb000',
  offline: '#e5484d',
  maintenance: '#8591a6',
};

/** Etiquetas en español de las clases que reporta la cámara. */
export const CAMERA_EVENT_LABEL: Record<string, string> = {
  WATER_ACCUMULATION: 'Agua acumulada',
  DRAIN_OBSTRUCTION: 'Coladera obstruida',
  ACCIDENT: 'Accidente',
  OBSTACLE: 'Obstáculo',
  INFRASTRUCTURE_FAILURE: 'Falla de infraestructura',
  ACCESSIBILITY_BLOCK: 'Bloqueo de accesibilidad',
};

export type SceneKind =
  'drain' | 'water' | 'accident' | 'obstacle' | 'accessibility' | 'infrastructure';

export interface IncidentVisual {
  /** Título corto para tarjetas ("Obstrucción en coladera"). */
  title: string;
  /** Etiqueta del recuadro de detección. */
  evidence: string;
  /** Clases que busca el modelo para este tipo (no son detecciones reales). */
  classes: string[];
  scene: SceneKind;
  /** Afecta la circulación vehicular (lo usa la intersección). */
  affectsTraffic: boolean;
  hydric: boolean;
}

export const INCIDENT_VISUAL: Record<IncidentType, IncidentVisual> = {
  drain_obstruction: {
    title: 'Obstrucción en coladera',
    evidence: 'Obstrucción detectada',
    classes: ['Basura', 'Hojas', 'Plástico', 'Sedimentos'],
    scene: 'drain',
    affectsTraffic: false,
    hydric: true,
  },
  flood_risk: {
    title: 'Riesgo de inundación',
    evidence: 'Coladera saturada',
    classes: ['Agua acumulada', 'Coladera obstruida', 'Hojas', 'Basura'],
    scene: 'drain',
    affectsTraffic: true,
    hydric: true,
  },
  water_accumulation: {
    title: 'Acumulación de agua',
    evidence: 'Agua en carril',
    classes: ['Agua', 'Carril afectado', 'Reflejo'],
    scene: 'water',
    affectsTraffic: true,
    hydric: true,
  },
  accident: {
    title: 'Accidente vial',
    evidence: 'Vehículos detenidos',
    classes: ['Automóvil', 'Motocicleta', 'Carril bloqueado'],
    scene: 'accident',
    affectsTraffic: true,
    hydric: false,
  },
  obstacle: {
    title: 'Obstáculo en la vía',
    evidence: 'Obstáculo detectado',
    classes: ['Rama', 'Escombro', 'Carril reducido'],
    scene: 'obstacle',
    affectsTraffic: true,
    hydric: false,
  },
  infrastructure_failure: {
    title: 'Falla de infraestructura',
    evidence: 'Daño en superficie',
    classes: ['Bache', 'Grieta', 'Tapa dañada'],
    scene: 'infrastructure',
    affectsTraffic: true,
    hydric: false,
  },
  accessibility_block: {
    title: 'Bloqueo de accesibilidad',
    evidence: 'Paso peatonal bloqueado',
    classes: ['Obra', 'Vallas', 'Rampa bloqueada'],
    scene: 'accessibility',
    affectsTraffic: false,
    hydric: false,
  },
};

/** Pasos del ciclo operativo de la memoria (sección 11). */
export const WORKFLOW_STEPS: ReadonlyArray<{
  key: string;
  label: string;
  statuses: IncidentStatus[];
}> = [
  { key: 'detected', label: 'Detectada', statuses: ['pending'] },
  { key: 'validated', label: 'Validada', statuses: ['validated'] },
  { key: 'assigned', label: 'Asignada', statuses: ['assigned'] },
  { key: 'in_progress', label: 'En atención', statuses: ['in_progress'] },
  { key: 'resolved', label: 'Resuelta', statuses: ['resolved'] },
];

export function workflowIndex(status: IncidentStatus): number {
  const i = WORKFLOW_STEPS.findIndex((s) => s.statuses.includes(status));
  return i < 0 ? 0 : i;
}

const WHEN = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** "30 sept 2026, 04:29 h" en hora del centro de México. */
export function formatWhen(iso: string | null | undefined): string {
  return iso ? `${WHEN.format(new Date(iso))} h` : '—';
}

export function initials(name: string | null | undefined): string {
  if (!name) return '··';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '··';
}
