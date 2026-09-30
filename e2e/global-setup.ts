import { migrateTestDatabase, resetTestDatabase } from '../apps/api/test/db';
import { E2E_DATABASE_URL } from './env';

/** Brings simu_e2e to the latest migration and the seed state before the run. */
export default async function globalSetup(): Promise<void> {
  migrateTestDatabase(E2E_DATABASE_URL);
  await resetTestDatabase(E2E_DATABASE_URL);
}
