import type { RoleName } from '@simu/shared-types';
import { DEVICE_STATUSES, DEVICE_TYPES } from '@simu/shared-types';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import { toPointCollection } from '../lib/geojson.js';
import { csvEnum, deviceCodeParam, isoDate, jsonObject, parse } from '../lib/validation.js';
import type { AuthGuards } from '../plugins/auth.js';
import type { ServiceContext } from '../services/context.js';
import * as devices from '../services/devices.js';
import * as events from '../services/events.js';

/** Device internals are staff-only; citizens use the public accessibility/incident feeds. */
const STAFF: RoleName[] = ['admin', 'operator', 'maintenance'];

const ListQuery = z.object({
  type: csvEnum(DEVICE_TYPES),
  status: csvEnum(DEVICE_STATUSES),
  format: z.enum(['json', 'geojson']).default('json'),
});

const StatusBody = z.object({
  status: z.enum(DEVICE_STATUSES),
  reason: z.string().max(300).optional(),
});

const HeartbeatBody = z
  .object({
    status: z.enum(['online', 'degraded']).default('online'),
    health: jsonObject.optional(),
  })
  .default({});

const MAX_FUTURE_MS = 5 * 60_000;

const ReadingSchema = z.object({
  device_code: z.string().optional(),
  value: z.number().finite(),
  unit: z.string().min(1).max(20).default('percent'),
  recorded_at: isoDate.refine(
    (d) => d.getTime() <= Date.now() + MAX_FUTURE_MS,
    'recorded_at no puede estar en el futuro',
  ),
  /** Omitted → inferred from how late the reading arrived (store-and-forward). */
  synced: z.boolean().optional(),
  metadata: jsonObject.default({}),
});

/** Single reading (spec payload) or a store-and-forward batch. */
const ReadingsBody = z.union([
  z.object({ readings: z.array(ReadingSchema).min(1).max(500) }),
  ReadingSchema,
]);

const SeriesQuery = z.object({
  hours: z.coerce.number().int().min(1).max(168).default(24),
  bucket_min: z.coerce.number().int().min(1).max(1440).default(30),
});

const ReadingsQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(5000).default(1000),
});

export function deviceRoutes(ctx: ServiceContext, guards: AuthGuards): FastifyPluginAsync {
  return async (app) => {
    // ── Devices ──
    app.get('/devices', { preHandler: guards.requireUser(...STAFF) }, async (req) => {
      const q = parse(ListQuery, req.query);
      const list = await devices.listDevices(ctx, { types: q.type, statuses: q.status });
      return q.format === 'geojson' ? toPointCollection(list) : { data: list };
    });

    app.get('/devices/:code', { preHandler: guards.requireUser(...STAFF) }, async (req) => {
      const { code } = parse(deviceCodeParam, req.params);
      return devices.getDevice(ctx, code);
    });

    app.patch(
      '/devices/:code/status',
      { preHandler: guards.requireUser(...STAFF) },
      async (req) => {
        const { code } = parse(deviceCodeParam, req.params);
        const body = parse(StatusBody, req.body);
        return devices.setDeviceStatus(ctx, code, body.status, body.reason ?? 'manual');
      },
    );

    app.post(
      '/devices/:code/heartbeat',
      { preHandler: guards.requireDeviceOrUser('admin', 'operator') },
      async (req) => {
        const { code } = parse(deviceCodeParam, req.params);
        const body = parse(HeartbeatBody, req.body ?? {});
        return devices.recordHeartbeat(ctx, code, body.status, body.health);
      },
    );

    // ── Cameras ──
    app.get('/cameras', { preHandler: guards.requireUser(...STAFF) }, async (req) => {
      const q = parse(ListQuery.omit({ type: true }), req.query);
      const list = await devices.listDevices(ctx, { types: ['camera'], statuses: q.status });
      return q.format === 'geojson' ? toPointCollection(list) : { data: list };
    });

    app.get('/cameras/:code', { preHandler: guards.requireUser(...STAFF) }, async (req) => {
      const { code } = parse(deviceCodeParam, req.params);
      return devices.getDevice(ctx, code, 'camera');
    });

    // ── Drains ──
    app.get('/drains', { preHandler: guards.requireUser(...STAFF) }, async (req) => {
      const q = parse(ListQuery.omit({ type: true }), req.query);
      const list = await devices.listDevices(ctx, { types: ['drain'], statuses: q.status });
      return q.format === 'geojson' ? toPointCollection(list) : { data: list };
    });

    app.get('/drains/:code', { preHandler: guards.requireUser(...STAFF) }, async (req) => {
      const { code } = parse(deviceCodeParam, req.params);
      return devices.getDevice(ctx, code, 'drain');
    });

    app.get('/drains/:code/readings', { preHandler: guards.requireUser(...STAFF) }, async (req) => {
      const { code } = parse(deviceCodeParam, req.params);
      const q = parse(ReadingsQuery, req.query);
      const to = q.to ?? new Date();
      const from = q.from ?? new Date(to.getTime() - 24 * 3600_000);
      if (from > to) throw badRequest('from debe ser anterior a to');
      return { data: await devices.listReadings(ctx, code, { from, to, limit: q.limit }) };
    });

    app.get(
      '/drains/:code/readings/series',
      { preHandler: guards.requireUser(...STAFF) },
      async (req) => {
        const { code } = parse(deviceCodeParam, req.params);
        const q = parse(SeriesQuery, req.query);
        const to = new Date();
        const from = new Date(to.getTime() - q.hours * 3600_000);
        return {
          data: await devices.readingSeries(ctx, code, { from, to, bucketMinutes: q.bucket_min }),
        };
      },
    );

    app.post(
      '/drains/:code/readings',
      { preHandler: guards.requireDeviceOrUser('admin', 'operator') },
      async (req, reply) => {
        const { code } = parse(deviceCodeParam, req.params);
        const body = parse(ReadingsBody, req.body);
        const list = 'readings' in body ? body.readings : [body];

        for (const r of list) {
          if (r.device_code && r.device_code !== code) {
            throw badRequest(`device_code ${r.device_code} no coincide con ${code}`);
          }
          if (r.unit === 'percent' && (r.value < 0 || r.value > 100)) {
            throw badRequest('El valor en porcentaje debe estar entre 0 y 100');
          }
        }

        const result = await events.ingestReadingsAndEvaluate(
          ctx,
          code,
          list.map((r) => ({
            value: r.value,
            unit: r.unit,
            recordedAt: r.recorded_at,
            synced: events.inferSynced(ctx, r.recorded_at, r.synced),
            metadata: r.metadata,
          })),
        );
        return reply.code(result.inserted > 0 ? 201 : 200).send(result);
      },
    );
  };
}
