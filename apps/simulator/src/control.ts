import { CAMERA_EVENT_TYPES } from '@simu/shared-types';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { ApiClient, Connectivity } from './api-client.js';
import { CAMERAS, DRAINS, ALL_DEVICES } from './catalog.js';
import { CONTROL_PANEL_HTML } from './control-panel.js';
import { internetOutage, resetEnvironment, SCENARIOS, type ScenarioRunner } from './scenarios.js';
import type { Simulation } from './simulation.js';
import type { Outbox } from './store.js';
import type { SyncWorker } from './sync.js';
import { TRAFFIC_MODES, trafficNetworkGeoJson, type TrafficModel } from './traffic.js';
import { TRAFFIC_ZONES } from './traffic-network.js';

export interface ControlDeps {
  sim: Simulation;
  connectivity: Connectivity;
  sync: SyncWorker;
  outbox: Outbox;
  runner: ScenarioRunner;
  api: ApiClient;
  traffic: TrafficModel;
  apiUrl: string;
}

const InternetBody = z.object({
  online: z.boolean(),
  seconds: z.number().int().min(1).max(3600).default(60),
});
const DrainBody = z.object({
  code: z.enum(DRAINS as [string, ...string[]]),
  /** null returns the drain to its normal random walk. */
  level: z.number().min(0).max(100).nullable(),
});
const CameraBody = z.object({
  code: z.enum(CAMERAS),
  event_type: z.enum(CAMERA_EVENT_TYPES),
  confidence: z.number().min(0).max(1).default(0.92),
});
const WeatherBody = z.object({
  raining: z.boolean(),
  zone: z.string().max(20).nullable().default(null),
  intensity_mm_h: z.number().min(0).max(500).nullable().default(null),
});
const HealthBody = z.object({
  code: z.enum(ALL_DEVICES as unknown as [string, ...string[]]),
  status: z.enum(['online', 'degraded']),
});
const TrafficBody = z
  .object({
    zone: z.enum(TRAFFIC_ZONES.map((z) => z.code) as [string, ...string[]]),
    enabled: z.boolean().optional(),
    mode: z.enum(TRAFFIC_MODES).optional(),
  })
  .refine((b) => b.enabled !== undefined || b.mode !== undefined, 'enabled o mode');
const ScenarioParams = z.object({ id: z.coerce.number().int().min(1).max(SCENARIOS.length) });

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.output<T> {
  const r = schema.safeParse(input);
  if (!r.success) {
    const err = new Error(
      r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
    );
    (err as Error & { statusCode: number }).statusCode = 400;
    throw err;
  }
  return r.data;
}

/**
 * Demo control panel (spec §8). No authentication: the simulator is an internal tool
 * reachable only inside the Docker network or through the web's /simulator proxy.
 */
export function controlRoutes(deps: ControlDeps): FastifyPluginAsync {
  const { sim, connectivity, sync, outbox, runner, api, traffic } = deps;
  const network = trafficNetworkGeoJson();
  let outageTimer: NodeJS.Timeout | null = null;
  const env = { sim, connectivity, sync };

  return async (app) => {
    app.get('/control', async (_req, reply) =>
      reply.type('text/html; charset=utf-8').send(CONTROL_PANEL_HTML),
    );

    app.get('/control/state', async () => ({
      api_url: deps.apiUrl,
      api_reachable: await api.isApiHealthy(),
      internet: {
        online: connectivity.isOnline(),
        offline_remaining_s: connectivity.remainingSeconds(),
      },
      outbox: outbox.stats(),
      sync: sync.getStatus(),
      drains: [...sim.drains.values()].map((d) => ({
        code: d.code,
        level: Math.round(d.level),
        base: d.base,
        forced: d.hold !== null,
      })),
      weather: sim.weather,
      degraded: [...sim.health.entries()].filter(([, s]) => s === 'degraded').map(([c]) => c),
      scenario: runner.current(),
      scenarios: SCENARIOS.map((s) => ({ id: s.id, name: s.name, description: s.description })),
      log: sim.recentLog(),
      traffic: traffic.snapshot().zones,
    }));

    // Real-time traffic: static network once, then a small state payload every few seconds.
    app.get('/traffic/network', async (_req, reply) => {
      reply.header('cache-control', 'public, max-age=3600');
      return network;
    });
    app.get('/traffic', async (_req, reply) => {
      reply.header('cache-control', 'no-store');
      return traffic.snapshot();
    });

    app.post('/control/traffic', async (req) => {
      const body = parse(TrafficBody, req.body);
      const z = traffic.setZone(body.zone, { enabled: body.enabled, mode: body.mode });
      traffic.step(new Date(), sim.weather, 0.6);
      sim.record(
        `Tráfico ${z.name}: ${z.enabled ? 'en vivo' : 'apagado'}${z.mode === 'auto' ? '' : ` · forzado ${z.mode}`}`,
      );
      return z;
    });

    app.post('/control/internet', async (req) => {
      const body = parse(InternetBody, req.body);
      if (outageTimer) clearTimeout(outageTimer);
      outageTimer = null;
      if (body.online) {
        connectivity.goOnline();
        sync.kick();
        sim.record('Internet ON (manual)');
      } else {
        outageTimer = internetOutage(env, body.seconds);
      }
      return {
        online: connectivity.isOnline(),
        offline_remaining_s: connectivity.remainingSeconds(),
      };
    });

    app.post('/control/drain', async (req) => {
      const body = parse(DrainBody, req.body);
      sim.setDrainLevel(body.code, body.level);
      return { ok: true };
    });

    app.post('/control/camera', async (req) => {
      const body = parse(CameraBody, req.body);
      sim.emitCamera(body.code, body.event_type, body.confidence);
      sync.kick();
      return { ok: true };
    });

    app.post('/control/weather', async (req) => {
      const body = parse(WeatherBody, req.body);
      sim.setWeather(body.raining, body.zone, body.intensity_mm_h);
      sync.kick();
      return { ok: true };
    });

    app.post('/control/health', async (req) => {
      const body = parse(HealthBody, req.body);
      sim.setHealth(body.code, body.status);
      sim.sendHeartbeats();
      sync.kick();
      return { ok: true };
    });

    app.post('/control/scenario/:id', async (req) => {
      const { id } = parse(ScenarioParams, req.params);
      return runner.run(id);
    });

    app.post('/control/reset', async () => {
      runner.cancel();
      if (outageTimer) clearTimeout(outageTimer);
      outageTimer = null;
      resetEnvironment(env);
      traffic.reset();
      return { ok: true };
    });
  };
}
