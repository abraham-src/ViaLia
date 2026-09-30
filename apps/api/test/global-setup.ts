import { migrateTestDatabase } from './db.js';

/**
 * Applies migrations to TEST_DATABASE_URL once per run. Each integration suite then
 * resets data in createTestApp(). Without TEST_DATABASE_URL, integration suites skip.
 */
export default function setup(): void {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) {
    console.warn('[test] TEST_DATABASE_URL no definido: se omiten las pruebas de integración');
    return;
  }
  migrateTestDatabase(url);
}
