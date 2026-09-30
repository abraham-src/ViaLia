import { INCIDENT_PRIORITIES, INCIDENT_STATUSES, INCIDENT_TYPES } from '@simu/shared-types';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { toPointCollection } from '../lib/geojson.js';
import { bboxParam, csvEnum, isoDate, jsonObject, parse, uuidParam } from '../lib/validation.js';
import { currentActor, currentUser, type AuthGuards } from '../plugins/auth.js';
import type { ServiceContext } from '../services/context.js';
import * as incidents from '../services/incidents.js';

const GEOJSON_LIMIT = 1000;

const ListQuery = z.object({
  status: csvEnum(INCIDENT_STATUSES),
  priority: csvEnum(INCIDENT_PRIORITIES),
  type: csvEnum(INCIDENT_TYPES),
  bbox: bboxParam,
  assigned_to: z.union([z.literal('me'), z.string().uuid()]).optional(),
  device_code: z.string().optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.enum(['created_at', '-created_at', 'priority', '-priority']).default('-created_at'),
  format: z.enum(['json', 'geojson']).default('json'),
});

const CreateBody = z.object({
  type: z.enum(INCIDENT_TYPES),
  description: z.string().trim().min(5, 'describe la incidencia (mínimo 5 caracteres)').max(2000),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  priority: z.enum(INCIDENT_PRIORITIES).optional(),
  confidence: z.number().min(0).max(1).optional(),
  device_code: z.string().optional(),
  metadata: jsonObject.optional(),
});

const PatchBody = z
  .object({
    description: z.string().trim().min(5).max(2000).optional(),
    priority: z.enum(INCIDENT_PRIORITIES).optional(),
    type: z.enum(INCIDENT_TYPES).optional(),
    status: z.enum(['in_progress', 'rejected']).optional(),
    note: z.string().max(1000).optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).some((k) => k !== 'note'), 'no hay cambios que aplicar');

const NoteBody = z
  .object({ note: z.string().max(1000).optional() })
  .strict()
  .default({});
const AuditQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  event_type: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',').filter(Boolean) : undefined)),
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(500).default(100),
});

const AssignBody = z
  .object({ user_id: z.string().uuid(), note: z.string().max(1000).optional() })
  .strict();

export function incidentRoutes(ctx: ServiceContext, guards: AuthGuards): FastifyPluginAsync {
  return async (app) => {
    const anyUser = guards.requireUser();
    const staff = guards.requireUser('admin', 'operator');
    const workers = guards.requireUser('admin', 'operator', 'maintenance');

    app.get('/incidents', { preHandler: anyUser }, async (req) => {
      const q = parse(ListQuery, req.query);
      const filter: incidents.IncidentFilter = {
        statuses: q.status,
        priorities: q.priority,
        types: q.type,
        bbox: q.bbox,
        deviceCode: q.device_code,
        q: q.q || undefined,
        assignedTo: q.assigned_to === 'me' ? currentUser(req).id : q.assigned_to,
      };
      if (q.format === 'geojson') {
        const page = await incidents.listIncidents(ctx, filter, {
          page: 1,
          pageSize: GEOJSON_LIMIT,
          sort: q.sort,
        });
        return toPointCollection(page.data);
      }
      return incidents.listIncidents(ctx, filter, {
        page: q.page,
        pageSize: q.page_size,
        sort: q.sort,
      });
    });

    app.get('/incidents/:id', { preHandler: anyUser }, async (req) => {
      const { id } = parse(uuidParam, req.params);
      return incidents.getIncident(ctx, id);
    });

    app.get('/incidents/:id/events', { preHandler: workers }, async (req) => {
      const { id } = parse(uuidParam, req.params);
      return { data: await incidents.listIncidentEvents(ctx, id) };
    });

    app.post('/incidents', { preHandler: anyUser }, async (req, reply) => {
      const body = parse(CreateBody, req.body);
      const dto = await incidents.createIncident(ctx, body, currentActor(req));
      return reply.code(201).send(dto);
    });

    app.patch('/incidents/:id', { preHandler: workers }, async (req) => {
      const { id } = parse(uuidParam, req.params);
      const body = parse(PatchBody, req.body);
      return incidents.updateIncident(ctx, id, body, currentUser(req));
    });

    app.post('/incidents/:id/validate', { preHandler: staff }, async (req) => {
      const { id } = parse(uuidParam, req.params);
      const { note } = parse(NoteBody, req.body ?? {});
      return incidents.transitionIncident(ctx, id, 'validate', currentUser(req), { note });
    });

    app.post('/incidents/:id/assign', { preHandler: staff }, async (req) => {
      const { id } = parse(uuidParam, req.params);
      const body = parse(AssignBody, req.body);
      return incidents.transitionIncident(ctx, id, 'assign', currentUser(req), {
        assigneeId: body.user_id,
        note: body.note,
      });
    });

    app.post('/incidents/:id/accept', { preHandler: workers }, async (req) => {
      const { id } = parse(uuidParam, req.params);
      return incidents.acceptIncident(ctx, id, currentUser(req));
    });

    /** Cross-incident audit log for the Logs view. */
    app.get('/incident-events', { preHandler: workers }, async (req) => {
      const q = parse(AuditQuery, req.query);
      const to = q.to ?? new Date();
      const from = q.from ?? new Date(to.getTime() - 7 * 24 * 3600_000);
      return incidents.listAuditLog(
        ctx,
        { from, to, eventTypes: q.event_type },
        { page: q.page, pageSize: q.page_size },
      );
    });

    app.post('/incidents/:id/resolve', { preHandler: workers }, async (req) => {
      const { id } = parse(uuidParam, req.params);
      const { note } = parse(NoteBody, req.body ?? {});
      return incidents.transitionIncident(ctx, id, 'resolve', currentUser(req), { note });
    });
  };
}
