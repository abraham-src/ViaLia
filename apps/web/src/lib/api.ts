import type { ApiError as ApiErrorBody, TokenResponse } from '@simu/shared-types';
import { useAuth } from '../stores/auth';
import { useConnection } from '../stores/connection';

/** Same origin: Vite (dev) and nginx (Docker) proxy /api to the API. */
export const API_BASE = '/api';

/** The API answered with an error body. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The API could not be reached (no network, API stopped, proxy 502/504). */
export class UnreachableError extends Error {
  constructor(message = 'Servidor no disponible') {
    super(message);
    this.name = 'UnreachableError';
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  /** Attach the access token and refresh it on 401 (default true). */
  auth?: boolean;
  signal?: AbortSignal;
}

let refreshing: Promise<boolean> | null = null;

/**
 * Restores or renews the session using the httpOnly refresh cookie. Single-flight:
 * concurrent 401s share one refresh (a second call would trip reuse detection).
 */
export function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const tokens = await request<TokenResponse>('/auth/refresh', { method: 'POST', auth: false });
      useAuth.getState().setSession(tokens);
      return true;
    } catch (err) {
      if (err instanceof UnreachableError) throw err;
      useAuth.getState().clear();
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

async function readError(res: Response): Promise<ApiError | UnreachableError> {
  let body: ApiErrorBody | null = null;
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    body = null;
  }
  // Proxy errors (no JSON envelope) mean the API itself is down.
  if (!body?.error && res.status >= 500) return new UnreachableError();
  return new ApiError(
    res.status,
    body?.error?.code ?? 'HTTP_ERROR',
    body?.error?.message ?? `Error ${res.status}`,
    body?.error?.details,
  );
}

export async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true, signal } = opts;
  const connection = useConnection.getState();

  const send = async (): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (body !== undefined) headers['content-type'] = 'application/json';
    const token = useAuth.getState().accessToken;
    if (auth && token) headers.authorization = `Bearer ${token}`;
    try {
      return await fetch(`${API_BASE}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        credentials: 'same-origin',
        signal,
      });
    } catch (err) {
      if ((err as Error).name === 'AbortError') throw err;
      connection.setServerReachable(false);
      throw new UnreachableError();
    }
  };

  let res = await send();
  if (res.status === 401 && auth) {
    if (await refreshSession()) res = await send();
  }

  if (!res.ok) {
    const error = await readError(res);
    connection.setServerReachable(!(error instanceof UnreachableError));
    throw error;
  }
  connection.setServerReachable(true);
  connection.touch();
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  get: <T>(path: string, signal?: AbortSignal) => request<T>(path, { signal }),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body }),
};

/** Builds a query string, skipping empty values. */
export function qs(params: Record<string, string | number | boolean | undefined | null>): string {
  const entries = Object.entries(params).filter(
    (e): e is [string, string | number | boolean] =>
      e[1] !== undefined && e[1] !== null && e[1] !== '',
  );
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : '';
}
