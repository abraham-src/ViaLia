import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { parse } from '../lib/validation.js';
import { currentUser, type AuthGuards } from '../plugins/auth.js';
import * as auth from '../services/auth.js';
import type { ServiceContext } from '../services/context.js';

export const REFRESH_COOKIE = 'simu_rt';

const LoginBody = z.object({
  email: z.string().email('correo inválido').max(254),
  password: z.string().min(1, 'contraseña requerida').max(200),
});

const RefreshBody = z.object({ refresh_token: z.string().min(1).optional() }).optional();

function refreshTokenFrom(req: FastifyRequest): string | undefined {
  const body = parse(RefreshBody, req.body);
  return body?.refresh_token ?? req.cookies[REFRESH_COOKIE];
}

export function authRoutes(ctx: ServiceContext, guards: AuthGuards): FastifyPluginAsync {
  const setRefreshCookie = (reply: FastifyReply, token: string): void => {
    reply.setCookie(REFRESH_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: ctx.config.COOKIE_SECURE,
      // "/" so it works both directly (/auth/...) and behind nginx (/api/auth/...).
      path: '/',
      maxAge: ctx.tokens.refreshTtlSeconds,
    });
  };

  return async (app) => {
    app.post(
      '/auth/login',
      {
        config: {
          rateLimit: { max: ctx.config.LOGIN_RATE_LIMIT_MAX, timeWindow: '1 minute' },
        },
      },
      async (req, reply) => {
        const { email, password } = parse(LoginBody, req.body);
        const tokens = await auth.login(ctx, email, password);
        setRefreshCookie(reply, tokens.refresh_token);
        return tokens;
      },
    );

    app.post('/auth/refresh', async (req, reply) => {
      const token = refreshTokenFrom(req);
      if (!token) {
        return reply.code(401).send({
          error: { code: 'UNAUTHORIZED', message: 'Falta el token de refresco' },
        });
      }
      const tokens = await auth.refresh(ctx, token);
      setRefreshCookie(reply, tokens.refresh_token);
      return tokens;
    });

    app.post('/auth/logout', async (req, reply) => {
      await auth.logout(ctx, refreshTokenFrom(req));
      reply.clearCookie(REFRESH_COOKIE, { path: '/' });
      return reply.code(204).send();
    });

    app.get('/auth/me', { preHandler: guards.requireUser() }, async (req) =>
      auth.me(ctx, currentUser(req).id),
    );
  };
}
