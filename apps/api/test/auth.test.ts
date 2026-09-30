import type { AuthUserDto, TokenResponse } from '@simu/shared-types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  bearer,
  createTestApp,
  DEMO,
  hasTestDb,
  login,
  type DemoRole,
  type TestContext,
} from './helpers.js';

describe.skipIf(!hasTestDb)('auth', () => {
  let t: TestContext;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  it.each(Object.keys(DEMO) as DemoRole[])('logs in the demo %s user', async (role) => {
    const tokens = await login(t.app, role);
    expect(tokens.token_type).toBe('Bearer');
    expect(tokens.expires_in).toBe(900);
    expect(tokens.user.role).toBe(role);
    expect(tokens.user).not.toHaveProperty('passwordHash');
  });

  it('sets the refresh token as an httpOnly SameSite=Strict cookie', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: DEMO.operator, password: process.env.SEED_DEMO_PASSWORD },
    });
    const cookie = res.cookies.find((c) => c.name === 'simu_rt');
    expect(cookie).toBeDefined();
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe('Strict');
    expect(cookie?.path).toBe('/');
  });

  it('rejects a wrong password and an unknown email with the same message', async () => {
    const wrong = await t.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: DEMO.admin, password: 'incorrecta' },
    });
    const unknown = await t.app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'nadie@simu.local', password: 'incorrecta' },
    });
    expect(wrong.statusCode).toBe(401);
    expect(unknown.statusCode).toBe(401);
    expect(wrong.json().error.message).toBe(unknown.json().error.message);
  });

  it('validates the login body', async () => {
    const res = await t.app.inject({ method: 'POST', url: '/auth/login', payload: { email: 'x' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error.code).toBe('VALIDATION_ERROR');
  });

  it('returns the current user from /auth/me', async () => {
    const { access_token } = await login(t.app, 'maintenance');
    const res = await t.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: bearer(access_token),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json<AuthUserDto>()).toMatchObject({ email: DEMO.maintenance, role: 'maintenance' });
  });

  it('rejects missing and forged access tokens', async () => {
    const none = await t.app.inject({ method: 'GET', url: '/auth/me' });
    const forged = await t.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: bearer('eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.invalid'),
    });
    expect(none.statusCode).toBe(401);
    expect(forged.statusCode).toBe(401);
  });

  it('does not accept a refresh token as an access token', async () => {
    const { refresh_token } = await login(t.app, 'admin');
    const res = await t.app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: bearer(refresh_token),
    });
    expect(res.statusCode).toBe(401);
  });

  it('rotates refresh tokens and revokes the family when an old one is replayed', async () => {
    const first = await login(t.app, 'operator');

    const rotated = await t.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: first.refresh_token },
    });
    expect(rotated.statusCode).toBe(200);
    const second = rotated.json<TokenResponse>();
    expect(second.refresh_token).not.toBe(first.refresh_token);

    // Replay of the already-rotated token: rejected, and the new one dies with it.
    const replay = await t.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: first.refresh_token },
    });
    expect(replay.statusCode).toBe(401);

    const afterReplay = await t.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token: second.refresh_token },
    });
    expect(afterReplay.statusCode).toBe(401);
  });

  it('accepts the refresh token from the cookie', async () => {
    const { refresh_token } = await login(t.app, 'citizen');
    const res = await t.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      cookies: { simu_rt: refresh_token },
    });
    expect(res.statusCode).toBe(200);
  });

  it('revokes the refresh token on logout and clears the cookie', async () => {
    const { refresh_token } = await login(t.app, 'admin');
    const out = await t.app.inject({
      method: 'POST',
      url: '/auth/logout',
      payload: { refresh_token },
    });
    expect(out.statusCode).toBe(204);
    expect(out.cookies.find((c) => c.name === 'simu_rt')?.value).toBe('');

    const res = await t.app.inject({
      method: 'POST',
      url: '/auth/refresh',
      payload: { refresh_token },
    });
    expect(res.statusCode).toBe(401);
  });

  it('blocks suspended users', async () => {
    const user = await t.prisma.user.findUniqueOrThrow({ where: { email: DEMO.citizen } });
    await t.prisma.user.update({ where: { id: user.id }, data: { status: 'suspended' } });
    try {
      const res = await t.app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: DEMO.citizen, password: process.env.SEED_DEMO_PASSWORD },
      });
      expect(res.statusCode).toBe(401);
    } finally {
      await t.prisma.user.update({ where: { id: user.id }, data: { status: 'active' } });
    }
  });
});
