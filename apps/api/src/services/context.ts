import type { PrismaClient } from '@prisma/client';
import type { FastifyBaseLogger } from 'fastify';
import type { TokenService } from '../auth/tokens.js';
import type { Config } from '../config.js';
import type { Publisher } from '../ws/hub.js';

/** Dependencies shared by every service. Built once in buildApp. */
export interface ServiceContext {
  config: Config;
  prisma: PrismaClient;
  tokens: TokenService;
  hub: Publisher;
  log: FastifyBaseLogger;
}
