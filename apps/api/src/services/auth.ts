import type { AuthUserDto, TokenResponse } from '@simu/shared-types';
import { verifyPassword } from '../auth/password.js';
import { unauthorized } from '../lib/errors.js';
import { toAuthUserDto } from '../lib/serialize.js';
import type { ServiceContext } from './context.js';

const userSelect = {
  id: true,
  name: true,
  email: true,
  status: true,
  passwordHash: true,
  role: { select: { name: true } },
} as const;

async function issueTokens(
  ctx: ServiceContext,
  user: AuthUserDto,
  refreshRowId: string,
): Promise<TokenResponse> {
  const [access_token, refresh_token] = await Promise.all([
    ctx.tokens.signAccess({ sub: user.id, role: user.role, name: user.name }),
    ctx.tokens.signRefresh({ sub: user.id, jti: refreshRowId }),
  ]);
  return {
    access_token,
    token_type: 'Bearer',
    expires_in: ctx.tokens.accessTtlSeconds,
    refresh_token,
    user,
  };
}

function refreshExpiry(ctx: ServiceContext): Date {
  return new Date(Date.now() + ctx.tokens.refreshTtlSeconds * 1000);
}

export async function login(
  ctx: ServiceContext,
  email: string,
  password: string,
): Promise<TokenResponse> {
  const row = await ctx.prisma.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: userSelect,
  });
  // Always run bcrypt, even for unknown emails (timing-safe enumeration defence).
  const ok = await verifyPassword(password, row?.passwordHash ?? null);
  if (!row || !ok || row.status !== 'active') throw unauthorized('Credenciales inválidas');

  const token = await ctx.prisma.refreshToken.create({
    data: { userId: row.id, expiresAt: refreshExpiry(ctx) },
    select: { id: true },
  });
  return issueTokens(ctx, toAuthUserDto(row), token.id);
}

/**
 * Rotates a refresh token. Presenting an already-revoked token means it was stolen or
 * replayed: every active token of that user is revoked (forces re-login everywhere).
 */
export async function refresh(ctx: ServiceContext, refreshToken: string): Promise<TokenResponse> {
  const claims = await ctx.tokens.verifyRefresh(refreshToken);
  const row = await ctx.prisma.refreshToken.findUnique({ where: { id: claims.jti } });
  if (!row || row.userId !== claims.sub) throw unauthorized('Sesión no válida');

  if (row.revokedAt) {
    await ctx.prisma.refreshToken.updateMany({
      where: { userId: row.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    throw unauthorized('Sesión revocada. Inicia sesión de nuevo');
  }
  if (row.expiresAt <= new Date()) throw unauthorized('Sesión expirada');

  const user = await ctx.prisma.user.findUnique({ where: { id: row.userId }, select: userSelect });
  if (!user || user.status !== 'active') throw unauthorized('Usuario inactivo');

  const next = await ctx.prisma.$transaction(async (tx) => {
    const created = await tx.refreshToken.create({
      data: { userId: row.userId, expiresAt: refreshExpiry(ctx) },
      select: { id: true },
    });
    // Conditional update: two concurrent refreshes with the same token cannot both win.
    const revoked = await tx.refreshToken.updateMany({
      where: { id: row.id, revokedAt: null },
      data: { revokedAt: new Date(), replacedBy: created.id },
    });
    if (revoked.count !== 1) throw unauthorized('Sesión revocada. Inicia sesión de nuevo');
    return created;
  });

  return issueTokens(ctx, toAuthUserDto(user), next.id);
}

/** Revokes the given refresh token. Invalid or unknown tokens are ignored (idempotent). */
export async function logout(ctx: ServiceContext, refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  try {
    const claims = await ctx.tokens.verifyRefresh(refreshToken);
    await ctx.prisma.refreshToken.updateMany({
      where: { id: claims.jti, userId: claims.sub, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // Already invalid: nothing to revoke.
  }
}

export async function me(ctx: ServiceContext, userId: string): Promise<AuthUserDto> {
  const user = await ctx.prisma.user.findUnique({ where: { id: userId }, select: userSelect });
  if (!user || user.status !== 'active') throw unauthorized('Usuario inactivo');
  return toAuthUserDto(user);
}
