import type { Prisma } from '@prisma/client';
import type { IncidentPriority, IncidentStatus, IncidentType, RoleName } from '@simu/shared-types';

export interface IncidentSeed {
  key: string;
  type: IncidentType;
  description: string;
  priority: IncidentPriority;
  confidence: number;
  status: IncidentStatus;
  lat: number;
  lng: number;
  deviceCode?: string;
  /** Assign to the demo user holding this role. */
  assignedToRole?: RoleName;
  /** How long ago the incident was created. */
  ageMinutes: number;
  metadata: Prisma.InputJsonObject;
  events: ReadonlyArray<{
    eventType: string;
    afterMinutes: number;
    payload: Prisma.InputJsonObject;
  }>;
}

/** Five example incidents, one per type (flood_risk and infrastructure_failure are produced live). */
export const INCIDENTS: readonly IncidentSeed[] = [
  {
    key: 'water-parque-mexico',
    type: 'water_accumulation',
    description: 'Encharcamiento de ~10 cm sobre carril de baja velocidad de Av. México.',
    priority: 'medium',
    confidence: 0.81,
    status: 'validated',
    lat: 19.41205,
    lng: -99.16845,
    deviceCode: 'CAM-003',
    ageMinutes: 95,
    metadata: { zone: 'ZONE-003', source: 'camera', camera_event: 'WATER_ACCUMULATION' },
    events: [
      {
        eventType: 'created',
        afterMinutes: 0,
        payload: { source: 'camera', device: 'CAM-003', confidence: 0.81 },
      },
      { eventType: 'validated', afterMinutes: 6, payload: { by_role: 'operator' } },
    ],
  },
  {
    key: 'drain-5-febrero',
    type: 'drain_obstruction',
    description: 'Coladera con obstrucción parcial por basura y hojas (64 %).',
    priority: 'low',
    confidence: 0.9,
    status: 'pending',
    lat: 19.43103,
    lng: -99.13455,
    deviceCode: 'DRAIN-002',
    ageMinutes: 40,
    metadata: { zone: 'ZONE-002', source: 'sensor', obstruction_level: 64 },
    events: [
      {
        eventType: 'created',
        afterMinutes: 0,
        payload: { source: 'sensor', device: 'DRAIN-002', value: 64 },
      },
    ],
  },
  {
    key: 'accident-5-mayo',
    type: 'accident',
    description: 'Colisión entre motocicleta y automóvil; un carril obstruido.',
    priority: 'high',
    confidence: 0.87,
    status: 'validated',
    lat: 19.43395,
    lng: -99.1341,
    deviceCode: 'CAM-002',
    ageMinutes: 22,
    metadata: { zone: 'ZONE-002', source: 'camera', camera_event: 'ACCIDENT', lanes_blocked: 1 },
    events: [
      {
        eventType: 'created',
        afterMinutes: 0,
        payload: { source: 'camera', device: 'CAM-002', confidence: 0.87 },
      },
      { eventType: 'validated', afterMinutes: 2, payload: { by_role: 'operator' } },
    ],
  },
  {
    key: 'obstacle-centenario',
    type: 'obstacle',
    description: 'Rama caída sobre el arroyo vehicular junto al Jardín Centenario.',
    priority: 'medium',
    confidence: 0.76,
    status: 'assigned',
    lat: 19.3498,
    lng: -99.16305,
    deviceCode: 'CAM-004',
    assignedToRole: 'maintenance',
    ageMinutes: 180,
    metadata: { zone: 'ZONE-004', source: 'camera', camera_event: 'OBSTACLE' },
    events: [
      {
        eventType: 'created',
        afterMinutes: 0,
        payload: { source: 'camera', device: 'CAM-004', confidence: 0.76 },
      },
      { eventType: 'validated', afterMinutes: 10, payload: { by_role: 'operator' } },
      {
        eventType: 'assigned',
        afterMinutes: 14,
        payload: { by_role: 'operator', to_role: 'maintenance' },
      },
    ],
  },
  {
    key: 'accessibility-obregon-works',
    type: 'accessibility_block',
    description:
      'Obra bloquea la banqueta sur de Álvaro Obregón entre Orizaba y Córdoba; sin paso para silla de ruedas.',
    priority: 'medium',
    confidence: 1,
    status: 'pending',
    lat: 19.4184,
    lng: -99.15916,
    ageMinutes: 30,
    metadata: {
      zone: 'ZONE-001',
      source: 'citizen_report',
      accessibility_point_key: 'roma-obstacle-obregon-works',
    },
    events: [{ eventType: 'created', afterMinutes: 0, payload: { source: 'citizen_report' } }],
  },
];
