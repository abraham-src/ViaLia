import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Secrets (JWT, device key, demo password) come from the root .env, as in development.
// Variables already set in the environment win.
try {
  process.loadEnvFile(path.join(repoRoot, '.env'));
} catch {
  // No .env (CI sets the variables directly).
}

/**
 * Isolated E2E stack: its own database, ports and gateway SQLite file, so a run never
 * touches the development data. Ports sit next to the dev ones (3000/4000/5173).
 */
export const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL ??
  'postgresql://simu:simu_dev_password@localhost:5432/simu_e2e?schema=public';

export const API_URL = 'http://localhost:3100';
export const SIMULATOR_URL = 'http://localhost:4100';
export const WEB_URL = 'http://localhost:5174';

/** Relative to apps/simulator; removed before each run (see clean-gateway-db.mjs). */
export const GATEWAY_DB_PATH = 'data/simu-gateway-e2e.db';

/** Demo password of the four seeded users. */
export const DEMO_PASSWORD = process.env.SEED_DEMO_PASSWORD ?? 'simu2026';
