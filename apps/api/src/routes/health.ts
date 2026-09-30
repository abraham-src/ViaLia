import type { PrismaClient } from '@prisma/client';
import type { HealthResponse } from '@simu/shared-types';
import type { FastifyPluginAsync } from 'fastify';

export interface HealthRoutesOptions {
  prisma: PrismaClient;
  version: string;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (app, opts) => {
  app.get('/health', { config: { rateLimit: false } }, async (req, reply) => {
    const base = {
      service: 'simu-api',
      version: opts.version,
      uptime_s: Math.round(process.uptime()),
      ts: new Date().toISOString(),
    };
    try {
      const rows = await opts.prisma.$queryRaw<Array<{ postgis: string }>>`
        SELECT PostGIS_Lib_Version() AS postgis`;
      const body: HealthResponse = {
        ...base,
        status: 'ok',
        db: 'up',
        postgis: rows[0]?.postgis ?? null,
      };
      return body;
    } catch (err) {
      req.log.error({ err }, 'health check: database unreachable');
      const body: HealthResponse = { ...base, status: 'degraded', db: 'down', postgis: null };
      return reply.code(503).send(body);
    }
  });
};
