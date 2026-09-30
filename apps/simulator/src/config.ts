import { z } from 'zod';

const ms = (def: number) => z.coerce.number().int().min(100).default(def);

const EnvSchema = z.object({
  SIMULATOR_HOST: z.string().default('0.0.0.0'),
  SIMULATOR_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  SIMULATOR_API_URL: z.string().url().default('http://localhost:3000'),
  /** Shared secret sent as x-device-key (same value as the API's DEVICE_INGEST_KEY). */
  DEVICE_INGEST_KEY: z.string().min(16, 'DEVICE_INGEST_KEY debe tener al menos 16 caracteres'),
  /** Local store-and-forward database (spec §6.1: simu-gateway.db). */
  SIMULATOR_DB_PATH: z.string().default('data/simu-gateway.db'),
  /** Start emitting on boot. false = only the control panel drives events. */
  SIMULATOR_AUTOSTART: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  READING_INTERVAL_MS: ms(5000),
  HEARTBEAT_INTERVAL_MS: ms(30_000),
  CAMERA_INTERVAL_MS: ms(20_000),
  /** Probability that a camera reports a background detection each camera interval. */
  CAMERA_RANDOM_PROBABILITY: z.coerce.number().min(0).max(1).default(0.15),
  WEATHER_INTERVAL_MS: ms(600_000),
  /** Step of the real-time traffic model (GET /traffic). */
  TRAFFIC_INTERVAL_MS: ms(2000),
  SYNC_INTERVAL_MS: ms(2000),
  SYNC_BATCH_SIZE: z.coerce.number().int().min(1).max(500).default(100),
  SYNC_BACKOFF_BASE_MS: ms(1000),
  SYNC_BACKOFF_MAX_MS: ms(60_000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type SimulatorConfig = z.infer<typeof EnvSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): SimulatorConfig {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.')}: ${i.message}`)
      .join('\n');
    throw new Error(`Configuración del simulador inválida:\n${issues}`);
  }
  return parsed.data;
}
