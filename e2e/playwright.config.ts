import { defineConfig, devices } from '@playwright/test';
import { API_URL, E2E_DATABASE_URL, GATEWAY_DB_PATH, SIMULATOR_URL, WEB_URL } from './env';

/**
 * End-to-end tests of the six demo scenarios (docs/escenarios-demo.md).
 * Playwright boots its own API, simulator and web on ports 3100/4100/5174 against the
 * `simu_e2e` database. Secrets come from the root .env, as in development.
 */
export default defineConfig({
  testDir: './tests',
  globalSetup: './global-setup.ts',
  // The scenarios share one simulated city: run them one at a time.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: '../playwright-report' }]],
  outputDir: '../test-results',
  use: {
    baseURL: WEB_URL,
    locale: 'es-MX',
    timezoneId: 'America/Mexico_City',
    viewport: { width: 1600, height: 900 },
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1600, height: 900 },
        // Software WebGL so the MapLibre canvas renders on machines without a GPU.
        launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] },
      },
    },
  ],
  webServer: [
    {
      name: 'api',
      cwd: '../apps/api',
      command: 'npx dotenv -e ../../.env -- tsx src/server.ts',
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        API_PORT: '3100',
        LOG_LEVEL: 'warn',
        LOGIN_RATE_LIMIT_MAX: '1000',
        // Faster offline detection so scenario 6 fits in one test.
        HEARTBEAT_TIMEOUT_S: '20',
        HEARTBEAT_CHECK_INTERVAL_S: '2',
      },
    },
    {
      name: 'simulator',
      cwd: '../apps/simulator',
      command: `node ../../e2e/clean-gateway-db.mjs ${GATEWAY_DB_PATH} && npx dotenv -e ../../.env -- tsx src/server.ts`,
      url: `${SIMULATOR_URL}/control/state`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        SIMULATOR_PORT: '4100',
        SIMULATOR_API_URL: API_URL,
        SIMULATOR_DB_PATH: GATEWAY_DB_PATH,
        LOG_LEVEL: 'warn',
        HEARTBEAT_INTERVAL_MS: '5000',
        // No random camera detections: every incident in a test comes from its scenario.
        CAMERA_RANDOM_PROBABILITY: '0',
      },
    },
    {
      name: 'web',
      cwd: '../apps/web',
      command: 'npx vite --strictPort',
      url: WEB_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        WEB_PORT: '5174',
        SIMU_API_URL: API_URL,
        SIMU_SIMULATOR_URL: SIMULATOR_URL,
      },
    },
  ],
});
