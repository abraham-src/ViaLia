import path from 'node:path';
import fastifyCookie from '@fastify/cookie';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import { Prisma, type PrismaClient } from '@prisma/client';
import type { ApiError } from '@simu/shared-types';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import { createTokenService } from './auth/tokens.js';
import { loadGraph } from './domain/pedestrian-graph.js';
import type { Config } from './config.js';
import { AppError } from './lib/errors.js';
import { createAuthGuards } from './plugins/auth.js';
import { accessibilityRoutes } from './routes/accessibility.js';
import { aiRoutes } from './routes/ai.js';
import { gisRoutes } from './routes/gis.js';
import { userRoutes } from './routes/users.js';
import { authRoutes } from './routes/auth.js';
import { deviceRoutes } from './routes/devices.js';
import { eventRoutes } from './routes/events.js';
import { healthRoutes } from './routes/health.js';
import { incidentRoutes } from './routes/incidents.js';
import { ruleRoutes } from './routes/rules.js';
import type { ServiceContext } from './services/context.js';
import { startHeartbeatMonitor } from './services/heartbeat-monitor.js';
import { WsHub } from './ws/hub.js';
import { wsRoutes } from './ws/routes.js';

export const API_VERSION = '0.3.0';

export interface AppDeps {
  config: Config;
  prisma: PrismaClient;
  /** Start background jobs (offline monitor). The server passes true; tests do not. */
  startJobs?: boolean;
}

/** Masks `token=` in URLs so WebSocket credentials never reach the logs. */
export function redactUrl(url: string): string {
  return url.replace(/([?&]token=)[^&]*/g, '$1[redacted]');
}

function errorBody(code: string, message: string, details?: unknown): ApiError {
  return { error: { code, message, ...(details !== undefined && { details }) } };
}

export async function buildApp({
  config,
  prisma,
  startJobs = false,
}: AppDeps): Promise<FastifyInstance> {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      redact: {
        paths: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["x-device-key"]'],
        censor: '[redacted]',
      },
      serializers: {
        req: (req: { method: string; url: string; ip?: string }) => ({
          method: req.method,
          url: redactUrl(req.url),
        }),
      },
    },
    trustProxy: true,
    disableRequestLogging: config.NODE_ENV === 'test',
  });

  // Request state set by the auth guards.
  app.decorateRequest('user', null);
  app.decorateRequest('actor', null);

  await app.register(fastifyCookie);
  await app.register(fastifyRateLimit, { global: false });
  await app.register(fastifyWebsocket, { options: { maxPayload: 16 * 1024 } });

  const tokens = createTokenService(config);
  const guards = createAuthGuards(tokens, config.DEVICE_INGEST_KEY);
  const hub = new WsHub(app.log);
  const ctx: ServiceContext = { config, prisma, tokens, hub, log: app.log };

  const stopMonitor = startJobs ? startHeartbeatMonitor(ctx) : () => undefined;
  app.addHook('onClose', async () => {
    stopMonitor();
    hub.close();
  });

  app.setErrorHandler((err: FastifyError | AppError | Error, req, reply) => {
    if (err instanceof AppError) {
      return reply.code(err.statusCode).send(errorBody(err.code, err.message, err.details));
    }
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === 'P2025')
        return reply.code(404).send(errorBody('NOT_FOUND', 'Registro no encontrado'));
      if (err.code === 'P2002')
        return reply.code(409).send(errorBody('CONFLICT', 'Registro duplicado'));
    }
    const statusCode =
      'statusCode' in err && typeof err.statusCode === 'number' ? err.statusCode : 500;
    if (statusCode === 429) {
      return reply
        .code(429)
        .send(errorBody('RATE_LIMITED', 'Demasiados intentos. Espera un minuto'));
    }
    if (statusCode < 500) {
      // Fastify-level client errors (malformed JSON, payload too large, ...).
      const code = 'code' in err && typeof err.code === 'string' ? err.code : 'BAD_REQUEST';
      return reply.code(statusCode).send(errorBody(code, err.message));
    }
    req.log.error({ err }, 'unhandled error');
    return reply.code(500).send(errorBody('INTERNAL_ERROR', 'Error interno del servidor'));
  });

  app.setNotFoundHandler((req, reply) =>
    reply
      .code(404)
      .send(errorBody('NOT_FOUND', `Ruta no encontrada: ${req.method} ${redactUrl(req.url)}`)),
  );

  await app.register(healthRoutes, { prisma, version: API_VERSION });
  await app.register(authRoutes(ctx, guards));
  await app.register(deviceRoutes(ctx, guards));
  await app.register(incidentRoutes(ctx, guards));
  const gisDir = path.resolve(process.cwd(), config.GIS_DIR);
  // Pedestrian network loaded once (OSM-derived, ~4.6k edges).
  const graph = loadGraph(path.join(gisDir, 'pedestrian-network.geojson'));
  await app.register(accessibilityRoutes(ctx, guards, graph));
  await app.register(ruleRoutes(ctx, guards));
  await app.register(eventRoutes(ctx, guards));
  await app.register(aiRoutes(ctx, guards));
  await app.register(userRoutes(ctx, guards));
  await app.register(gisRoutes(gisDir, guards));
  await app.register(wsRoutes(hub, guards));

  return app;
}
