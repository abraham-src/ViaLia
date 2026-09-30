import { Prisma } from '@prisma/client';
import type {
  AlertEvent,
  CameraEventMessage,
  CameraEventResult,
  CameraEventType,
  DeviceEventDto,
  IncidentPriority,
  IngestEvent,
  IngestItemStatus,
  IngestResult,
  PaginatedResponse,
  ReadingIngestResult,
} from '@simu/shared-types';
import { CAMERA_EVENT_TO_INCIDENT, PRIORITY_RANK, WEATHER_EVENT_TYPE } from '@simu/shared-types';
import { ACTIVE_STATUSES } from '../domain/incident-workflow.js';
import { AppError, notFound } from '../lib/errors.js';
import { asObject, incidentInclude, toIncidentDto } from '../lib/serialize.js';
import type { ServiceContext } from './context.js';
import * as devices from './devices.js';
import { evaluateAllDrains, evaluateDrain, evaluateDrainsNearCamera } from './rules-engine.js';

/** Default priority per detection when the camera payload omits it. */
export const DEFAULT_CAMERA_PRIORITY: Record<CameraEventType, IncidentPriority> = {
  WATER_ACCUMULATION: 'high',
  DRAIN_OBSTRUCTION: 'medium',
  ACCIDENT: 'high',
  OBSTACLE: 'medium',
  INFRASTRUCTURE_FAILURE: 'medium',
  ACCESSIBILITY_BLOCK: 'medium',
};

const CAMERA_LABEL: Record<CameraEventType, string> = {
  WATER_ACCUMULATION: 'Acumulación de agua',
  DRAIN_OBSTRUCTION: 'Coladera obstruida',
  ACCIDENT: 'Accidente vial',
  OBSTACLE: 'Obstáculo en vialidad',
  INFRASTRUCTURE_FAILURE: 'Falla de infraestructura',
  ACCESSIBILITY_BLOCK: 'Bloqueo de accesibilidad',
};

/** synced defaults to "arrived on time": late data is flagged as store-and-forward. */
export function inferSynced(ctx: ServiceContext, recordedAt: Date, explicit?: boolean): boolean {
  if (explicit !== undefined) return explicit;
  return Date.now() - recordedAt.getTime() <= ctx.config.SYNC_LATE_THRESHOLD_S * 1000;
}

const isUniqueViolation = (err: unknown): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002';

// ───────────────────────────── Drain readings (+ rules) ─────────────────────────────

/** Stores readings, then runs the rules engine on the drain's current state. */
export async function ingestReadingsAndEvaluate(
  ctx: ServiceContext,
  code: string,
  readings: devices.NormalizedReading[],
): Promise<ReadingIngestResult> {
  const result = await devices.ingestDrainReadings(ctx, code, readings);
  await evaluateDrain(ctx, code, { kind: 'reading' });
  return result;
}

// ───────────────────────────── Camera detections ─────────────────────────────

export interface CameraEventInput {
  deviceCode: string;
  eventType: CameraEventType;
  confidence: number;
  locationId?: string | undefined;
  priority?: IncidentPriority | undefined;
  recordedAt: Date;
  synced?: boolean | undefined;
}

/**
 * Stores a camera detection (idempotent on camera + type + recorded_at), then:
 * - confidence ≥ CAMERA_MIN_CONFIDENCE and not stale → create the incident, or refresh the
 *   open one if the same camera reported the same type within CAMERA_DEDUP_MINUTES
 * - WATER_ACCUMULATION → re-evaluate nearby drains (combined-risk rule)
 */
export async function ingestCameraEvent(
  ctx: ServiceContext,
  input: CameraEventInput,
): Promise<CameraEventResult> {
  const camera = await ctx.prisma.device.findUnique({ where: { deviceCode: input.deviceCode } });
  if (!camera || camera.type !== 'camera') throw notFound(`Cámara ${input.deviceCode}`);

  const zone = asObject(camera.metadata).zone;
  const locationId = input.locationId ?? (typeof zone === 'string' ? zone : null);
  const priority = input.priority ?? DEFAULT_CAMERA_PRIORITY[input.eventType];
  const synced = inferSynced(ctx, input.recordedAt, input.synced);

  let eventId: bigint;
  try {
    const stored = await ctx.prisma.deviceEvent.create({
      data: {
        deviceId: camera.id,
        eventType: input.eventType,
        confidence: input.confidence,
        recordedAt: input.recordedAt,
        synced,
        payload: { location_id: locationId, priority: priority.toUpperCase() },
      },
      select: { id: true },
    });
    eventId = stored.id;
  } catch (err) {
    if (isUniqueViolation(err)) return { status: 'duplicate', event_id: null, incident_id: null };
    throw err;
  }

  const ageMs = Date.now() - input.recordedAt.getTime();
  const actionable =
    input.confidence >= ctx.config.CAMERA_MIN_CONFIDENCE &&
    ageMs <= ctx.config.CAMERA_EVENT_MAX_AGE_MIN * 60_000;

  const incidentId = actionable
    ? await upsertCameraIncident(ctx, camera, input, priority, locationId, eventId)
    : null;

  ctx.hub.publish<CameraEventMessage>('camera-events', 'detected', {
    device_code: input.deviceCode,
    event_type: input.eventType,
    confidence: input.confidence,
    location_id: locationId,
    priority: priority.toUpperCase() as CameraEventMessage['priority'],
    recorded_at: input.recordedAt.toISOString(),
    synced,
    incident_id: incidentId,
  });

  if (actionable && input.eventType === 'WATER_ACCUMULATION') {
    await evaluateDrainsNearCamera(ctx, camera.id, {
      kind: 'camera',
      device_code: input.deviceCode,
      event_type: input.eventType,
    });
  }

  return { status: 'accepted', event_id: eventId.toString(), incident_id: incidentId };
}

async function upsertCameraIncident(
  ctx: ServiceContext,
  camera: { id: string; deviceCode: string; latitude: number; longitude: number },
  input: CameraEventInput,
  priority: IncidentPriority,
  locationId: string | null,
  eventId: bigint,
): Promise<string> {
  const type = CAMERA_EVENT_TO_INCIDENT[input.eventType];
  const since = new Date(Date.now() - ctx.config.CAMERA_DEDUP_MINUTES * 60_000);

  const result = await ctx.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${camera.id}))`;
    const open = await tx.incident.findFirst({
      where: {
        deviceId: camera.id,
        type,
        status: { in: [...ACTIVE_STATUSES] },
        createdAt: { gte: since },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (open) {
      const raise = PRIORITY_RANK[priority] > PRIORITY_RANK[open.priority];
      const refreshed = await tx.incident.update({
        where: { id: open.id },
        data: {
          confidence: Math.max(open.confidence.toNumber(), input.confidence),
          ...(raise && { priority }),
          events: {
            create: {
              eventType: 'redetected',
              payload: {
                source: 'camera',
                device_event_id: eventId.toString(),
                confidence: input.confidence,
                ...(raise && { priority_from: open.priority, priority_to: priority }),
              },
            },
          },
        },
        include: incidentInclude,
      });
      return { kind: 'updated' as const, incident: refreshed };
    }

    const created = await tx.incident.create({
      data: {
        type,
        priority,
        confidence: input.confidence,
        // Gender-neutral phrasing ("Accidente vial", "Acumulación de agua", ...).
        description: `${CAMERA_LABEL[input.eventType]} · detección de ${camera.deviceCode}`,
        latitude: camera.latitude,
        longitude: camera.longitude,
        deviceId: camera.id,
        metadata: {
          source: 'camera',
          camera_event: input.eventType,
          location_id: locationId,
          device_event_id: eventId.toString(),
        },
        events: {
          create: {
            eventType: 'created',
            payload: {
              source: 'camera',
              device: camera.deviceCode,
              camera_event: input.eventType,
              confidence: input.confidence,
              device_event_id: eventId.toString(),
            },
          },
        },
      },
      include: incidentInclude,
    });
    return { kind: 'created' as const, incident: created };
  });

  const dto = toIncidentDto(result.incident);
  ctx.hub.publish('incidents', result.kind, dto);
  if (result.kind === 'created' && PRIORITY_RANK[priority] >= PRIORITY_RANK.high) {
    ctx.hub.publish<AlertEvent>('alerts', 'created', {
      incident_id: dto.id,
      device_code: camera.deviceCode,
      priority,
      label: CAMERA_LABEL[input.eventType].toUpperCase(),
      message: dto.description,
      kind: 'created',
      source: 'camera',
      rule_name: null,
      facts: { camera_event: input.eventType, confidence: input.confidence },
    });
  }
  return dto.id;
}

// ───────────────────────────── Weather ─────────────────────────────

export interface WeatherInput {
  deviceCode: string;
  raining: boolean;
  intensityMmH?: number | undefined;
  zone?: string | undefined;
  recordedAt: Date;
  synced?: boolean | undefined;
}

/** Stores a weather report and re-evaluates every drain (rain changes the rule outcome). */
export async function ingestWeather(
  ctx: ServiceContext,
  input: WeatherInput,
): Promise<'accepted' | 'duplicate'> {
  const device = await ctx.prisma.device.findUnique({ where: { deviceCode: input.deviceCode } });
  if (!device) throw notFound(`Dispositivo ${input.deviceCode}`);
  try {
    await ctx.prisma.deviceEvent.create({
      data: {
        deviceId: device.id,
        eventType: WEATHER_EVENT_TYPE,
        recordedAt: input.recordedAt,
        synced: inferSynced(ctx, input.recordedAt, input.synced),
        payload: {
          raining: input.raining,
          intensity_mm_h: input.intensityMmH ?? null,
          zone: input.zone ?? null,
        },
      },
    });
  } catch (err) {
    if (isUniqueViolation(err)) return 'duplicate';
    throw err;
  }
  await evaluateAllDrains(ctx, { kind: 'weather', raining: input.raining });
  return 'accepted';
}

// ───────────────────────────── Event log ─────────────────────────────

export async function listEvents(
  ctx: ServiceContext,
  filter: { from: Date; to: Date; deviceCode?: string; types?: string[] },
  page: { page: number; pageSize: number },
): Promise<PaginatedResponse<DeviceEventDto>> {
  const where: Prisma.DeviceEventWhereInput = {
    recordedAt: { gte: filter.from, lte: filter.to },
    ...(filter.deviceCode && { device: { deviceCode: filter.deviceCode } }),
    ...(filter.types && { eventType: { in: filter.types } }),
  };
  const [total, rows] = await ctx.prisma.$transaction([
    ctx.prisma.deviceEvent.count({ where }),
    ctx.prisma.deviceEvent.findMany({
      where,
      include: { device: { select: { deviceCode: true } } },
      orderBy: [{ recordedAt: 'desc' }, { id: 'desc' }],
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    }),
  ]);
  return {
    data: rows.map((e) => ({
      id: e.id.toString(),
      device_code: e.device.deviceCode,
      event_type: e.eventType,
      confidence: e.confidence ? e.confidence.toNumber() : null,
      payload: asObject(e.payload),
      recorded_at: e.recordedAt.toISOString(),
      received_at: e.receivedAt.toISOString(),
      synced: e.synced,
    })),
    meta: { page: page.page, page_size: page.pageSize, total },
  };
}

// ───────────────────────────── Batch ingest (store-and-forward) ─────────────────────────────

const recordedAtOf = (e: IngestEvent): number =>
  e.recorded_at ? new Date(e.recorded_at).getTime() : Date.now();

/**
 * Processes a gateway backlog in chronological order. Each item succeeds or fails on its
 * own (one bad item never blocks the rest), and re-sending the same batch is harmless.
 */
export async function ingestBatch(
  ctx: ServiceContext,
  events: IngestEvent[],
): Promise<IngestResult> {
  const ordered = events
    .map((event, index) => ({ event, index }))
    .sort((a, b) => recordedAtOf(a.event) - recordedAtOf(b.event));

  const results: IngestResult['results'] = [];
  for (const { event, index } of ordered) {
    try {
      const status = await ingestOne(ctx, event);
      results.push({ index, type: event.type, status });
    } catch (err) {
      // Invalid events are rejected for good; anything else (database down, a bug) is
      // reported as `failed` so the gateway keeps the event and retries it later.
      if (err instanceof AppError && err.statusCode < 500) {
        results.push({ index, type: event.type, status: 'rejected', error: err.message });
      } else {
        ctx.log.error({ err, index }, 'ingest item failed');
        results.push({
          index,
          type: event.type,
          status: 'failed',
          error: 'Error interno al procesar el evento',
        });
      }
    }
  }
  results.sort((a, b) => a.index - b.index);

  const count = (s: IngestItemStatus) => results.filter((r) => r.status === s).length;
  return {
    received: events.length,
    accepted: count('accepted'),
    duplicates: count('duplicate'),
    stale: count('stale'),
    rejected: count('rejected'),
    failed: count('failed'),
    results,
  };
}

async function ingestOne(ctx: ServiceContext, event: IngestEvent): Promise<IngestItemStatus> {
  const recordedAt = event.recorded_at ? new Date(event.recorded_at) : new Date();
  switch (event.type) {
    case 'drain_reading': {
      const res = await ingestReadingsAndEvaluate(ctx, event.device_code, [
        {
          value: event.value,
          unit: event.unit ?? 'percent',
          recordedAt,
          synced: inferSynced(ctx, recordedAt, event.synced),
          metadata: { via: 'events/ingest' },
        },
      ]);
      return res.inserted > 0 ? 'accepted' : 'duplicate';
    }
    case 'camera_event': {
      const res = await ingestCameraEvent(ctx, {
        deviceCode: event.device_id,
        eventType: event.event_type,
        confidence: event.confidence,
        locationId: event.location_id,
        priority: event.priority?.toLowerCase() as IncidentPriority | undefined,
        recordedAt,
        synced: event.synced,
      });
      return res.status;
    }
    case 'weather':
      return ingestWeather(ctx, {
        deviceCode: event.device_code,
        raining: event.raining,
        intensityMmH: event.intensity_mm_h,
        zone: event.zone,
        recordedAt,
        synced: event.synced,
      });
    case 'heartbeat': {
      // A heartbeat delivered late says nothing about the device being alive *now*.
      if (Date.now() - recordedAt.getTime() > ctx.config.HEARTBEAT_TIMEOUT_S * 1000) return 'stale';
      await devices.recordHeartbeat(ctx, event.device_code, event.status ?? 'online', undefined);
      return 'accepted';
    }
  }
}
