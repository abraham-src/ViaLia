import type { Prisma } from '@prisma/client';
import type { UserAdminDto } from '@simu/shared-types';
import { ROLE_NAMES, USER_STATUSES } from '@simu/shared-types';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { hashPassword } from '../auth/password.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { csvEnum, parse, uuidParam } from '../lib/validation.js';
import { currentUser, type AuthGuards } from '../plugins/auth.js';
import type { ServiceContext } from '../services/context.js';

export interface AssigneeDto {
  id: string;
  name: string;
}

const select = {
  id: true,
  name: true,
  email: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  role: { select: { name: true } },
} satisfies Prisma.UserSelect;

type Row = Prisma.UserGetPayload<{ select: typeof select }>;
const toDto = (u: Row): UserAdminDto => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role.name,
  status: u.status,
  created_at: u.createdAt.toISOString(),
  updated_at: u.updatedAt.toISOString(),
});

const ListQuery = z.object({
  role: csvEnum(ROLE_NAMES),
  status: csvEnum(USER_STATUSES),
  q: z.string().trim().max(100).optional(),
});

const password = z.string().min(8, 'la contraseña debe tener al menos 8 caracteres').max(200);

const CreateBody = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: z.string().trim().toLowerCase().email('correo inválido').max(254),
    password,
    role: z.enum(ROLE_NAMES),
  })
  .strict();

const PatchBody = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    role: z.enum(ROLE_NAMES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    password: password.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'no hay cambios que aplicar');

export function userRoutes(ctx: ServiceContext, guards: AuthGuards): FastifyPluginAsync {
  const revokeSessions = (userId: string) =>
    ctx.prisma.refreshToken.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });

  const roleId = async (name: (typeof ROLE_NAMES)[number]) => {
    const role = await ctx.prisma.role.findUnique({ where: { name }, select: { id: true } });
    if (!role) throw badRequest(`Rol inexistente: ${name}`);
    return role.id;
  };

  return async (app) => {
    /**
     * Active maintenance staff an incident can be assigned to. Returns id + name only
     * (operators need no email or other personal data to assign work).
     */
    app.get(
      '/users/assignees',
      { preHandler: guards.requireUser('admin', 'operator') },
      async () => {
        const rows = await ctx.prisma.user.findMany({
          where: { status: 'active', role: { name: 'maintenance' } },
          select: { id: true, name: true },
          orderBy: { name: 'asc' },
        });
        return { data: rows satisfies AssigneeDto[] };
      },
    );

    const admin = guards.requireUser('admin');

    app.get('/users', { preHandler: admin }, async (req) => {
      const q = parse(ListQuery, req.query);
      const rows = await ctx.prisma.user.findMany({
        where: {
          ...(q.role && { role: { name: { in: q.role } } }),
          ...(q.status && { status: { in: q.status } }),
          ...(q.q && {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' as const } },
              { email: { contains: q.q, mode: 'insensitive' as const } },
            ],
          }),
        },
        select,
        orderBy: [{ role: { name: 'asc' } }, { name: 'asc' }],
      });
      return { data: rows.map(toDto) };
    });

    app.post('/users', { preHandler: admin }, async (req, reply) => {
      const body = parse(CreateBody, req.body);
      const exists = await ctx.prisma.user.findUnique({
        where: { email: body.email },
        select: { id: true },
      });
      if (exists) throw conflict('Ya existe un usuario con ese correo');
      const created = await ctx.prisma.user.create({
        data: {
          name: body.name,
          email: body.email,
          passwordHash: await hashPassword(body.password),
          roleId: await roleId(body.role),
          status: 'active',
        },
        select,
      });
      return reply.code(201).send(toDto(created));
    });

    app.patch('/users/:id', { preHandler: admin }, async (req) => {
      const { id } = parse(uuidParam, req.params);
      const body = parse(PatchBody, req.body);
      const me = currentUser(req);
      if (
        id === me.id &&
        ((body.role && body.role !== 'admin') || (body.status && body.status !== 'active'))
      ) {
        throw conflict(
          'No puedes quitarte el rol de administración ni desactivar tu propia cuenta',
        );
      }
      const existing = await ctx.prisma.user.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw notFound('Usuario');

      const updated = await ctx.prisma.user.update({
        where: { id },
        data: {
          ...(body.name && { name: body.name }),
          ...(body.status && { status: body.status }),
          ...(body.role && { roleId: await roleId(body.role) }),
          ...(body.password && { passwordHash: await hashPassword(body.password) }),
        },
        select,
      });
      // A new password, a new role or losing access invalidates every open session.
      if (body.password || body.role || (body.status && body.status !== 'active'))
        await revokeSessions(id);
      return toDto(updated);
    });

    /** Soft delete: deactivates the account (audit trail keeps its references). */
    app.delete('/users/:id', { preHandler: admin }, async (req, reply) => {
      const { id } = parse(uuidParam, req.params);
      if (id === currentUser(req).id) throw conflict('No puedes desactivar tu propia cuenta');
      const res = await ctx.prisma.user.updateMany({ where: { id }, data: { status: 'inactive' } });
      if (res.count === 0) throw notFound('Usuario');
      await revokeSessions(id);
      return reply.code(204).send();
    });
  };
}
