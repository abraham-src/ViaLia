import { ACCESSIBILITY_POINT_TYPES, ACCESSIBILITY_STATUSES } from '@simu/shared-types';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Graph } from '../domain/pedestrian-graph.js';
import { toPointCollection } from '../lib/geojson.js';
import { bboxParam, csvEnum, lngLatParam, parse } from '../lib/validation.js';
import type { AuthGuards } from '../plugins/auth.js';
import * as accessibility from '../services/accessibility.js';
import { computeRoute, loadRoutingData, saveRoute } from '../services/accessible-routing.js';
import type { ServiceContext } from '../services/context.js';

const PointsQuery = z.object({
  type: csvEnum(ACCESSIBILITY_POINT_TYPES),
  status: csvEnum(ACCESSIBILITY_STATUSES),
  bbox: bboxParam,
  format: z.enum(['json', 'geojson']).default('json'),
});

const RoutesQuery = z.object({
  origin: lngLatParam.optional(),
  destination: lngLatParam.optional(),
  accessible: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  radius_m: z.coerce.number().int().min(10).max(2000).default(300),
});

const lngLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const AlternativeBody = z
  .object({
    origin: lngLat,
    destination: lngLat,
    accessible: z.boolean().default(true),
    avoid: z
      .array(
        z.object({
          lng: z.number().min(-180).max(180),
          lat: z.number().min(-90).max(90),
          radius_m: z.number().int().min(5).max(500).optional(),
        }),
      )
      .max(20)
      .optional(),
  })
  .strict();

export function accessibilityRoutes(
  ctx: ServiceContext,
  guards: AuthGuards,
  graph: Graph,
): FastifyPluginAsync {
  return async (app) => {
    const anyUser = guards.requireUser();

    app.get('/accessibility/points', { preHandler: anyUser }, async (req) => {
      const q = parse(PointsQuery, req.query);
      const list = await accessibility.listPoints(ctx, {
        types: q.type,
        statuses: q.status,
        bbox: q.bbox,
      });
      return q.format === 'geojson' ? toPointCollection(list) : { data: list };
    });

    /**
     * Stored routes (map layer). With origin AND destination it also computes the best
     * route through the pedestrian network (`computed`), avoiding active obstacles.
     */
    app.get('/accessibility/routes', { preHandler: anyUser }, async (req) => {
      const q = parse(RoutesQuery, req.query);
      const data = await accessibility.listRoutes(ctx, {
        origin: q.origin,
        destination: q.destination,
        radiusM: q.radius_m,
        accessibleOnly: q.accessible,
      });
      if (!q.origin || !q.destination) return { data };
      const computed = computeRoute(graph, await loadRoutingData(ctx), {
        origin: q.origin,
        destination: q.destination,
        accessible: q.accessible,
      });
      return { data, computed };
    });

    /** Computes a route that also avoids the given points and stores it (status alternative). */
    app.post('/accessibility/routes/alternative', { preHandler: anyUser }, async (req, reply) => {
      const body = parse(AlternativeBody, req.body);
      const request = {
        origin: body.origin as [number, number],
        destination: body.destination as [number, number],
        accessible: body.accessible,
        avoid: body.avoid,
      };
      const computed = computeRoute(graph, await loadRoutingData(ctx), request);
      const savedId = computed.found ? await saveRoute(ctx, request, computed) : null;
      return reply.code(computed.found ? 201 : 200).send({ computed, saved_id: savedId });
    });
  };
}
