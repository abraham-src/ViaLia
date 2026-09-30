import type { RoleName } from '@simu/shared-types';
import { ROLE_NAMES } from '@simu/shared-types';
import { SignJWT, jwtVerify } from 'jose';
import type { Config } from '../config.js';
import { unauthorized } from '../lib/errors.js';

const ISSUER = 'simu-api';
const AUDIENCE = 'simu';

export interface AccessClaims {
  sub: string;
  role: RoleName;
  name: string;
}

export interface RefreshClaims {
  sub: string;
  jti: string;
}

export interface TokenService {
  signAccess(claims: AccessClaims): Promise<string>;
  verifyAccess(token: string): Promise<AccessClaims>;
  signRefresh(claims: RefreshClaims): Promise<string>;
  verifyRefresh(token: string): Promise<RefreshClaims>;
  accessTtlSeconds: number;
  refreshTtlSeconds: number;
}

export function createTokenService(config: Config): TokenService {
  const accessKey = new TextEncoder().encode(config.JWT_ACCESS_SECRET);
  const refreshKey = new TextEncoder().encode(config.JWT_REFRESH_SECRET);

  return {
    accessTtlSeconds: config.JWT_ACCESS_TTL,
    refreshTtlSeconds: config.JWT_REFRESH_TTL,

    signAccess: ({ sub, role, name }) =>
      new SignJWT({ role, name, typ: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(sub)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${config.JWT_ACCESS_TTL}s`)
        .sign(accessKey),

    async verifyAccess(token) {
      try {
        const { payload } = await jwtVerify(token, accessKey, {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ['HS256'],
        });
        const role = payload.role;
        if (
          payload.typ !== 'access' ||
          typeof payload.sub !== 'string' ||
          typeof payload.name !== 'string' ||
          typeof role !== 'string' ||
          !(ROLE_NAMES as readonly string[]).includes(role)
        ) {
          throw new Error('malformed access token');
        }
        return { sub: payload.sub, role: role as RoleName, name: payload.name };
      } catch {
        throw unauthorized('Token de acceso inválido o expirado');
      }
    },

    signRefresh: ({ sub, jti }) =>
      new SignJWT({ typ: 'refresh' })
        .setProtectedHeader({ alg: 'HS256' })
        .setSubject(sub)
        .setJti(jti)
        .setIssuer(ISSUER)
        .setAudience(AUDIENCE)
        .setIssuedAt()
        .setExpirationTime(`${config.JWT_REFRESH_TTL}s`)
        .sign(refreshKey),

    async verifyRefresh(token) {
      try {
        const { payload } = await jwtVerify(token, refreshKey, {
          issuer: ISSUER,
          audience: AUDIENCE,
          algorithms: ['HS256'],
        });
        if (
          payload.typ !== 'refresh' ||
          typeof payload.sub !== 'string' ||
          typeof payload.jti !== 'string'
        ) {
          throw new Error('malformed refresh token');
        }
        return { sub: payload.sub, jti: payload.jti };
      } catch {
        throw unauthorized('Token de refresco inválido o expirado');
      }
    },
  };
}
