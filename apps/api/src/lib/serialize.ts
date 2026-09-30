import type { IncidentEvent, Prisma, Rule, SensorReading } from '@prisma/client';
import type {
  AccessibilityPointDto,
  AuthUserDto,
  DeviceDto,
  DrainInfoDto,
  IncidentDto,
  IncidentEventDto,
  JsonObject,
  RuleDto,
  SensorReadingDto,
} from '@simu/shared-types';

const iso = (d: Date): string => d.toISOString();
const isoOrNull = (d: Date | null): string | null => (d ? d.toISOString() : null);
const num = (d: Prisma.Decimal): number => d.toNumber();
const numOrNull = (d: Prisma.Decimal | null): number | null => (d ? d.toNumber() : null);

/** jsonb columns are always objects in this schema; guard anyway. */
export function asObject(v: Prisma.JsonValue): JsonObject {
  return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as JsonObject) : {};
}

// ── Prisma include shapes (single source for queries + mappers) ──

export const deviceInclude = { camera: true, drain: true } satisfies Prisma.DeviceInclude;
export type DeviceWithRelations = Prisma.DeviceGetPayload<{ include: typeof deviceInclude }>;

export const incidentInclude = {
  device: { select: { deviceCode: true } },
  assignedTo: { select: { id: true, name: true } },
} satisfies Prisma.IncidentInclude;
export type IncidentWithRelations = Prisma.IncidentGetPayload<{ include: typeof incidentInclude }>;

export const pointInclude = {
  ramps: { take: 1, select: { slope: true, widthM: true } },
} satisfies Prisma.AccessibilityPointInclude;
export type PointWithRamp = Prisma.AccessibilityPointGetPayload<{ include: typeof pointInclude }>;

// ── Mappers ──

export function toAuthUserDto(u: {
  id: string;
  name: string;
  email: string;
  status: AuthUserDto['status'];
  role: { name: AuthUserDto['role'] };
}): AuthUserDto {
  return { id: u.id, name: u.name, email: u.email, role: u.role.name, status: u.status };
}

export function toDrainInfoDto(d: {
  obstructionLevel: number;
  status: DrainInfoDto['status'];
  lastReadingAt: Date | null;
}): DrainInfoDto {
  return {
    obstruction_level: d.obstructionLevel,
    status: d.status,
    last_reading_at: isoOrNull(d.lastReadingAt),
  };
}

export function toDeviceDto(d: DeviceWithRelations): DeviceDto {
  return {
    id: d.id,
    device_code: d.deviceCode,
    type: d.type,
    name: d.name,
    latitude: d.latitude,
    longitude: d.longitude,
    status: d.status,
    last_heartbeat: isoOrNull(d.lastHeartbeat),
    metadata: asObject(d.metadata),
    camera: d.camera
      ? {
          model: d.camera.model,
          location_description: d.camera.locationDescription,
          stream_url: d.camera.streamUrl,
          status: d.camera.status,
        }
      : null,
    drain: d.drain ? toDrainInfoDto(d.drain) : null,
    created_at: iso(d.createdAt),
    updated_at: iso(d.updatedAt),
  };
}

export function toReadingDto(r: SensorReading, deviceCode: string): SensorReadingDto {
  return {
    id: r.id.toString(),
    device_code: deviceCode,
    value: num(r.value),
    unit: r.unit,
    recorded_at: iso(r.recordedAt),
    received_at: iso(r.receivedAt),
    synced: r.synced,
  };
}

export function toIncidentDto(i: IncidentWithRelations): IncidentDto {
  return {
    id: i.id,
    device_code: i.device?.deviceCode ?? null,
    type: i.type,
    description: i.description,
    priority: i.priority,
    confidence: num(i.confidence),
    status: i.status,
    latitude: i.latitude,
    longitude: i.longitude,
    created_at: iso(i.createdAt),
    updated_at: iso(i.updatedAt),
    validated_at: isoOrNull(i.validatedAt),
    resolved_at: isoOrNull(i.resolvedAt),
    assigned_to: i.assignedTo ? { id: i.assignedTo.id, name: i.assignedTo.name } : null,
    metadata: asObject(i.metadata),
  };
}

export function toIncidentEventDto(e: IncidentEvent): IncidentEventDto {
  return {
    id: e.id.toString(),
    incident_id: e.incidentId,
    event_type: e.eventType,
    payload: asObject(e.payload),
    created_at: iso(e.createdAt),
  };
}

export function toAccessibilityPointDto(p: PointWithRamp): AccessibilityPointDto {
  const meta = asObject(p.metadata);
  const ramp = p.ramps[0];
  return {
    id: p.id,
    type: p.type,
    status: p.status,
    latitude: p.latitude,
    longitude: p.longitude,
    source: p.source,
    name: typeof meta.name === 'string' ? meta.name : null,
    metadata: meta,
    ramp: ramp ? { slope: numOrNull(ramp.slope), width_m: numOrNull(ramp.widthM) } : null,
  };
}

export function toRuleDto(r: Rule): RuleDto {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    conditions: asObject(r.conditions),
    action: asObject(r.action),
    enabled: r.enabled,
    sort_order: r.sortOrder,
    updated_at: iso(r.updatedAt),
  };
}
