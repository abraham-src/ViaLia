import type { IncidentDto, IncidentPriority } from '@simu/shared-types';
import { create } from 'zustand';
import { bearingDeg, compassWord, distanceM, formatDistance, type LngLat } from '../lib/geo';
import { approachHeadingTo } from './geometry';
import { INCIDENT_VISUAL } from '../lib/visuals';
import {
  APPROACHES,
  SCENARIOS,
  createSim,
  setAiOnline,
  setFlags,
  setMode,
  step,
  type Approach,
  type Demand,
  type Flag,
  type Mode,
  type ScenarioKey,
  type SimState,
} from './intersection';

/**
 * Simulación en vivo del semáforo TL-001 (Insurgentes y Álvaro Obregón).
 * Corre mientras el centro de control está abierto; el mapa, el detalle de incidencia y
 * la vista de intersección leen el mismo estado. El controlador corre en el navegador
 * (el backend todavía no controla semáforos, ver memoria, sección 20), pero en el
 * escenario "live" la demanda viene del tráfico en tiempo real del simulador de campo.
 */
export type SignalScenario = ScenarioKey | 'live';

export const LIVE_SCENARIO = {
  label: 'Tráfico en vivo',
  hint: 'Demanda del simulador de campo',
} as const;
export const MAIN_LIGHT = 'TL-001';
export const RADIUS_M = 600;

interface SimStore {
  sim: SimState;
  /** Cambia en cada paso para que React vuelva a pintar. */
  v: number;
  speed: number;
  scenario: SignalScenario;
  /** Demanda derivada del tráfico del simulador (null = sin datos: se usa el caso base). */
  liveDemand: Demand | null;
  running: boolean;
  start(): void;
  stop(): void;
  setMode(mode: Mode): void;
  setAi(online: boolean): void;
  setScenario(key: SignalScenario): void;
  setLiveDemand(demand: Demand | null): void;
  setSpeed(speed: number): void;
  applyFlags(flags: Record<Approach, Flag | null>): void;
  reset(): void;
}

let timer: number | null = null;
let users = 0;
const TICK_MS = 100;

export const useSignal = create<SimStore>((set, get) => ({
  sim: createSim({ seed: Date.now() % 100_000 }),
  v: 0,
  speed: 1,
  scenario: 'live',
  liveDemand: null,
  running: false,
  start: () => {
    users++;
    if (timer !== null) return;
    let last = performance.now();
    timer = window.setInterval(() => {
      const now = performance.now();
      // Si la pestaña estuvo oculta, no "adelantar" minutos de golpe.
      const elapsed = Math.min(1, (now - last) / 1000) * get().speed;
      last = now;
      const demand = currentDemand(get());
      const { sim } = get();
      let left = elapsed;
      while (left > 1e-6) {
        const dt = Math.min(0.25, left);
        step(sim, dt, demand);
        left -= dt;
      }
      set((s) => ({ v: s.v + 1 }));
    }, TICK_MS);
    set({ running: true });
  },
  stop: () => {
    users = Math.max(0, users - 1);
    if (users > 0 || timer === null) return;
    window.clearInterval(timer);
    timer = null;
    set({ running: false });
  },
  setMode: (mode) => {
    setMode(get().sim, mode);
    set((s) => ({ v: s.v + 1 }));
  },
  setAi: (online) => {
    setAiOnline(get().sim, online);
    set((s) => ({ v: s.v + 1 }));
  },
  setScenario: (scenario) => set({ scenario }),
  setLiveDemand: (liveDemand) => set({ liveDemand }),
  setSpeed: (speed) => set({ speed }),
  applyFlags: (flags) => {
    setFlags(get().sim, flags);
    set((s) => ({ v: s.v + 1 }));
  },
  reset: () => {
    const { sim } = get();
    const fresh = createSim({ mode: sim.mode, seed: Date.now() % 100_000, aiOnline: sim.aiOnline });
    fresh.flags = { ...sim.flags };
    set((s) => ({ sim: fresh, v: s.v + 1 }));
  },
}));

/** Demanda que usa el modelo en este momento. */
export function currentDemand(s: { scenario: SignalScenario; liveDemand: Demand | null }): Demand {
  if (s.scenario === 'live') return s.liveDemand ?? SCENARIOS.normal.demand;
  return SCENARIOS[s.scenario].demand;
}

const WEIGHT: Record<IncidentPriority, number> = {
  critical: 0.35,
  high: 0.45,
  medium: 0.6,
  low: 0.8,
};

/**
 * Traduce incidencias activas cercanas a restricciones por acceso. Si el problema está
 * al oriente del cruce, se reduce la prioridad del acceso Poniente (el tráfico que va
 * hacia allá): "limitar flujo hacia la zona" (memoria, figura 5 y sección 9).
 */
export function flagsFromIncidents(
  light: LngLat,
  incidents: readonly IncidentDto[],
  radius = RADIUS_M,
): Record<Approach, Flag | null> {
  const out: Record<Approach, Flag | null> = { N: null, S: null, E: null, W: null };
  for (const i of incidents) {
    if (!INCIDENT_VISUAL[i.type].affectsTraffic && i.priority !== 'critical') continue;
    const p: LngLat = [i.longitude, i.latitude];
    const d = distanceM(light, p);
    if (d > radius) continue;
    const b = bearingDeg(light, p);
    // Brazo real del cruce donde está el problema → acceso cuyo tráfico se dirige hacia él.
    const approach = approachHeadingTo(light, p);
    const weight = WEIGHT[i.priority];
    const what = INCIDENT_VISUAL[i.type].title;
    const reason = `${what} a ${formatDistance(d)} al ${compassWord(b)}${i.device_code ? ` (${i.device_code})` : ''}`;
    const prev = out[approach];
    if (!prev || weight < prev.weight) out[approach] = { weight, reason };
  }
  return out;
}

export function flaggedApproaches(sim: SimState): Approach[] {
  return APPROACHES.filter((a) => sim.flags[a]);
}
