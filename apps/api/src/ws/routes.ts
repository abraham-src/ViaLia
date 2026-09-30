import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AppError } from '../lib/errors.js';
import type { AuthGuards } from '../plugins/auth.js';
import type { WsHub } from './hub.js';

const WsQuery = z.object({ token: z.string().min(1) });

/**
 * GET /ws?token=<access JWT>. Browsers cannot send Authorization headers on a
 * WebSocket, so the token travels in the query string (redacted from logs).
 * The token is verified BEFORE the upgrade: unauthenticated clients get HTTP 401.
 */
export function wsRoutes(hub: WsHub, guards: AuthGuards): FastifyPluginAsync {
  return async (app) => {
    app.get(
      '/ws',
      {
        websocket: true,
        preValidation: async (req) => {
          const parsed = WsQuery.safeParse(req.query);
          if (!parsed.success) throw new AppError(401, 'UNAUTHORIZED', 'Falta el token');
          req.user = await guards.authenticateToken(parsed.data.token);
        },
      },
      (socket, req) => {
        if (!req.user) {
          socket.close(4401, 'unauthorized');
          return;
        }
        hub.add(socket, req.user);
      },
    );
  };
}
