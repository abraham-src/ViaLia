import Fastify from 'fastify';
import { ApiClient, Connectivity } from './api-client.js';
import { loadConfig } from './config.js';
import { controlRoutes } from './control.js';
import { ScenarioRunner } from './scenarios.js';
import { Simulation } from './simulation.js';
import { Outbox } from './store.js';
import { SyncWorker } from './sync.js';
import { TrafficModel } from './traffic.js';

/**
 * SIMU field simulator: replicates the Arduino drains, the Ray-Ban Meta cameras and the
 * laptop gateway (store-and-forward in SQLite). Everything it produces goes through the
 * local outbox first, exactly like the real gateway will.
 */
const config = loadConfig();
const app = Fastify({ logger: { level: config.LOG_LEVEL } });
// Control actions like POST /control/reset carry no body; accept them from any client
// (curl, PowerShell) regardless of the Content-Type it sends. JSON is still parsed.
app.addContentTypeParser('*', (_req, _payload, done) => done(null, undefined));

const outbox = new Outbox(config.SIMULATOR_DB_PATH);
const connectivity = new Connectivity();
const api = new ApiClient(config.SIMULATOR_API_URL, config.DEVICE_INGEST_KEY, connectivity);
const sync = new SyncWorker(
  outbox,
  api.ingest,
  {
    batchSize: config.SYNC_BATCH_SIZE,
    intervalMs: config.SYNC_INTERVAL_MS,
    backoffBaseMs: config.SYNC_BACKOFF_BASE_MS,
    backoffMaxMs: config.SYNC_BACKOFF_MAX_MS,
    lateAfterMs: 15_000,
  },
  app.log,
);
const sim = new Simulation(outbox);
const traffic = new TrafficModel();
const runner = new ScenarioRunner({ sim, connectivity, sync });

const pendingAtBoot = outbox.stats().pending;
if (pendingAtBoot > 0) {
  app.log.info({ pending: pendingAtBoot }, 'pending events from a previous run will be synced');
  sim.record(`Arranque: ${pendingAtBoot} eventos pendientes de la ejecución anterior`);
}

app.get('/health', async () => ({
  status: 'ok',
  service: 'simu-simulator',
  api_url: config.SIMULATOR_API_URL,
  api_reachable: await api.isApiHealthy(),
  internet_online: connectivity.isOnline(),
  outbox: outbox.stats(),
  emitting: timers.length > 0,
  ts: new Date().toISOString(),
}));
await app.register(
  controlRoutes({
    sim,
    connectivity,
    sync,
    outbox,
    runner,
    api,
    traffic,
    apiUrl: config.SIMULATOR_API_URL,
  }),
);

const timers: NodeJS.Timeout[] = [];
function every(ms: number, fn: () => void): void {
  timers.push(setInterval(fn, ms));
}

function startEmitters(): void {
  // Announce every device and the current weather right away, then on schedule.
  sim.sendHeartbeats();
  sim.sendWeather();
  sim.sampleDrains();
  every(config.READING_INTERVAL_MS, () => sim.sampleDrains());
  every(config.HEARTBEAT_INTERVAL_MS, () => sim.sendHeartbeats());
  every(config.CAMERA_INTERVAL_MS, () =>
    sim.maybeRandomDetection(config.CAMERA_RANDOM_PROBABILITY),
  );
  every(config.WEATHER_INTERVAL_MS, () => sim.sendWeather());
  // Keep the SQLite file bounded: synced rows older than 1 h are deleted.
  every(10 * 60_000, () => outbox.purgeSynced(3600_000));
  sim.record('Emisión iniciada: lecturas cada 5 s, heartbeats cada 30 s');
}

sync.start();
if (config.SIMULATOR_AUTOSTART) startEmitters();
// Real-time traffic does not go through the outbox: the web reads it from /traffic.
const trafficTimer = setInterval(
  () => traffic.step(new Date(), sim.weather),
  config.TRAFFIC_INTERVAL_MS,
);

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  app.log.info(
    { signal, pending: outbox.stats().pending },
    'shutting down (pending events stay in SQLite)',
  );
  for (const t of timers) clearInterval(t);
  clearInterval(trafficTimer);
  runner.cancel();
  sync.stop();
  await app.close();
  outbox.close();
  process.exit(0);
}
process.once('SIGINT', (s) => void shutdown(s));
process.once('SIGTERM', (s) => void shutdown(s));

await app.listen({ host: config.SIMULATOR_HOST, port: config.SIMULATOR_PORT });
app.log.info(
  { api: config.SIMULATOR_API_URL, db: config.SIMULATOR_DB_PATH, control: `/control` },
  'simulator ready',
);
