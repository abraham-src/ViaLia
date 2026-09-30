import { expect, type Page, test as base } from '@playwright/test';
import { resetTestDatabase } from '../apps/api/test/db';
import { API_URL, DEMO_PASSWORD, E2E_DATABASE_URL, SIMULATOR_URL } from './env';

export type DemoRole = 'admin' | 'operador' | 'mantenimiento' | 'ciudadano';

/** Calls the simulator control API (the same endpoints as its control panel). */
export async function simulator<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${SIMULATOR_URL}/control/${path}`, {
    method: body === undefined && path === 'state' ? 'GET' : 'POST',
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`simulator ${path}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T;
}

export interface SimulatorState {
  internet: { online: boolean };
  outbox: { pending: number; synced: number; dead: number };
}

/** Thin authenticated client for assertions that the UI cannot show exactly. */
export class ApiClient {
  private constructor(private readonly token: string) {}

  static async login(role: DemoRole): Promise<ApiClient> {
    const res = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: `${role}@simu.local`, password: DEMO_PASSWORD }),
    });
    if (!res.ok) throw new Error(`login ${role}: ${res.status}`);
    const { access_token } = (await res.json()) as { access_token: string };
    return new ApiClient(access_token);
  }

  async get<T>(path: string): Promise<T> {
    const res = await fetch(`${API_URL}${path}`, {
      headers: { authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
    return (await res.json()) as T;
  }
}

/** Logs in through the real login page using the demo-account shortcut. */
export async function loginAs(page: Page, role: DemoRole): Promise<void> {
  await page.goto('/login');
  await page
    .getByRole('row', { name: new RegExp(`${role}@simu.local`) })
    .getByRole('button', { name: 'Usar' })
    .click();
  await page.getByRole('button', { name: 'Iniciar sesión' }).click();
  await expect(page).toHaveURL(/\/$/);
}

/** Opens the live event timeline in the bottom bar and returns its list. */
export async function openTimeline(page: Page) {
  const toggle = page.getByRole('button', { name: 'Eventos' });
  if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  return page.locator('ol[aria-live="polite"]').last();
}

/**
 * Every test starts from the seed and the simulator baseline: normal drain levels,
 * no rain, Internet ON. Database first, so the baseline readings land in the fresh data.
 * Events the gateway sends while the tables are being rebuilt are rejected ("device not
 * found"); waiting for an empty outbox keeps them out of the test that follows.
 */
export const test = base.extend<{ world: void }>({
  world: [
    // Playwright requires fixtures to destructure their dependencies, even when empty.
    // eslint-disable-next-line no-empty-pattern
    async ({}, use) => {
      await resetTestDatabase(E2E_DATABASE_URL);
      await simulator('reset', {});
      await expect
        .poll(async () => (await simulator<SimulatorState>('state')).outbox.pending, {
          timeout: 15_000,
        })
        .toBe(0);
      await use();
    },
    { auto: true },
  ],
});

export { expect };
