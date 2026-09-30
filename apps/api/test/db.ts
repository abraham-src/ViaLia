import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const require = createRequire(import.meta.url);
export const apiDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoRoot = path.resolve(apiDir, '../..');

/** Every application table (never _prisma_migrations or PostGIS's spatial_ref_sys). */
const TABLES = [
  'refresh_tokens',
  'device_events',
  'incident_events',
  'incidents',
  'heartbeats',
  'sensor_readings',
  'cameras',
  'drains',
  'devices',
  'ramps',
  'accessibility_points',
  'accessible_routes',
  'rules',
  'users',
  'roles',
];

function assertSafe(url: string): void {
  if (url === process.env.DATABASE_URL) {
    throw new Error(
      'TEST_DATABASE_URL no puede ser igual a DATABASE_URL (se truncaría la base de desarrollo)',
    );
  }
}

export function migrateTestDatabase(url: string): void {
  assertSafe(url);
  execFileSync(process.execPath, [require.resolve('prisma/build/index.js'), 'migrate', 'deploy'], {
    cwd: apiDir,
    env: { ...process.env, DATABASE_URL: url },
    stdio: 'pipe',
  });
}

/** Empties every table and re-runs the real seed: each suite starts from the same state. */
export async function resetTestDatabase(url: string): Promise<void> {
  assertSafe(url);
  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    // Static identifiers only; no user input reaches this statement.
    await prisma.$executeRawUnsafe(
      `TRUNCATE ${TABLES.map((t) => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`,
    );
  } finally {
    await prisma.$disconnect();
  }
  execFileSync(
    process.execPath,
    [require.resolve('tsx/cli'), path.join(repoRoot, 'database/seed/seed.ts')],
    {
      cwd: apiDir,
      env: { ...process.env, DATABASE_URL: url },
      stdio: 'pipe',
    },
  );
}
