import { parseBbox } from '@simu/shared-utils';
import { z } from 'zod';
import { AppError } from './errors.js';

/** Parses input with a Zod schema; throws a 400 VALIDATION_ERROR listing every issue. */
export function parse<S extends z.ZodTypeAny>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) {
    throw new AppError(
      400,
      'VALIDATION_ERROR',
      'Datos de entrada inválidos',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  return result.data;
}

/** "a,b,c" → ['a','b','c'] validated against an enum. Empty string → undefined. */
export function csvEnum<T extends readonly [string, ...string[]]>(values: T) {
  return z
    .string()
    .optional()
    .transform((s) =>
      s
        ? s
            .split(',')
            .map((v) => v.trim())
            .filter(Boolean)
        : undefined,
    )
    .pipe(z.array(z.enum(values)).nonempty().optional());
}

export const bboxParam = z
  .string()
  .optional()
  .transform((s, ctx) => {
    if (!s) return undefined;
    try {
      return parseBbox(s);
    } catch (err) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: (err as Error).message });
      return z.NEVER;
    }
  });

/** "lng,lat" → [lng, lat]. */
export const lngLatParam = z
  .string()
  .regex(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/, 'usa el formato lng,lat')
  .transform((s) => s.split(',').map(Number) as [number, number])
  .refine(
    ([lng, lat]) => lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90,
    'coordenadas fuera de rango',
  );

export const isoDate = z
  .string()
  .datetime({ offset: true })
  .transform((s) => new Date(s));

export const deviceCodeParam = z.object({
  code: z.string().regex(/^[A-Z]{2,10}-\d{3}$/, 'código de dispositivo inválido'),
});

export const uuidParam = z.object({ id: z.string().uuid('id inválido') });

export const jsonObject = z.record(z.unknown());
