import type { Connectivity } from './api-client.js';
import type { Simulation } from './simulation.js';
import type { SyncWorker } from './sync.js';

export interface ScenarioEnv {
  sim: Simulation;
  connectivity: Connectivity;
  sync: SyncWorker;
}

interface Step {
  /** Seconds after the scenario starts. */
  at: number;
  label: string;
  run: (env: ScenarioEnv) => void;
}

export interface ScenarioDef {
  id: number;
  name: string;
  description: string;
  steps: Step[];
}

export interface ScenarioStatus {
  id: number;
  name: string;
  startedAt: string;
  steps: Array<{ at: number; label: string; done: boolean }>;
  finished: boolean;
}

/** Restores the demo baseline: normal levels, no rain, Internet ON, healthy devices. */
export function resetEnvironment({ sim, connectivity, sync }: ScenarioEnv): void {
  sim.resetWorld();
  sim.sendWeather();
  connectivity.goOnline();
  sync.kick();
  sim.record('Estado reiniciado: niveles normales, sin lluvia, Internet ON');
}

/** Internet OFF for `seconds`, then back ON with an immediate sync of the backlog. */
export function internetOutage(
  env: ScenarioEnv,
  seconds: number,
  onRestore?: () => void,
): NodeJS.Timeout {
  env.connectivity.goOffline(seconds);
  env.sim.record(`Internet OFF durante ${seconds} s: el gateway guarda en SQLite`);
  return setTimeout(() => {
    env.connectivity.goOnline();
    env.sync.kick();
    env.sim.record('Internet ON: sincronizando lo pendiente');
    onRestore?.();
  }, seconds * 1000);
}

/** The six demo scenarios of the project document (docs/escenarios-demo.md). */
export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: 1,
    name: 'Operación normal',
    description: 'Coladeras en su nivel habitual, sin lluvia, todos los dispositivos en línea.',
    steps: [{ at: 0, label: 'Reiniciar a la línea base', run: resetEnvironment }],
  },
  {
    id: 2,
    name: 'Coladera obstruyéndose',
    description: 'DRAIN-001 sube 42 % → 71 % → 88 %. Al pasar 80 % el motor emite ALERTA.',
    steps: [
      { at: 0, label: 'DRAIN-001 = 42 %', run: ({ sim }) => sim.setDrainLevel('DRAIN-001', 42) },
      { at: 10, label: 'DRAIN-001 = 71 %', run: ({ sim }) => sim.setDrainLevel('DRAIN-001', 71) },
      {
        at: 20,
        label: 'DRAIN-001 = 88 % (ALERTA)',
        run: ({ sim }) => sim.setDrainLevel('DRAIN-001', 88),
      },
    ],
  },
  {
    id: 3,
    name: 'Cámara Ray-Ban Meta detecta incidencia',
    description:
      'CAM-001 detecta un obstáculo en Álvaro Obregón y Orizaba; aparece como incidencia en vivo.',
    steps: [
      {
        at: 0,
        label: 'CAM-001 detecta OBSTACLE (0.91)',
        run: ({ sim }) => sim.emitCamera('CAM-001', 'OBSTACLE', 0.91),
      },
    ],
  },
  {
    id: 4,
    name: 'Riesgo combinado',
    description:
      'DRAIN-001 al 88 % + lluvia en Roma Norte + CAM-001 detecta agua: ALERTA → RIESGO ALTO → RIESGO CRÍTICO.',
    steps: [
      { at: 0, label: 'DRAIN-001 = 88 %', run: ({ sim }) => sim.setDrainLevel('DRAIN-001', 88) },
      {
        at: 8,
        label: 'Lluvia en ZONE-001 (22 mm/h)',
        run: ({ sim }) => sim.setWeather(true, 'ZONE-001', 22),
      },
      {
        at: 16,
        label: 'CAM-001 detecta WATER_ACCUMULATION (0.92)',
        run: ({ sim }) => sim.emitCamera('CAM-001', 'WATER_ACCUMULATION', 0.92),
      },
    ],
  },
  {
    id: 5,
    name: 'Accesibilidad: ruta alternativa con rampa',
    description:
      'CAM-001 detecta un bloqueo de accesibilidad en Álvaro Obregón y Orizaba. En la vista Accesibilidad, la ruta Orizaba y Colima → Álvaro Obregón y Mérida se recalcula sola y usa la rampa de Córdoba.',
    steps: [
      {
        at: 0,
        label: 'CAM-001 detecta ACCESSIBILITY_BLOCK (0.90)',
        run: ({ sim }) => sim.emitCamera('CAM-001', 'ACCESSIBILITY_BLOCK', 0.9),
      },
    ],
  },
  {
    id: 6,
    name: 'Pérdida de conectividad y recuperación',
    description:
      'Internet OFF 100 s mientras DRAIN-001 sube. El gateway guarda en SQLite, los dispositivos pasan a OFFLINE y al volver todo se sincroniza sin pérdidas.',
    steps: [
      { at: 0, label: 'Internet OFF 100 s', run: (env) => void internetOutage(env, 100) },
      {
        at: 20,
        label: 'DRAIN-001 = 55 % (sin conexión)',
        run: ({ sim }) => sim.setDrainLevel('DRAIN-001', 55),
      },
      {
        at: 45,
        label: 'DRAIN-001 = 70 % (sin conexión)',
        run: ({ sim }) => sim.setDrainLevel('DRAIN-001', 70),
      },
      {
        at: 70,
        label: 'DRAIN-001 = 84 % (sin conexión)',
        run: ({ sim }) => sim.setDrainLevel('DRAIN-001', 84),
      },
      { at: 100, label: 'Internet ON y sincronización', run: () => undefined },
    ],
  },
];

export class ScenarioRunner {
  private timers: NodeJS.Timeout[] = [];
  private status: ScenarioStatus | null = null;

  constructor(private readonly env: ScenarioEnv) {}

  current(): ScenarioStatus | null {
    return this.status;
  }

  run(id: number): ScenarioStatus {
    const def = SCENARIOS.find((s) => s.id === id);
    if (!def) throw new Error(`Escenario inexistente: ${id}`);
    this.cancel();

    const status: ScenarioStatus = {
      id: def.id,
      name: def.name,
      startedAt: new Date().toISOString(),
      steps: def.steps.map((s) => ({ at: s.at, label: s.label, done: false })),
      finished: false,
    };
    this.status = status;
    this.env.sim.record(`Escenario ${def.id}: ${def.name}`);

    def.steps.forEach((step, i) => {
      this.timers.push(
        setTimeout(() => {
          step.run(this.env);
          const s = status.steps[i];
          if (s) s.done = true;
          status.finished = status.steps.every((x) => x.done);
        }, step.at * 1000),
      );
    });
    return status;
  }

  /** Stops pending steps (already-applied state stays until reset). */
  cancel(): void {
    for (const t of this.timers) clearTimeout(t);
    this.timers = [];
    if (this.status && !this.status.finished)
      this.env.sim.record(`Escenario ${this.status.id} cancelado`);
    this.status = null;
  }
}
