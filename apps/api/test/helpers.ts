import { PrismaClient } from '@prisma/client';
import type { TokenResponse, WsControlMessage, WsMessage } from '@simu/shared-types';
import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import { buildApp } from '../src/app.js';
import { createTokenService } from '../src/auth/tokens.js';
import { loadConfig, type Config } from '../src/config.js';
import type { ServiceContext } from '../src/services/context.js';
import { resetTestDatabase } from './db.js';

export const TEST_DB = process.env.TEST_DATABASE_URL;
export const hasTestDb = Boolean(TEST_DB);

export const DEMO = {
  admin: 'admin@simu.local',
  operator: 'operador@simu.local',
  maintenance: 'mantenimiento@simu.local',
  citizen: 'ciudadano@simu.local',
} as const;
export type DemoRole = keyof typeof DEMO;

export const DEVICE_KEY = 'test-device-key-0123456789';

export interface TestContext {
  app: FastifyInstance;
  prisma: PrismaClient;
  config: Config;
  close(): Promise<void>;
}

/** Resets the test database to the seed state and builds an app bound to it. */
export async function createTestApp(overrides: Record<string, string> = {}): Promise<TestContext> {
  if (!TEST_DB) throw new Error('TEST_DATABASE_URL requerido');
  await resetTestDatabase(TEST_DB);
  const config = loadConfig({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    DATABASE_URL: TEST_DB,
    DEVICE_INGEST_KEY: DEVICE_KEY,
    LOGIN_RATE_LIMIT_MAX: '1000',
    AI_SERVICE_URL: '',
    ...overrides,
  });
  const prisma = new PrismaClient({ datasourceUrl: TEST_DB });
  const app = await buildApp({ config, prisma });
  await app.ready();
  return {
    app,
    prisma,
    config,
    async close() {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

export interface RecordedMessage {
  channel: string;
  event: string;
  data: unknown;
}

/** A ServiceContext whose publisher records messages (for calling services directly). */
export function serviceContext(t: TestContext): {
  ctx: ServiceContext;
  published: RecordedMessage[];
} {
  const published: RecordedMessage[] = [];
  const ctx: ServiceContext = {
    config: t.config,
    prisma: t.prisma,
    tokens: createTokenService(t.config),
    log: t.app.log,
    hub: { publish: (channel, event, data) => void published.push({ channel, event, data }) },
  };
  return { ctx, published };
}

export async function login(app: FastifyInstance, role: DemoRole): Promise<TokenResponse> {
  const res = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email: DEMO[role], password: process.env.SEED_DEMO_PASSWORD },
  });
  if (res.statusCode !== 200) throw new Error(`login ${role} falló: ${res.statusCode} ${res.body}`);
  return res.json<TokenResponse>();
}

export async function tokensFor(app: FastifyInstance): Promise<Record<DemoRole, string>> {
  const entries = await Promise.all(
    (Object.keys(DEMO) as DemoRole[]).map(
      async (r) => [r, (await login(app, r)).access_token] as const,
    ),
  );
  return Object.fromEntries(entries) as Record<DemoRole, string>;
}

export const bearer = (token: string) => ({ authorization: `Bearer ${token}` });

export type AnyWsMessage = WsMessage | WsControlMessage;

export interface WsTestClient {
  ws: WebSocket;
  /** Resolves with the first (buffered or future) message matching the predicate. */
  next(predicate: (m: AnyWsMessage) => boolean, timeoutMs?: number): Promise<AnyWsMessage>;
  /** Every message received so far. */
  received: AnyWsMessage[];
  close(): void;
}

/** Opens /ws via injectWS and buffers every message from the first frame on. */
export async function connectWs(app: FastifyInstance, token: string): Promise<WsTestClient> {
  const received: AnyWsMessage[] = [];
  const waiters = new Set<{
    predicate: (m: AnyWsMessage) => boolean;
    resolve: (m: AnyWsMessage) => void;
  }>();
  let cursor = 0;

  const onMessage = (raw: Buffer) => {
    const msg = JSON.parse(raw.toString()) as AnyWsMessage;
    received.push(msg);
    for (const w of waiters) {
      if (w.predicate(msg)) {
        waiters.delete(w);
        w.resolve(msg);
      }
    }
  };

  // Attach before the handshake completes: the server sends `welcome` immediately.
  const ws = await app.injectWS(
    `/ws?token=${encodeURIComponent(token)}`,
    {},
    {
      onInit: (socket) => socket.on('message', onMessage),
    },
  );

  return {
    ws,
    received,
    close: () => ws.terminate(),
    next(predicate, timeoutMs = 3000) {
      const buffered = received.slice(cursor).find(predicate);
      if (buffered) {
        cursor = received.indexOf(buffered) + 1;
        return Promise.resolve(buffered);
      }
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve: (m: AnyWsMessage) => {
            clearTimeout(timer);
            cursor = received.indexOf(m) + 1;
            resolve(m);
          },
        };
        const timer = setTimeout(() => {
          waiters.delete(waiter);
          reject(new Error('timeout esperando mensaje WS'));
        }, timeoutMs);
        waiters.add(waiter);
      });
    },
  };
}

/** Data messages have `event` and never `type` (acks like `subscribed` also carry `channel`). */
export const isData =
  (channel: string, event?: string) =>
  (m: AnyWsMessage): m is WsMessage =>
    !('type' in m) && 'event' in m && m.channel === channel && (!event || m.event === event);

export const isControl =
  (type: WsControlMessage['type']) =>
  (m: AnyWsMessage): m is WsControlMessage =>
    'type' in m && m.type === type;
