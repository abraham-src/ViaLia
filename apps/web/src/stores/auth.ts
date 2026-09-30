import type { AuthUserDto, TokenResponse } from '@simu/shared-types';
import { create } from 'zustand';

export type AuthStatus = 'unknown' | 'authenticated' | 'anonymous';

interface AuthState {
  status: AuthStatus;
  /** Kept in memory only: never in localStorage (XSS-safe). The refresh token is an httpOnly cookie. */
  accessToken: string | null;
  user: AuthUserDto | null;
  setSession(tokens: TokenResponse): void;
  clear(): void;
}

export const useAuth = create<AuthState>((set) => ({
  status: 'unknown',
  accessToken: null,
  user: null,
  setSession: (tokens) =>
    set({ status: 'authenticated', accessToken: tokens.access_token, user: tokens.user }),
  clear: () => set({ status: 'anonymous', accessToken: null, user: null }),
}));

export const isStaff = (user: AuthUserDto | null): boolean =>
  user?.role === 'admin' || user?.role === 'operator' || user?.role === 'maintenance';
