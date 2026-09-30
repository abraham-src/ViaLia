import { z } from 'zod';

const emptyToUndefined = (v: unknown): unknown => (v === '' ? undefined : v);

const DURATION = /^(\d+)([smhd])$/;
const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86_400 } as const;

/** Parses "15m", "7d", "3600s", "12h" into seconds. */
export function parseDurationSeconds(value: string): number {
  const match = DURATION.exec(value);
  if (!match) throw new RangeError(`Duración inválida: ${value}`);
  const [, amount, unit] = match as unknown as [string, string, keyof typeof UNIT_SECONDS];
  return Number(amount) * UNIT_SECONDS[unit];
}

const duration = z
  .string()
  .regex(DURATION, 'usa el formato <n>[s|m|h|d], por ejemplo 15m o 7d')
  .transform(parseDurationSeconds);

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .default('false')
  .transform((v) => v === 'true' || v === '1');

export const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  API_HOST: z.string().default('0.0.0.0'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET debe tener al menos 32 caracteres'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET debe tener al menos 32 caracteres'),
  /** Seconds. */
  JWT_ACCESS_TTL: duration.default('15m'),
  /** Seconds. */
  JWT_REFRESH_TTL: duration.default('7d'),
  /** Shared secret sent by gateways/simulator in the `x-device-key` header. */
  DEVICE_INGEST_KEY: z.string().min(16, 'DEVICE_INGEST_KEY debe tener al menos 16 caracteres'),
  /** Set to true when the web is served over HTTPS. */
  COOKIE_SECURE: booleanString,
  LOGIN_RATE_LIMIT_MAX: z.coerce.number().int().min(1).default(10),
  /** Seconds without heartbeat before a device is marked offline (spec §6.2: 90 s). */
  HEARTBEAT_TIMEOUT_S: z.coerce.number().int().min(5).default(90),
  /** How often the offline monitor runs. */
  HEARTBEAT_CHECK_INTERVAL_S: z.coerce.number().int().min(1).default(10),
  /** Camera detections below this confidence are stored but create no incident. */
  CAMERA_MIN_CONFIDENCE: z.coerce.number().min(0).max(1).default(0.6),
  /** A repeated detection (same camera + type) within this window refreshes the open incident. */
  CAMERA_DEDUP_MINUTES: z.coerce.number().int().min(1).default(15),
  /** Detections older than this (late store-and-forward) are stored but create no incident. */
  CAMERA_EVENT_MAX_AGE_MIN: z.coerce.number().int().min(1).default(30),
  /** The latest weather report is considered current for this long. */
  WEATHER_MAX_AGE_MIN: z.coerce.number().int().min(1).default(180),
  /** When the sender omits `synced`, data older than this is flagged synced=false. */
  SYNC_LATE_THRESHOLD_S: z.coerce.number().int().min(1).default(60),
  AI_SERVICE_URL: z.preprocess(emptyToUndefined, z.string().url().optional()),
  /** Folder with the static GeoJSON layers (database/gis). Relative to the API's cwd. */
  GIS_DIR: z.string().default('../../database/gis'),
});

export type Config = z.infer<typeof EnvSchema>;

/** Parses and validates the environment. Throws a readable error listing every problem. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuración de entorno inválida:\n${issues}`);
  }
  return parsed.data;
}
