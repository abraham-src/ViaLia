import { describe, expect, it } from 'vitest';
import {
  LIMITS,
  SCENARIOS,
  compareModes,
  createSim,
  lampFor,
  mulberry32,
  setAiOnline,
  step,
  type SimState,
} from './intersection';
import { flagsFromIncidents } from './store';

/** Corre la simulación y registra cada cambio de fase con su duración. */
function trace(sim: SimState, seconds: number, dt = 0.25) {
  const phases: Array<{ kind: string; axis: string; dur: number }> = [];
  let prev = sim.phase.kind + sim.phase.axis;
  let start = sim.t;
  let maxPedWait = 0;
  for (let i = 0; i < seconds / dt; i++) {
    step(sim, dt, SCENARIOS.pedestrians.demand);
    const first = sim.peds[0];
    if (first !== undefined) maxPedWait = Math.max(maxPedWait, sim.t - first);
    // Nunca dos ejes en verde a la vez.
    expect(lampFor(sim, 'N') === 'green' && lampFor(sim, 'E') === 'green').toBe(false);
    const key = sim.phase.kind + sim.phase.axis;
    if (key !== prev) {
      phases.push({ kind: prev.replace(/(NS|EW)$/, ''), axis: prev.slice(-2), dur: sim.t - start });
      prev = key;
      start = sim.t;
    }
  }
  return { phases, maxPedWait };
}

describe('ViaLia · semáforo · reglas de seguridad', () => {
  it('el generador es determinista', () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('respeta verde mínimo y máximo, amarillo y todo en rojo', () => {
    const { phases } = trace(createSim({ seed: 11 }), 1800);
    const greens = phases.filter((p) => p.kind === 'green');
    expect(greens.length).toBeGreaterThan(10);
    for (const g of greens) {
      expect(g.dur).toBeGreaterThanOrEqual(LIMITS.minGreen - 0.01);
      expect(g.dur).toBeLessThanOrEqual(LIMITS.maxGreen + 0.26);
    }
    for (const y of phases.filter((p) => p.kind === 'yellow')) {
      expect(y.dur).toBeCloseTo(LIMITS.yellow, 0);
    }
    // Después de cada amarillo viene todo en rojo.
    phases.forEach((p, i) => {
      if (p.kind === 'yellow') expect(phases[i + 1]?.kind ?? 'allred').toBe('allred');
    });
  });

  it('ningún peatón espera más de la espera máxima', () => {
    const { maxPedWait } = trace(createSim({ seed: 5 }), 1800);
    expect(maxPedWait).toBeLessThanOrEqual(LIMITS.pedMaxWait + 1);
  });

  it('sin IA cae al plan fijo seguro', () => {
    const sim = createSim({ seed: 3 });
    setAiOnline(sim, false);
    const { phases } = trace(sim, 600);
    const greens = phases.filter((p) => p.kind === 'green').slice(1);
    for (const g of greens) expect(g.dur).toBeCloseTo(LIMITS.fixedGreen, 0);
    expect(sim.decisions.some((d) => d.kind === 'failsafe')).toBe(true);
  });
});

describe('ViaLia · semáforo · prueba 14.1', () => {
  it('con demanda desigual el adaptativo reduce la espera', () => {
    const r = compareModes(SCENARIOS.peakNorth.demand, 6, 600);
    expect(r.adaptive.avgWait.mean).toBeLessThan(r.fixed.avgWait.mean);
    expect(r.waitChange).toBeLessThan(-0.2);
  });

  it('es reproducible: misma demanda, mismo resultado', () => {
    const a = compareModes(SCENARIOS.normal.demand, 3, 300);
    const b = compareModes(SCENARIOS.normal.demand, 3, 300);
    expect(a.adaptive.avgWait.mean).toBe(b.adaptive.avgWait.mean);
  });
});

describe('Incidencias → accesos restringidos', () => {
  const light: [number, number] = [-99.16494, 19.41718];
  const base = {
    device_code: 'DRAIN-001',
    description: '',
    confidence: 1,
    status: 'pending' as const,
    created_at: '',
    updated_at: '',
    validated_at: null,
    resolved_at: null,
    assigned_to: null,
    metadata: {},
  };

  it('un riesgo al oriente limita el acceso Poniente (el tráfico que va hacia allá)', () => {
    const flags = flagsFromIncidents(light, [
      {
        ...base,
        id: '1',
        type: 'flood_risk',
        priority: 'critical',
        latitude: 19.41832,
        longitude: -99.15988,
      },
    ]);
    expect(flags.W).not.toBeNull();
    expect(flags.N).toBeNull();
    expect(flags.W?.reason).toMatch(/oriente/);
  });

  it('ignora lo que está lejos o no afecta la circulación', () => {
    const flags = flagsFromIncidents(light, [
      {
        ...base,
        id: '2',
        type: 'accessibility_block',
        priority: 'medium',
        latitude: 19.4184,
        longitude: -99.15916,
      },
      {
        ...base,
        id: '3',
        type: 'accident',
        priority: 'high',
        latitude: 19.434,
        longitude: -99.134,
      },
    ]);
    expect(Object.values(flags).every((f) => f === null)).toBe(true);
  });
});
