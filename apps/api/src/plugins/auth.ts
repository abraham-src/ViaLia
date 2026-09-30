import { timingSafeEqual } from 'node:crypto';
import type { RoleName } from '@simu/shared-types';
import type { FastifyReply, FastifyRequest, preHandlerAsyncHookHandler } from 'fastify';
import type { TokenService } from '../auth/tokens.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export interface AuthUser {
  id: string;
  role: RoleName;
  name: string;
}

/** Who performed a request: a signed-in user or a gateway/simulator holding the device key. */
export type Actor = { kind: 'user'; user: AuthUser } | { kind: 'device' };

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
    actor: Actor | null;
  }
}

/** The authenticated user. Only call after a requireUser guard. */
export function currentUser(req: FastifyRequest): AuthUser {
  if (!req.user) throw unauthorized();
  return req.user;
}

/** The authenticated actor. Only call after a requireUser/requireDeviceOrUser guard. */
export function currentActor(req: FastifyRequest): Actor {
  if (!req.actor) throw unauthorized();
  return req.actor;
}

function bearerToken(req: FastifyRequest): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ')) return header.slice(7).trim() || null;
  return null;
}

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export interface AuthGuards {
  /** Requires a valid access token. Optionally restricts to roles. */
  requireUser(...roles: RoleName[]): preHandlerAsyncHookHandler;
  /** Accepts the device key header OR a user with one of the given roles. */
  requireDeviceOrUser(...roles: RoleName[]): preHandlerAsyncHookHandler;
  /** Authenticates a raw token (used by the WebSocket upgrade). */
  authenticateToken(token: string): Promise<AuthUser>;
}

export function createAuthGuards(tokens: TokenService, deviceKey: string): AuthGuards {
  async function authenticateToken(token: string): Promise<AuthUser> {
    const claims = await tokens.verifyAccess(token);
    return { id: claims.sub, role: claims.role, name: claims.name };
  }

  async function authenticateRequest(req: FastifyRequest, roles: RoleName[]): Promise<void> {
    const token = bearerToken(req);
    if (!token) throw unauthorized();
    const user = await authenticateToken(token);
    if (roles.length > 0 && !roles.includes(user.role)) throw forbidden();
    req.user = user;
    req.actor = { kind: 'user', user };
  }

  return {
    authenticateToken,

    requireUser:
      (...roles) =>
      async (req: FastifyRequest, _reply: FastifyReply) => {
        await authenticateRequest(req, roles);
      },

    requireDeviceOrUser:
      (...roles) =>
      async (req: FastifyRequest, _reply: FastifyReply) => {
        const key = req.headers['x-device-key'];
        if (typeof key === 'string') {
          if (!safeEqual(key, deviceKey)) throw unauthorized('Clave de dispositivo inválida');
          req.actor = { kind: 'device' };
          return;
        }
        await authenticateRequest(req, roles);
      },
  };
}
