import type { Prisma } from '@prisma/client';
import type {
  AuditLogEntryDto,
  BBox,
  CreateIncidentInput,
  IncidentDto,
  IncidentEventDto,
  IncidentPriority,
  IncidentStatus,
  IncidentType,
  JsonObject,
  PaginatedResponse,
} from '@simu/shared-types';
import { CDMX_BBOX, isPointInBbox } from '@simu/shared-utils';
import {
  TRANSITIONS,
  canPerform,
  canTransition,
  type IncidentAction,
  type WorkflowActor,
} from '../domain/incident-workflow.js';
import { badRequest, conflict, forbidden, notFound } from '../lib/errors.js';
import {
  asObject,
  incidentInclude,
  toIncidentDto,
  toIncidentEventDto,
  type IncidentWithRelations,
} from '../lib/serialize.js';
import type { Actor } from '../plugins/auth.js';
import type { ServiceContext } from './context.js';

/** incident_events.event_type written for each workflow action. */
const EVENT_TYPE: Record<IncidentAction, string> = {
  validate: 'validated',
  reject: 'rejected',
  assign: 'assigned',
  start: 'started',
  resolve: 'resolved',
};

export type IncidentSort = 'created_at' | '-created_at' | 'priority' | '-priority';

export interface IncidentFilter {
  statuses?: IncidentStatus[];
  priorities?: IncidentPriority[];
  types?: IncidentType[];
  bbox?: BBox;
  assignedTo?: string;
  deviceCode?: string;
  /** Case-insensitive text search in the description. */
  q?: string;
}

function whereFrom(f: IncidentFilter): Prisma.IncidentWhereInput {
  return {
    ...(f.statuses && { status: { in: f.statuses } }),
    ...(f.priorities && { priority: { in: f.priorities } }),
    ...(f.types && { type: { in: f.types } }),
    ...(f.assignedTo && { assignedToId: f.assignedTo }),
    ...(f.deviceCode && { device: { deviceCode: f.deviceCode } }),
    ...(f.q && { description: { contains: f.q, mode: 'insensitive' as const } }),
    // Points only: a lat/lng range is exact for a bbox and stays in Prisma.
    ...(f.bbox && {
      longitude: { gte: f.bbox[0], lte: f.bbox[2] },
      latitude: { gte: f.bbox[1], lte: f.bbox[3] },
    }),
  };
}

function orderFrom(sort: IncidentSort): Prisma.IncidentOrderByWithRelationInput[] {
  const dir = sort.startsWith('-') ? 'desc' : 'asc';
  return sort.endsWith('priority')
    ? [{ priority: dir }, { createdAt: 'desc' }]
    : [{ createdAt: dir }];
}

export async function listIncidents(
  ctx: ServiceContext,
  filter: IncidentFilter,
  page: { page: number; pageSize: number; sort: IncidentSort },
): Promise<PaginatedResponse<IncidentDto>> {
  const where = whereFrom(filter);
  const [total, rows] = await ctx.prisma.$transaction([
    ctx.prisma.incident.count({ where }),
    ctx.prisma.incident.findMany({
      where,
      include: incidentInclude,
      orderBy: orderFrom(page.sort),
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    }),
  ]);
  return {
    data: rows.map(toIncidentDto),
    meta: { page: page.page, page_size: page.pageSize, total },
  };
}

async function findOrThrow(ctx: ServiceContext, id: string): Promise<IncidentWithRelations> {
  const incident = await ctx.prisma.incident.findUnique({
    where: { id },
    include: incidentInclude,
  });
  if (!incident) throw notFound('Incidencia');
  return incident;
}

export async function getIncident(ctx: ServiceContext, id: string): Promise<IncidentDto> {
  return toIncidentDto(await findOrThrow(ctx, id));
}

export async function listIncidentEvents(
  ctx: ServiceContext,
  id: string,
): Promise<IncidentEventDto[]> {
  await findOrThrow(ctx, id);
  const rows = await ctx.prisma.incidentEvent.findMany({
    where: { incidentId: id },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toIncidentEventDto);
}

/** Cross-incident audit log (Logs view), newest first. */
export async function listAuditLog(
  ctx: ServiceContext,
  filter: { from: Date; to: Date; eventTypes?: string[] },
  page: { page: number; pageSize: number },
): Promise<PaginatedResponse<AuditLogEntryDto>> {
  const where: Prisma.IncidentEventWhereInput = {
    createdAt: { gte: filter.from, lte: filter.to },
    ...(filter.eventTypes && { eventType: { in: filter.eventTypes } }),
  };
  const [total, rows] = await ctx.prisma.$transaction([
    ctx.prisma.incidentEvent.count({ where }),
    ctx.prisma.incidentEvent.findMany({
      where,
      include: {
        incident: {
          select: { type: true, priority: true, device: { select: { deviceCode: true } } },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (page.page - 1) * page.pageSize,
      take: page.pageSize,
    }),
  ]);
  return {
    data: rows.map((e) => ({
      ...toIncidentEventDto(e),
      incident_type: e.incident.type,
      incident_priority: e.incident.priority,
      device_code: e.incident.device?.deviceCode ?? null,
    })),
    meta: { page: page.page, page_size: page.pageSize, total },
  };
}

/**
 * Maintenance "ACEPTADA" step (PENDIENTE → ACEPTADA → EN ATENCIÓN → RESUELTA). The
 * status enum has no "accepted" value (spec §3.1), so acceptance is recorded as an
 * audit event plus metadata.accepted_at on an `assigned` incident.
 */
export async function acceptIncident(
  ctx: ServiceContext,
  id: string,
  actor: WorkflowActor,
): Promise<IncidentDto> {
  const incident = await findOrThrow(ctx, id);
  if (incident.status !== 'assigned') {
    throw conflict('Solo se puede aceptar una incidencia asignada', { status: incident.status });
  }
  const isAssignee = incident.assignedToId === actor.id;
  if (!isAssignee && actor.role !== 'admin') {
    throw forbidden('Solo quien tiene asignada la incidencia puede aceptarla');
  }
  const metadata = asObject(incident.metadata);
  if (typeof metadata.accepted_at === 'string') throw conflict('La incidencia ya fue aceptada');

  const now = new Date();
  await ctx.prisma.incident.update({
    where: { id },
    data: {
      metadata: {
        ...metadata,
        accepted_at: now.toISOString(),
        accepted_by: actor.id,
      } as Prisma.InputJsonObject,
      events: {
        create: {
          eventType: 'accepted',
          payload: { actor: { kind: 'user', user_id: actor.id, role: actor.role } },
          createdAt: now,
        },
      },
    },
  });
  const dto = await getIncident(ctx, id);
  ctx.hub.publish('incidents', 'updated', dto);
  return dto;
}

/** Audit payload: user id and role only, never name/email (privacy). */
function actorPayload(actor: Actor): JsonObject {
  return actor.kind === 'user'
    ? { actor: { kind: 'user', user_id: actor.user.id, role: actor.user.role } }
    : { actor: { kind: 'device' } };
}

export async function createIncident(
  ctx: ServiceContext,
  input: CreateIncidentInput,
  actor: Actor,
): Promise<IncidentDto> {
  if (!isPointInBbox({ lng: input.longitude, lat: input.latitude }, CDMX_BBOX)) {
    throw badRequest('La ubicación está fuera de la Ciudad de México');
  }
  const isCitizen = actor.kind === 'user' && actor.user.role === 'citizen';

  let deviceId: string | null = null;
  if (input.device_code) {
    const device = await ctx.prisma.device.findUnique({
      where: { deviceCode: input.device_code },
      select: { id: true },
    });
    if (!device) throw notFound(`Dispositivo ${input.device_code}`);
    deviceId = device.id;
  }

  const source = actor.kind === 'device' ? 'device' : isCitizen ? 'citizen_report' : 'manual';
  const created = await ctx.prisma.incident.create({
    data: {
      type: input.type,
      description: input.description,
      // Citizens cannot set priority or confidence; triage belongs to operators.
      priority: isCitizen ? 'medium' : (input.priority ?? 'medium'),
      confidence: isCitizen ? 1 : (input.confidence ?? 1),
      latitude: input.latitude,
      longitude: input.longitude,
      deviceId,
      metadata: { ...(input.metadata ?? {}), source } as Prisma.InputJsonObject,
      events: {
        create: {
          eventType: 'created',
          payload: { source, ...actorPayload(actor) } as Prisma.InputJsonObject,
        },
      },
    },
    include: incidentInclude,
  });

  const dto = toIncidentDto(created);
  ctx.hub.publish('incidents', 'created', dto);
  return dto;
}

export interface IncidentPatch {
  description?: string;
  priority?: IncidentPriority;
  type?: IncidentType;
  /** Only workflow moves allowed through PATCH. */
  status?: 'in_progress' | 'rejected';
  note?: string;
}

export async function updateIncident(
  ctx: ServiceContext,
  id: string,
  patch: IncidentPatch,
  actor: WorkflowActor,
): Promise<IncidentDto> {
  const { status, note, ...fields } = patch;
  const hasFieldChanges = Object.keys(fields).length > 0;

  if (hasFieldChanges) {
    if (actor.role !== 'admin' && actor.role !== 'operator') {
      throw forbidden('Solo operación o administración pueden editar la incidencia');
    }
    const before = await findOrThrow(ctx, id);
    const changes: JsonObject = {};
    for (const [key, value] of Object.entries(fields)) {
      const previous = before[key as keyof typeof fields];
      if (value !== undefined && value !== previous) changes[key] = { from: previous, to: value };
    }
    if (Object.keys(changes).length > 0) {
      await ctx.prisma.incident.update({
        where: { id },
        data: {
          ...fields,
          events: {
            create: {
              eventType: changes.priority ? 'priority_changed' : 'updated',
              payload: {
                changes,
                ...(note && { note }),
                actor: { kind: 'user', user_id: actor.id, role: actor.role },
              } as Prisma.InputJsonObject,
            },
          },
        },
      });
    }
  }

  if (status) {
    return transitionIncident(ctx, id, status === 'in_progress' ? 'start' : 'reject', actor, {
      note,
    });
  }

  const dto = await getIncident(ctx, id);
  if (hasFieldChanges) ctx.hub.publish('incidents', 'updated', dto);
  return dto;
}

/**
 * Applies a workflow action. The UPDATE is conditional on the current status, so two
 * operators acting at the same time cannot both succeed (the loser gets 409).
 */
export async function transitionIncident(
  ctx: ServiceContext,
  id: string,
  action: IncidentAction,
  actor: WorkflowActor,
  extra: { note?: string | undefined; assigneeId?: string } = {},
): Promise<IncidentDto> {
  const incident = await findOrThrow(ctx, id);

  if (!canPerform(action, actor, incident)) throw forbidden();
  if (!canTransition(action, incident.status)) {
    throw conflict(
      `No se puede aplicar "${action}" a una incidencia en estado ${incident.status}`,
      {
        status: incident.status,
        allowed_from: TRANSITIONS[action].from,
      },
    );
  }

  if (action === 'assign') {
    if (!extra.assigneeId) throw badRequest('Falta user_id');
    const assignee = await ctx.prisma.user.findUnique({
      where: { id: extra.assigneeId },
      select: { status: true, role: { select: { name: true } } },
    });
    if (!assignee || assignee.role.name !== 'maintenance' || assignee.status !== 'active') {
      throw badRequest('Solo se puede asignar a personal de mantenimiento activo');
    }
  }

  const now = new Date();
  const to = TRANSITIONS[action].to;
  const data: Prisma.IncidentUncheckedUpdateManyInput = { status: to };
  if (to === 'validated' || (action === 'assign' && !incident.validatedAt)) data.validatedAt = now;
  if (to === 'resolved') data.resolvedAt = now;
  if (action === 'assign' && extra.assigneeId) data.assignedToId = extra.assigneeId;

  await ctx.prisma.$transaction(async (tx) => {
    const res = await tx.incident.updateMany({
      where: { id, status: incident.status },
      data,
    });
    if (res.count !== 1)
      throw conflict('La incidencia cambió mientras la editabas; recarga e intenta de nuevo');
    await tx.incidentEvent.create({
      data: {
        incidentId: id,
        eventType: EVENT_TYPE[action],
        payload: {
          from: incident.status,
          to,
          ...(extra.note && { note: extra.note }),
          ...(extra.assigneeId && { assigned_to: extra.assigneeId }),
          actor: { kind: 'user', user_id: actor.id, role: actor.role },
        } as Prisma.InputJsonObject,
        createdAt: now,
      },
    });
  });

  const dto = await getIncident(ctx, id);
  ctx.hub.publish('incidents', 'status_changed', { ...dto, previous_status: incident.status });
  return dto;
}
