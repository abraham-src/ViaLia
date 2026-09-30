import { CAMERA_EVENT_TYPES } from '@simu/shared-types';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { parse } from '../lib/validation.js';
import type { AuthGuards } from '../plugins/auth.js';
import * as ai from '../services/ai.js';
import type { ServiceContext } from '../services/context.js';

const AnalyzeBody = z
  .object({
    device_id: z
      .string()
      .regex(/^CAM-\d{3}$/, 'device_id debe ser una cámara, por ejemplo CAM-001'),
    location_id: z.string().max(40).optional(),
    frame_ref: z.string().max(200).optional(),
    hint: z.enum(CAMERA_EVENT_TYPES).optional(),
    ingest: z.boolean().default(true),
  })
  .strict();

export function aiRoutes(ctx: ServiceContext, guards: AuthGuards): FastifyPluginAsync {
  return async (app) => {
    app.post(
      '/ai/analyze',
      { preHandler: guards.requireDeviceOrUser('admin', 'operator') },
      async (req) => ai.analyze(ctx, parse(AnalyzeBody, req.body)),
    );
  };
}
