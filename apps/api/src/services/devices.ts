import type { Prisma } from '@prisma/client';
import type {
  DeviceDto,
  DeviceStatus,
  DeviceStatusEvent,
  DeviceType,
  DrainReadingEvent,
  HeartbeatEvent,
  HeartbeatResult,
  JsonObject,
  ReadingIngestResult,
  ReadingSeriesPoint,
  SensorReadingDto,
} from '@simu/shared-types';
import { drainStatusFromLevel } from '@simu/shared-utils';
import { badRequest, notFound } from '../lib/errors.js';
import {
  deviceInclude,
  toDeviceDto,
  toDrainInfoDto,
  toReadingDto,
  type DeviceWithRelations,
} from '../lib/serialize.js';
import type { ServiceContext } from './context.js';

export async function listDevices(
  ctx: ServiceContext,
  filter: { types?: DeviceType[]; statuses?: DeviceStatus[] },
): Promise<DeviceDto[]> {
  const rows = await ctx.prisma.device.findMany({
    where: {
      ...(filter.types && { type: { in: filter.types } }),
      ...(filter.statuses && { status: { in: filter.statuses } }),
    },
    include: deviceInclude,
    orderBy: { deviceCode: 'asc' },
  });
  return rows.map(toDeviceDto);
}

async function findDeviceOrThrow(
  ctx: ServiceContext,
  code: string,
  expectedType?: DeviceType,
): Promise<DeviceWithRelations> {
  const device = await ctx.prisma.device.findUnique({
    where: { deviceCode: code },
    include: deviceInclude,
  });
  if (!device || (expectedType && device.type !== expectedType)) {
    throw notFound(`Dispositivo ${code}`);
  }
  return device;
}

export async function getDevice(
  ctx: ServiceContext,
  code: string,
  expectedType?: DeviceType,
): Promise<DeviceDto> {
  return toDeviceDto(await findDeviceOrThrow(ctx, code, expectedType));
}

/** Persists a status change, mirrors it on cameras.status and notifies devices:status. */
async function applyStatus(
  ctx: ServiceContext,
  device: DeviceWithRelations,
  status: DeviceStatus,
  extra: { lastHeartbeat?: Date; reason: string | null },
): Promise<DeviceWithRelations> {
  const updated = await ctx.prisma.device.update({
    where: { id: device.id },
    data: {
      status,
      ...(extra.lastHeartbeat && { lastHeartbeat: extra.lastHeartbeat }),
      ...(device.camera && status !== device.status && { camera: { update: { status } } }),
    },
    include: deviceInclude,
  });

  if (status !== device.status) {
    ctx.hub.publish<DeviceStatusEvent>('devices:status', 'status_changed', {
      device_code: device.deviceCode,
      status,
      previous_status: device.status,
      last_heartbeat: updated.lastHeartbeat?.toISOString() ?? null,
      reason: extra.reason,
    });
  }
  return updated;
}

export async function setDeviceStatus(
  ctx: ServiceContext,
  code: string,
  status: DeviceStatus,
  reason: string | null,
): Promise<DeviceDto> {
  const device = await findDeviceOrThrow(ctx, code);
  return toDeviceDto(await applyStatus(ctx, device, status, { reason }));
}

/**
 * Records a heartbeat. A device in `maintenance` keeps that status (manual override);
 * otherwise the reported status (default online) is applied, which also brings an
 * `offline` device back online.
 */
export async function recordHeartbeat(
  ctx: ServiceContext,
  code: string,
  reported: 'online' | 'degraded',
  health: JsonObject | undefined,
): Promise<HeartbeatResult> {
  const device = await findDeviceOrThrow(ctx, code);
  const receivedAt = new Date();
  const status: DeviceStatus = device.status === 'maintenance' ? 'maintenance' : reported;

  await ctx.prisma.heartbeat.create({
    data: { deviceId: device.id, receivedAt, status: reported },
  });
  await applyStatus(ctx, device, status, {
    lastHeartbeat: receivedAt,
    reason: reported === 'degraded' ? 'heartbeat_degraded' : 'heartbeat',
  });

  const event: HeartbeatEvent = {
    device_code: code,
    status,
    received_at: receivedAt.toISOString(),
  };
  ctx.hub.publish('heartbeats', 'received', event);
  if (health && Object.keys(health).length > 0) {
    await ctx.prisma.device.update({
      where: { id: device.id },
      data: {
        metadata: {
          ...(device.metadata as Prisma.JsonObject),
          last_health: health as Prisma.InputJsonObject,
        },
      },
    });
  }
  return event;
}

// ───────────────────────────── Drain readings ─────────────────────────────

export interface NormalizedReading {
  value: number;
  unit: string;
  recordedAt: Date;
  synced: boolean;
  metadata: JsonObject;
}

/**
 * Stores drain readings idempotently (unique device_id + recorded_at) and updates the
 * drain's current level only when the newest reading is newer than what we have, so a
 * late store-and-forward batch never overwrites a fresher value.
 */
export async function ingestDrainReadings(
  ctx: ServiceContext,
  code: string,
  readings: NormalizedReading[],
): Promise<ReadingIngestResult> {
  const device = await findDeviceOrThrow(ctx, code, 'drain');
  const drain = device.drain;
  if (!drain) throw notFound(`Coladera ${code}`);
  if (readings.length === 0) throw badRequest('No se recibieron lecturas');

  const { count: inserted } = await ctx.prisma.sensorReading.createMany({
    data: readings.map((r) => ({
      deviceId: device.id,
      value: r.value,
      unit: r.unit,
      recordedAt: r.recordedAt,
      synced: r.synced,
      metadata: r.metadata as Prisma.InputJsonObject,
    })),
    skipDuplicates: true,
  });

  const newest = readings.reduce((a, b) => (b.recordedAt > a.recordedAt ? b : a));
  let current = drain;
  if (!drain.lastReadingAt || newest.recordedAt > drain.lastReadingAt) {
    const level = Math.round(newest.value);
    current = await ctx.prisma.drain.update({
      where: { id: drain.id },
      data: {
        obstructionLevel: level,
        status: drainStatusFromLevel(level),
        lastReadingAt: newest.recordedAt,
      },
    });
  }

  if (inserted > 0) {
    ctx.hub.publish<DrainReadingEvent>('drain-readings', 'reading', {
      device_code: code,
      value: newest.value,
      recorded_at: newest.recordedAt.toISOString(),
      synced: newest.synced,
      obstruction_level: current.obstructionLevel,
      drain_status: current.status,
      batch_size: readings.length,
    });
  }

  return {
    device_code: code,
    received: readings.length,
    inserted,
    duplicates: readings.length - inserted,
    drain: toDrainInfoDto(current),
  };
}

export async function listReadings(
  ctx: ServiceContext,
  code: string,
  range: { from: Date; to: Date; limit: number },
): Promise<SensorReadingDto[]> {
  const device = await findDeviceOrThrow(ctx, code, 'drain');
  // The most recent `limit` readings of the window, returned oldest → newest.
  const rows = await ctx.prisma.sensorReading.findMany({
    where: { deviceId: device.id, recordedAt: { gte: range.from, lte: range.to } },
    orderBy: { recordedAt: 'desc' },
    take: range.limit,
  });
  return rows.reverse().map((r) => toReadingDto(r, code));
}

interface SeriesRow {
  bucket: Date;
  avg: number;
  max: number;
  n: number;
}

/**
 * Time series aggregated in Postgres (date_bin): one point per bucket with the average
 * and maximum level. A 24 h sparkline gets 48 points instead of ~17 000 raw readings.
 */
export async function readingSeries(
  ctx: ServiceContext,
  code: string,
  range: { from: Date; to: Date; bucketMinutes: number },
): Promise<ReadingSeriesPoint[]> {
  const device = await findDeviceOrThrow(ctx, code, 'drain');
  const rows = await ctx.prisma.$queryRaw<SeriesRow[]>`
    SELECT date_bin(make_interval(mins => ${range.bucketMinutes}::int), recorded_at, TIMESTAMPTZ '2000-01-01') AS bucket,
           AVG(value)::float8 AS avg,
           MAX(value)::float8 AS max,
           COUNT(*)::int AS n
    FROM sensor_readings
    WHERE device_id = ${device.id}::uuid
      AND recorded_at >= ${range.from}
      AND recorded_at <= ${range.to}
    GROUP BY bucket
    ORDER BY bucket ASC`;
  return rows.map((r) => ({
    t: r.bucket.toISOString(),
    avg: Math.round(r.avg * 10) / 10,
    max: Math.round(r.max * 10) / 10,
    n: r.n,
  }));
}
