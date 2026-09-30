/** Domain/HTTP error with a stable machine-readable code. Messages are user-facing (es-MX). */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown): AppError =>
  new AppError(400, 'BAD_REQUEST', message, details);

export const unauthorized = (message = 'No autenticado'): AppError =>
  new AppError(401, 'UNAUTHORIZED', message);

export const forbidden = (message = 'No tienes permiso para esta acción'): AppError =>
  new AppError(403, 'FORBIDDEN', message);

export const notFound = (what: string): AppError =>
  new AppError(404, 'NOT_FOUND', `${what} no encontrado`);

export const conflict = (message: string, details?: unknown): AppError =>
  new AppError(409, 'CONFLICT', message, details);

export const notImplemented = (message: string): AppError =>
  new AppError(501, 'NOT_IMPLEMENTED', message);
