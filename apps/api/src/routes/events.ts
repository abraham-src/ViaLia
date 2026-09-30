import type { IngestEvent } from '@simu/shared-types';
import { CAMERA_EVENT_TYPES } from '@simu/shared-types';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { badRequest } from '../lib/errors.js';
import { isoDate, parse } from '../lib/validation.js';
import type { AuthGuards } from '../plugins/auth.js';
import type { ServiceContext } from '../services/context.js';
import * as events from '../services/events.js';
import { currentWeather } from '../services/rules-engine.js';

const MAX_FUTURE_MS = 5 * 60_000;
const code = z.string().regex(/^[A-Z]{2,10}-\d{3}$/, 'código de dispositivo inválido');
const recordedAt = z
  .string()
  .datetime({ offset: true })
  .refine((s) => new Date(s).getTime() <= Date.now() + MAX_FUTURE_MS, 'recorded_at en el futuro');

const IngestItem = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('camera_event'),
    device_id: code,
    event_type: z.enum(CAMERA_EVENT_TYPES),
    confidence: z.number().min(0).max(1),
    location_id: z.string().max(40).optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
    recorded_at: recordedAt.optional(),
    synced: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('drain_reading'),
    device_code: code,
    value: z.number().min(0).max(100),
    unit: z.literal('percent').optional(),
    recorded_at: recordedAt,
    synced: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('weather'),
    device_code: code,
    raining: z.boolean(),
    intensity_mm_h: z.number().min(0).max(500).optional(),
    zone: z.string().max(40).optional(),
    recorded_at: recordedAt.optional(),
    synced: z.boolean().optional(),
  }),
  z.object({
    type: z.literal('heartbeat'),
    device_code: code,
    status: z.enum(['online', 'degraded']).optional(),
    recorded_at: recordedAt.optional(),
  }),
]);

const IngestBody = z.object({ events: z.array(IngestItem).min(1).max(500) });

const ListQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  device_id: code.optional(),
  type: z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : undefined,
    ),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(500).default(100),
});

export function eventRoutes(ctx: ServiceContext, guards: AuthGuards): FastifyPluginAsync {
  return async (app) => {
    app.get(
      '/events',
      { preHandler: guards.requireUser('admin', 'operator', 'maintenance') },
      async (req) => {
        const q = parse(ListQuery, req.query);
        const to = q.to ?? new Date();
        const from = q.from ?? new Date(to.getTime() - 24 * 3600_000);
        if (from > to) throw badRequest('from debe ser anterior a to');
        return events.listEvents(
          ctx,
          { from, to, deviceCode: q.device_id, types: q.type },
          { page: q.page, pageSize: q.page_size },
        );
      },
    );

    /** Gateway / simulator backlog (store-and-forward). Per-item results, never all-or-nothing. */
    app.post(
      '/events/ingest',
      {
        preHandler: guards.requireDeviceOrUser('admin', 'operator'),
        bodyLimit: 2 * 1024 * 1024,
      },
      async (req) => {
        const body = parse(IngestBody, req.body);
        return events.ingestBatch(ctx, body.events as IngestEvent[]);
      },
    );

    app.get('/weather', { preHandler: guards.requireUser() }, async () => ({
      data: await currentWeather(ctx, null),
    }));
  };
}
