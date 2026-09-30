import type { Prisma } from '@prisma/client';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { RuleActionSchema, RuleConditionsSchema } from '../domain/rules-dsl.js';
import { conflict, notFound } from '../lib/errors.js';
import { toRuleDto } from '../lib/serialize.js';
import { parse, uuidParam } from '../lib/validation.js';
import type { AuthGuards } from '../plugins/auth.js';
import type { ServiceContext } from '../services/context.js';

const PatchBody = z
  .object({
    name: z.string().trim().min(3).max(120).optional(),
    description: z.string().trim().min(3).max(500).optional(),
    enabled: z.boolean().optional(),
    sort_order: z.number().int().min(0).max(10_000).optional(),
    conditions: RuleConditionsSchema.optional(),
    action: RuleActionSchema.optional(),
  })
  .strict()
  .refine((b) => Object.keys(b).length > 0, 'no hay cambios que aplicar');

const CreateBody = z
  .object({
    name: z.string().trim().min(3).max(120),
    description: z.string().trim().min(3).max(500),
    enabled: z.boolean().default(true),
    sort_order: z.number().int().min(0).max(10_000).default(100),
    conditions: RuleConditionsSchema,
    action: RuleActionSchema,
  })
  .strict();

export function ruleRoutes(ctx: ServiceContext, guards: AuthGuards): FastifyPluginAsync {
  return async (app) => {
    app.post('/rules', { preHandler: guards.requireUser('admin') }, async (req, reply) => {
      const body = parse(CreateBody, req.body);
      const clash = await ctx.prisma.rule.findUnique({
        where: { name: body.name },
        select: { id: true },
      });
      if (clash) throw conflict('Ya existe una regla con ese nombre');
      const created = await ctx.prisma.rule.create({
        data: {
          name: body.name,
          description: body.description,
          enabled: body.enabled,
          sortOrder: body.sort_order,
          conditions: body.conditions as Prisma.InputJsonObject,
          action: body.action as Prisma.InputJsonObject,
        },
      });
      return reply.code(201).send(toRuleDto(created));
    });

    app.delete('/rules/:id', { preHandler: guards.requireUser('admin') }, async (req, reply) => {
      const { id } = parse(uuidParam, req.params);
      const res = await ctx.prisma.rule.deleteMany({ where: { id } });
      if (res.count === 0) throw notFound('Regla');
      return reply.code(204).send();
    });

    app.get('/rules', { preHandler: guards.requireUser('admin', 'operator') }, async () => {
      const rows = await ctx.prisma.rule.findMany({
        orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      });
      return { data: rows.map(toRuleDto) };
    });

    app.patch('/rules/:id', { preHandler: guards.requireUser('admin') }, async (req) => {
      const { id } = parse(uuidParam, req.params);
      const body = parse(PatchBody, req.body);
      const existing = await ctx.prisma.rule.findUnique({ where: { id }, select: { id: true } });
      if (!existing) throw notFound('Regla');

      if (body.name) {
        const clash = await ctx.prisma.rule.findFirst({
          where: { name: body.name, NOT: { id } },
          select: { id: true },
        });
        if (clash) throw conflict('Ya existe una regla con ese nombre');
      }

      const updated = await ctx.prisma.rule.update({
        where: { id },
        data: {
          ...(body.name !== undefined && { name: body.name }),
          ...(body.description !== undefined && { description: body.description }),
          ...(body.enabled !== undefined && { enabled: body.enabled }),
          ...(body.sort_order !== undefined && { sortOrder: body.sort_order }),
          ...(body.conditions && { conditions: body.conditions as Prisma.InputJsonObject }),
          ...(body.action && { action: body.action as Prisma.InputJsonObject }),
        },
      });
      return toRuleDto(updated);
    });
  };
}
