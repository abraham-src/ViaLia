import type { Prisma } from '@prisma/client';
import type { AlertEvent, IncidentDto, JsonObject, WeatherDto } from '@simu/shared-types';
import { PRIORITY_RANK, WEATHER_EVENT_TYPE } from '@simu/shared-types';
import { ACTIVE_STATUSES } from '../domain/incident-workflow.js';
import {
  evaluateRules,
  maxCameraRadius,
  parseRule,
  type EngineRule,
  type FactResolver,
  type FactValue,
  type RuleMatch,
} from '../domain/rules-engine.js';
import { asObject, incidentInclude, toIncidentDto } from '../lib/serialize.js';
import type { ServiceContext } from './context.js';

export type EngineTrigger =
  | { kind: 'reading' }
  | { kind: 'camera'; device_code: string; event_type: string }
  | { kind: 'weather'; raining: boolean };

export interface EngineOutcome {
  device_code: string;
  action: 'none' | 'created' | 'escalated' | 'unchanged';
  incident_id: string | null;
  rule: string | null;
}

const DEFAULT_CAMERA_WINDOW = { radius_m: 250, seconds: 900 };

/** Enabled, valid rules in evaluation order. Invalid DSL rows are logged and skipped. */
export async function loadRules(ctx: ServiceContext): Promise<EngineRule[]> {
  const rows = await ctx.prisma.rule.findMany({
    where: { enabled: true },
    orderBy: { sortOrder: 'asc' },
  });
  const rules: EngineRule[] = [];
  for (const row of rows) {
    const rule = parseRule(row);
    if (rule) rules.push(rule);
    else ctx.log.warn({ rule_id: row.id }, 'rules engine: skipping rule with invalid DSL');
  }
  return rules;
}

/** Latest weather report within WEATHER_MAX_AGE_MIN, for the zone or city-wide. */
export async function currentWeather(
  ctx: ServiceContext,
  zone: string | null,
): Promise<WeatherDto | null> {
  const since = new Date(Date.now() - ctx.config.WEATHER_MAX_AGE_MIN * 60_000);
  const recent = await ctx.prisma.deviceEvent.findMany({
    where: { eventType: WEATHER_EVENT_TYPE, recordedAt: { gte: since } },
    orderBy: { recordedAt: 'desc' },
    take: 50,
    include: { device: { select: { deviceCode: true } } },
  });
  for (const e of recent) {
    const p = asObject(e.payload);
    const reportZone = typeof p.zone === 'string' ? p.zone : null;
    if (reportZone === null || zone === null || reportZone === zone) {
      return {
        raining: p.raining === true,
        intensity_mm_h: typeof p.intensity_mm_h === 'number' ? p.intensity_mm_h : null,
        zone: reportZone,
        device_code: e.device.deviceCode,
        recorded_at: e.recordedAt.toISOString(),
      };
    }
  }
  return null;
}

interface CameraWindowResult {
  n: number;
  max_conf: number | null;
}

/** WATER_ACCUMULATION detections by cameras within radius/time of a point (PostGIS geography). */
async function cameraWaterNear(
  ctx: ServiceContext,
  point: { lng: number; lat: number },
  window: { radius_m: number; seconds: number },
): Promise<CameraWindowResult> {
  const since = new Date(Date.now() - window.seconds * 1000);
  const rows = await ctx.prisma.$queryRaw<CameraWindowResult[]>`
    SELECT COUNT(*)::int AS n, MAX(e.confidence)::float8 AS max_conf
    FROM device_events e
    JOIN devices c ON c.id = e.device_id
    WHERE e.event_type = 'WATER_ACCUMULATION'
      AND e.recorded_at >= ${since}
      AND e.confidence >= ${ctx.config.CAMERA_MIN_CONFIDENCE}
      AND c.type = 'camera'
      AND ST_DWithin(
        c.geom::geography,
        ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography,
        ${window.radius_m}
      )`;
  return rows[0] ?? { n: 0, max_conf: null };
}

/** Drain device ids within `radiusM` meters of a camera. */
export async function drainsNearCamera(
  ctx: ServiceContext,
  cameraDeviceId: string,
  radiusM: number,
): Promise<string[]> {
  const rows = await ctx.prisma.$queryRaw<Array<{ device_code: string }>>`
    SELECT d.device_code
    FROM devices d, devices cam
    WHERE cam.id = ${cameraDeviceId}::uuid
      AND d.type = 'drain'
      AND ST_DWithin(d.geom::geography, cam.geom::geography, ${radiusM})
    ORDER BY d.device_code`;
  return rows.map((r) => r.device_code);
}

function describe(match: RuleMatch, deviceCode: string): string {
  const f = match.facts;
  const parts = [`coladera ${deviceCode} al ${String(f['drain.obstruction_level'])} %`];
  if (f['weather.raining'] === true) parts.push('con lluvia');
  if (f['camera.water_detected'] === true) parts.push('y agua detectada por cámara');
  const label = match.rule.action.label ?? match.rule.name;
  return `${label}: ${parts.join(' ')}`;
}

/**
 * Evaluates every enabled rule for one drain and applies the most severe match:
 * - no active rules-engine incident for this drain → create one
 * - an active one with lower priority → escalate it (priority, type, description)
 * - otherwise → unchanged (no duplicate incidents, no alert spam)
 * Serialized per drain with a transaction-scoped advisory lock.
 */
export async function evaluateDrain(
  ctx: ServiceContext,
  deviceCode: string,
  trigger: EngineTrigger,
): Promise<EngineOutcome> {
  const device = await ctx.prisma.device.findUnique({
    where: { deviceCode },
    include: { drain: true },
  });
  if (!device?.drain)
    return { device_code: deviceCode, action: 'none', incident_id: null, rule: null };
  const drain = device.drain;
  const zone =
    typeof asObject(device.metadata).zone === 'string'
      ? (asObject(device.metadata).zone as string)
      : null;

  const rules = await loadRules(ctx);
  if (rules.length === 0)
    return { device_code: deviceCode, action: 'none', incident_id: null, rule: null };

  const point = { lng: drain.longitude, lat: drain.latitude };
  const resolve: FactResolver = async (condition) => {
    switch (condition.fact) {
      case 'drain.obstruction_level':
        return drain.obstructionLevel;
      case 'weather.raining':
        return (await currentWeather(ctx, zone))?.raining ?? false;
      case 'camera.water_detected':
        return (await cameraWaterNear(ctx, point, condition.window ?? DEFAULT_CAMERA_WINDOW)).n > 0;
      case 'camera.confidence':
        return (await cameraWaterNear(ctx, point, condition.window ?? DEFAULT_CAMERA_WINDOW))
          .max_conf;
    }
  };

  const { winner } = await evaluateRules(rules, resolve);
  if (!winner) return { device_code: deviceCode, action: 'none', incident_id: null, rule: null };

  const action = winner.rule.action;
  const facts = winner.facts as Record<string, FactValue>;
  const label = action.label ?? winner.rule.name;
  const ruleInfo: JsonObject = { rule_id: winner.rule.id, rule_name: winner.rule.name, label };

  const result = await ctx.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${device.id}))`;

    const open = await tx.incident.findFirst({
      where: {
        deviceId: device.id,
        status: { in: [...ACTIVE_STATUSES] },
        metadata: { path: ['source'], equals: 'rules_engine' },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!open) {
      const created = await tx.incident.create({
        data: {
          type: action.incident_type,
          priority: action.set_priority,
          confidence: 1,
          description: describe(winner, deviceCode),
          latitude: drain.latitude,
          longitude: drain.longitude,
          deviceId: device.id,
          metadata: { source: 'rules_engine', zone, ...ruleInfo, facts } as Prisma.InputJsonObject,
          events: {
            create: {
              eventType: 'created',
              payload: {
                source: 'rules_engine',
                ...ruleInfo,
                facts,
                trigger,
              } as Prisma.InputJsonObject,
            },
          },
        },
        include: incidentInclude,
      });
      return { kind: 'created' as const, incident: created, previous: null };
    }

    if (PRIORITY_RANK[action.set_priority] > PRIORITY_RANK[open.priority]) {
      const escalated = await tx.incident.update({
        where: { id: open.id },
        data: {
          priority: action.set_priority,
          type: action.incident_type,
          description: describe(winner, deviceCode),
          metadata: { ...asObject(open.metadata), ...ruleInfo, facts } as Prisma.InputJsonObject,
          events: {
            create: {
              eventType: 'priority_raised',
              payload: {
                from: open.priority,
                to: action.set_priority,
                ...ruleInfo,
                facts,
                trigger,
              } as Prisma.InputJsonObject,
            },
          },
        },
        include: incidentInclude,
      });
      return { kind: 'escalated' as const, incident: escalated, previous: open.priority };
    }

    return { kind: 'unchanged' as const, incident: null, previous: null };
  });

  if (result.kind === 'unchanged' || !result.incident) {
    return {
      device_code: deviceCode,
      action: 'unchanged',
      incident_id: null,
      rule: winner.rule.name,
    };
  }

  const dto: IncidentDto = toIncidentDto(result.incident);
  if (result.kind === 'created') ctx.hub.publish('incidents', 'created', dto);
  else
    ctx.hub.publish('incidents', 'priority_raised', { ...dto, previous_priority: result.previous });

  if (action.emit_alert) {
    ctx.hub.publish<AlertEvent>('alerts', result.kind, {
      incident_id: dto.id,
      device_code: deviceCode,
      priority: dto.priority,
      label,
      message: dto.description,
      kind: result.kind,
      source: 'rules_engine',
      rule_name: winner.rule.name,
      facts,
    });
  }

  ctx.log.info(
    { device: deviceCode, action: result.kind, rule: winner.rule.name, priority: dto.priority },
    'rules engine applied',
  );
  return {
    device_code: deviceCode,
    action: result.kind,
    incident_id: dto.id,
    rule: winner.rule.name,
  };
}

/** Re-evaluates every drain (after a weather change). */
export async function evaluateAllDrains(
  ctx: ServiceContext,
  trigger: EngineTrigger,
): Promise<EngineOutcome[]> {
  const drains = await ctx.prisma.device.findMany({
    where: { type: 'drain' },
    select: { deviceCode: true },
    orderBy: { deviceCode: 'asc' },
  });
  const outcomes: EngineOutcome[] = [];
  for (const d of drains) outcomes.push(await evaluateDrain(ctx, d.deviceCode, trigger));
  return outcomes;
}

/** Re-evaluates drains near a camera (after a WATER_ACCUMULATION detection). */
export async function evaluateDrainsNearCamera(
  ctx: ServiceContext,
  cameraDeviceId: string,
  trigger: EngineTrigger,
): Promise<EngineOutcome[]> {
  const rules = await loadRules(ctx);
  const codes = await drainsNearCamera(ctx, cameraDeviceId, maxCameraRadius(rules));
  const outcomes: EngineOutcome[] = [];
  for (const code of codes) outcomes.push(await evaluateDrain(ctx, code, trigger));
  return outcomes;
}
