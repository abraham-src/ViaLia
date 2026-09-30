/**
 * ViaLia · modelo de intersección de cuatro accesos (memoria, secciones 5, 9 y 14.1).
 *
 * Modelo de colas por acceso con llegadas de Poisson y descarga a flujo de saturación.
 * El controlador adaptativo usa una función de puntuación explicable (cola, espera,
 * peatones, incidentes y riesgo hídrico) y SIEMPRE respeta las reglas duras:
 * verde mínimo y máximo, amarillo fijo, todo en rojo, fase peatonal con espera máxima
 * y modo seguro (plan fijo) si la IA deja de reportar. La IA no sustituye al controlador.
 *
 * Es código puro (sin React ni red) para poder probarlo y correr la prueba
 * "ciclo fijo vs adaptativo" cientos de veces en milisegundos.
 */

export type Approach = 'N' | 'S' | 'E' | 'W';
export type Axis = 'NS' | 'EW';
export type Mode = 'adaptive' | 'fixed';
export type PhaseKind = 'green' | 'yellow' | 'allred' | 'walk' | 'flash';

export const APPROACHES: readonly Approach[] = ['N', 'S', 'E', 'W'];
export const AXIS_OF: Record<Approach, Axis> = { N: 'NS', S: 'NS', E: 'EW', W: 'EW' };
export const AXIS_APPROACHES: Record<Axis, readonly Approach[]> = {
  NS: ['N', 'S'],
  EW: ['E', 'W'],
};
export const AXIS_LABEL: Record<Axis, string> = { NS: 'Norte–Sur', EW: 'Oriente–Poniente' };
export const APPROACH_LABEL: Record<Approach, string> = {
  N: 'Norte',
  S: 'Sur',
  E: 'Oriente',
  W: 'Poniente',
};
const other = (a: Axis): Axis => (a === 'NS' ? 'EW' : 'NS');

/** Reglas duras (segundos). Iguales para ambos modos. */
export const LIMITS = {
  minGreen: 10,
  maxGreen: 60,
  yellow: 3,
  allRed: 2,
  walk: 9,
  flash: 5,
  pedMaxWait: 60,
  /** Umbral a partir del cual el adaptativo corta el verde para servir a peatones. */
  pedUrgentWait: 50,
  pedUrgentCount: 10,
  /** Si ya hay cambio de fase, se aprovecha para dar paso peatonal a quien lleve esto esperando. */
  pedPiggybackWait: 25,
  /** Flujo de saturación: 1 vehículo cada 2 s por acceso (1 800 veh/h). */
  headway: 2,
  startupLost: 1.5,
  /** Plan fijo de respaldo y de comparación. */
  fixedGreen: 28,
} as const;

export interface Demand {
  /** Vehículos por minuto en cada acceso. */
  rates: Record<Approach, number>;
  /** Peatones por minuto que piden cruzar. */
  pedRate: number;
}

export interface Flag {
  weight: number;
  reason: string;
}

export interface Decision {
  t: number;
  kind: 'extend' | 'switch' | 'max' | 'ped' | 'failsafe' | 'flag' | 'mode' | 'gap';
  text: string;
}

export interface Metrics {
  vehWait: number;
  vehServed: number;
  maxQueue: number;
  pedWait: number;
  pedServed: number;
  switches: number;
}

export interface SimState {
  t: number;
  mode: Mode;
  aiOnline: boolean;
  phase: { kind: PhaseKind; axis: Axis; elapsed: number };
  /** Eje que recibe el siguiente verde. */
  nextAxis: Axis;
  pedPending: boolean;
  /** Tiempos de llegada de los vehículos en cola, por acceso. */
  queue: Record<Approach, number[]>;
  served: Record<Approach, number>;
  lastDeparture: Record<Approach, number>;
  greenStart: number;
  peds: number[];
  metrics: Metrics;
  decisions: Decision[];
  flags: Record<Approach, Flag | null>;
  /** Para registrar "extender" una sola vez por verde. */
  extendedLogged: boolean;
  rng: () => number;
}

/** Generador determinista (mulberry32): mismo tráfico para ambos modos en la comparación. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function poisson(lambda: number, rng: () => number): number {
  if (lambda <= 0) return 0;
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= rng();
  } while (p > l && k < 50);
  return k - 1;
}

const perApproach = <T>(f: (a: Approach) => T): Record<Approach, T> => ({
  N: f('N'),
  S: f('S'),
  E: f('E'),
  W: f('W'),
});

export function createSim(opts: { mode?: Mode; seed?: number; aiOnline?: boolean } = {}): SimState {
  return {
    t: 0,
    mode: opts.mode ?? 'adaptive',
    aiOnline: opts.aiOnline ?? true,
    phase: { kind: 'green', axis: 'NS', elapsed: 0 },
    nextAxis: 'EW',
    pedPending: false,
    queue: perApproach(() => []),
    served: perApproach(() => 0),
    lastDeparture: perApproach(() => -Infinity),
    greenStart: 0,
    peds: [],
    metrics: { vehWait: 0, vehServed: 0, maxQueue: 0, pedWait: 0, pedServed: 0, switches: 0 },
    decisions: [],
    flags: perApproach(() => null),
    extendedLogged: false,
    rng: mulberry32(opts.seed ?? 7),
  };
}

/** Sin IA o en modo fijo se usa el plan preconfigurado (modo seguro). */
export const usesFixedPlan = (s: SimState): boolean => s.mode === 'fixed' || !s.aiOnline;

function log(s: SimState, kind: Decision['kind'], text: string): void {
  s.decisions.unshift({ t: s.t, kind, text });
  if (s.decisions.length > 40) s.decisions.length = 40;
}

export const queueLen = (s: SimState, a: Approach): number => s.queue[a].length;

export function maxWait(s: SimState, a: Approach): number {
  const first = s.queue[a][0];
  return first === undefined ? 0 : s.t - first;
}

/** Presión de un acceso: cola + espera de la cabeza, ponderada por penalizaciones. */
export function pressure(s: SimState, a: Approach): number {
  const w = s.flags[a]?.weight ?? 1;
  return w * (queueLen(s, a) + maxWait(s, a) / 10);
}

export const axisPressure = (s: SimState, axis: Axis): number =>
  AXIS_APPROACHES[axis].reduce((acc, a) => acc + pressure(s, a), 0);

const axisQueue = (s: SimState, axis: Axis): number =>
  AXIS_APPROACHES[axis].reduce((acc, a) => acc + queueLen(s, a), 0);

const pedOldest = (s: SimState): number => {
  const first = s.peds[0];
  return first === undefined ? 0 : s.t - first;
};

function endGreen(s: SimState, reason: Decision['kind'], text: string, withPed: boolean): void {
  s.phase = { kind: 'yellow', axis: s.phase.axis, elapsed: 0 };
  s.nextAxis = other(s.phase.axis);
  s.pedPending = withPed;
  s.metrics.switches++;
  log(s, reason, text);
}

function decideAdaptive(s: SimState): void {
  const { axis, elapsed } = s.phase;
  const cur = axisPressure(s, axis);
  const opp = axisPressure(s, other(axis));
  const pedWait = pedOldest(s);
  const f = (n: number) => n.toFixed(1);

  if (elapsed >= LIMITS.maxGreen) {
    endGreen(
      s,
      'max',
      `Verde máximo (${LIMITS.maxGreen} s) en ${AXIS_LABEL[axis]}: cambio obligatorio`,
      pedWait > 0,
    );
    return;
  }
  if (elapsed < LIMITS.minGreen) return;

  const pedUrgent =
    s.peds.length > 0 &&
    (pedWait >= LIMITS.pedUrgentWait || s.peds.length >= LIMITS.pedUrgentCount);
  if (pedUrgent) {
    endGreen(
      s,
      'ped',
      `Fase peatonal: ${s.peds.length} ${s.peds.length === 1 ? 'persona' : 'personas'} esperando, ${Math.round(pedWait)} s máx.`,
      true,
    );
    return;
  }
  const piggyback = s.peds.length > 0 && pedWait >= LIMITS.pedPiggybackWait;
  if (axisQueue(s, axis) === 0 && axisQueue(s, other(axis)) > 0) {
    endGreen(
      s,
      'gap',
      `${AXIS_LABEL[axis]} sin cola: verde a ${AXIS_LABEL[other(axis)]}`,
      piggyback,
    );
    return;
  }
  // Verde "eficiente": antes de 20 s solo se corta si la diferencia es muy grande, porque
  // cada cambio cuesta amarillo + todo en rojo + arranque (≈ 6.5 s sin servir a nadie).
  // Con ambos ejes saturados, lo eficiente son verdes largos (menos cambios, menos tiempo perdido).
  const saturated = axisQueue(s, axis) >= 8 && axisQueue(s, other(axis)) >= 8;
  const threshold =
    saturated && elapsed < 45 ? Infinity : elapsed < 20 ? cur * 3 + 6 : cur * 1.4 + 2;
  if (opp > threshold) {
    endGreen(
      s,
      'switch',
      `Cambio a ${AXIS_LABEL[other(axis)]}: presión ${f(opp)} contra ${f(cur)}`,
      piggyback,
    );
    return;
  }
  if (!s.extendedLogged && axisQueue(s, axis) > 0) {
    s.extendedLogged = true;
    const [a, b] = AXIS_APPROACHES[axis];
    const waitMax = Math.max(maxWait(s, a as Approach), maxWait(s, b as Approach));
    log(
      s,
      'extend',
      `Extender verde ${AXIS_LABEL[axis]}: cola ${axisQueue(s, axis)} contra ${axisQueue(s, other(axis))}, espera máx. ${Math.round(waitMax)} s (límite ${LIMITS.maxGreen} s)`,
    );
  }
}

function decideFixed(s: SimState): void {
  if (s.phase.elapsed < LIMITS.fixedGreen) return;
  // Plan fijo: N–S → O–P → fase peatonal → N–S …
  const withPed = s.phase.axis === 'EW';
  s.phase = { kind: 'yellow', axis: s.phase.axis, elapsed: 0 };
  s.nextAxis = other(s.phase.axis);
  s.pedPending = withPed;
  s.metrics.switches++;
}

function startGreen(s: SimState, axis: Axis): void {
  s.phase = { kind: 'green', axis, elapsed: 0 };
  s.greenStart = s.t;
  s.extendedLogged = false;
}

/** Avanza la simulación `dt` segundos. */
export function step(s: SimState, dt: number, demand: Demand): void {
  s.t += dt;
  const { rng } = s;

  // Llegadas (el consumo del generador no depende del modo: mismo tráfico en ambos).
  for (const a of APPROACHES) {
    const n = poisson((demand.rates[a] / 60) * dt, rng);
    for (let i = 0; i < n; i++) s.queue[a].push(s.t - rng() * dt);
  }
  const np = poisson((demand.pedRate / 60) * dt, rng);
  for (let i = 0; i < np; i++) s.peds.push(s.t - rng() * dt);

  const ph = s.phase;
  ph.elapsed += dt;

  // Descarga en verde a flujo de saturación.
  if (ph.kind === 'green' && s.t - s.greenStart >= LIMITS.startupLost) {
    for (const a of AXIS_APPROACHES[ph.axis]) {
      const head = s.queue[a][0];
      if (head !== undefined && s.t - s.lastDeparture[a] >= LIMITS.headway) {
        s.queue[a].shift();
        s.metrics.vehWait += Math.max(0, s.t - head);
        s.metrics.vehServed++;
        s.served[a]++;
        s.lastDeparture[a] = s.t;
      }
    }
  }

  // Cruce peatonal: todos los que esperan cruzan al abrir la fase (y los que llegan durante ella).
  if (ph.kind === 'walk' && s.peds.length) {
    for (const p of s.peds) s.metrics.pedWait += Math.max(0, s.t - p);
    s.metrics.pedServed += s.peds.length;
    s.peds = [];
  }

  let q = 0;
  for (const a of APPROACHES) q = Math.max(q, s.queue[a].length);
  s.metrics.maxQueue = Math.max(s.metrics.maxQueue, q);

  switch (ph.kind) {
    case 'green':
      if (usesFixedPlan(s)) decideFixed(s);
      else decideAdaptive(s);
      break;
    case 'yellow':
      if (ph.elapsed >= LIMITS.yellow) s.phase = { kind: 'allred', axis: ph.axis, elapsed: 0 };
      break;
    case 'allred':
      if (ph.elapsed >= LIMITS.allRed) {
        if (s.pedPending) {
          s.pedPending = false;
          s.phase = { kind: 'walk', axis: ph.axis, elapsed: 0 };
        } else {
          startGreen(s, s.nextAxis);
        }
      }
      break;
    case 'walk':
      if (ph.elapsed >= LIMITS.walk) s.phase = { kind: 'flash', axis: ph.axis, elapsed: 0 };
      break;
    case 'flash':
      if (ph.elapsed >= LIMITS.flash) s.phase = { kind: 'allred', axis: ph.axis, elapsed: 0 };
      break;
  }
}

export function setMode(s: SimState, mode: Mode): void {
  if (s.mode === mode) return;
  s.mode = mode;
  log(
    s,
    'mode',
    mode === 'adaptive' ? 'Control adaptativo activado' : 'Ciclo fijo activado (plan base)',
  );
}

export function setAiOnline(s: SimState, online: boolean): void {
  if (s.aiOnline === online) return;
  s.aiOnline = online;
  log(
    s,
    'failsafe',
    online
      ? 'IA de conteo de nuevo en línea: se reanuda el control adaptativo'
      : `IA sin datos: modo seguro con plan fijo (${LIMITS.fixedGreen} s por fase)`,
  );
}

/** Aplica penalizaciones (incidentes, riesgo hídrico) y registra solo los cambios. */
export function setFlags(s: SimState, flags: Record<Approach, Flag | null>): void {
  for (const a of APPROACHES) {
    const prev = s.flags[a];
    const next = flags[a];
    if (prev?.reason === next?.reason && prev?.weight === next?.weight) continue;
    s.flags[a] = next;
    if (next) log(s, 'flag', `${next.reason} · menor prioridad al acceso ${APPROACH_LABEL[a]}`);
    else if (prev) log(s, 'flag', `Se retira la restricción del acceso ${APPROACH_LABEL[a]}`);
  }
}

/** Qué ve cada acceso en este instante. */
export function lampFor(s: SimState, a: Approach): 'red' | 'yellow' | 'green' {
  const { kind, axis } = s.phase;
  if (AXIS_OF[a] !== axis) return 'red';
  if (kind === 'green') return 'green';
  if (kind === 'yellow') return 'yellow';
  return 'red';
}

export function pedSignal(s: SimState): 'walk' | 'flash' | 'dont' {
  if (s.phase.kind === 'walk') return 'walk';
  if (s.phase.kind === 'flash') return 'flash';
  return 'dont';
}

/** Semáforo con plan fijo por reloj (TL-002 en el mapa). */
export function fixedLampAt(seconds: number, offset = 0): 'red' | 'yellow' | 'green' {
  const cycle = 2 * (LIMITS.fixedGreen + LIMITS.yellow + LIMITS.allRed);
  const t = (((seconds + offset) % cycle) + cycle) % cycle;
  if (t < LIMITS.fixedGreen) return 'green';
  if (t < LIMITS.fixedGreen + LIMITS.yellow) return 'yellow';
  return 'red';
}

// ───────────────────── Prueba 14.1: ciclo fijo vs adaptativo ─────────────────────

export interface RunResult {
  avgWait: number;
  maxQueue: number;
  served: number;
  avgPedWait: number;
}

/** Corre `seconds` segundos simulados. La espera incluye a quien sigue en cola al final. */
export function runHeadless(
  mode: Mode,
  demand: Demand,
  seed: number,
  seconds = 900,
  dt = 0.5,
  flags?: Record<Approach, Flag | null>,
): RunResult {
  const s = createSim({ mode, seed });
  if (flags) s.flags = { ...flags };
  const steps = Math.round(seconds / dt);
  for (let i = 0; i < steps; i++) step(s, dt, demand);
  let residual = 0;
  let residualN = 0;
  for (const a of APPROACHES) {
    for (const t0 of s.queue[a]) {
      residual += s.t - t0;
      residualN++;
    }
  }
  let pedResidual = 0;
  for (const p of s.peds) pedResidual += s.t - p;
  const n = s.metrics.vehServed + residualN;
  const pn = s.metrics.pedServed + s.peds.length;
  return {
    avgWait: n ? (s.metrics.vehWait + residual) / n : 0,
    maxQueue: s.metrics.maxQueue,
    served: s.metrics.vehServed,
    avgPedWait: pn ? (s.metrics.pedWait + pedResidual) / pn : 0,
  };
}

export interface Stat {
  mean: number;
  sd: number;
}

export interface Comparison {
  reps: number;
  seconds: number;
  fixed: Record<keyof RunResult, Stat>;
  adaptive: Record<keyof RunResult, Stat>;
  /** Cambio relativo de la espera promedio (negativo = mejora del adaptativo). */
  waitChange: number;
}

function stats(values: number[]): Stat {
  const mean = values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);
  const variance =
    values.length > 1 ? values.reduce((a, b) => a + (b - mean) ** 2, 0) / (values.length - 1) : 0;
  return { mean, sd: Math.sqrt(variance) };
}

const KEYS: ReadonlyArray<keyof RunResult> = ['avgWait', 'maxQueue', 'served', 'avgPedWait'];

export function compareModes(demand: Demand, reps = 10, seconds = 900): Comparison {
  const runs: Record<Mode, RunResult[]> = { fixed: [], adaptive: [] };
  for (let r = 1; r <= reps; r++) {
    runs.fixed.push(runHeadless('fixed', demand, r * 7919, seconds));
    runs.adaptive.push(runHeadless('adaptive', demand, r * 7919, seconds));
  }
  const agg = (mode: Mode) =>
    Object.fromEntries(KEYS.map((k) => [k, stats(runs[mode].map((x) => x[k]))])) as Record<
      keyof RunResult,
      Stat
    >;
  const fixed = agg('fixed');
  const adaptive = agg('adaptive');
  return {
    reps,
    seconds,
    fixed,
    adaptive,
    waitChange: fixed.avgWait.mean ? adaptive.avgWait.mean / fixed.avgWait.mean - 1 : 0,
  };
}

// ───────────────────── Escenarios de demanda ─────────────────────

export type ScenarioKey = 'normal' | 'peakNorth' | 'pedestrians' | 'heavy';

export const SCENARIOS: Record<ScenarioKey, { label: string; hint: string; demand: Demand }> = {
  normal: {
    label: 'Tráfico moderado',
    hint: 'Caso base de la demo',
    demand: { rates: { N: 8, S: 7, E: 5, W: 6 }, pedRate: 2 },
  },
  peakNorth: {
    label: 'Hora pico en Norte',
    hint: 'Caso A: demanda desigual',
    demand: { rates: { N: 15, S: 7, E: 4, W: 5 }, pedRate: 2 },
  },
  pedestrians: {
    label: 'Muchos peatones',
    hint: 'Caso B: fase peatonal segura',
    demand: { rates: { N: 7, S: 6, E: 5, W: 5 }, pedRate: 9 },
  },
  heavy: {
    label: 'Carga alta pareja',
    hint: 'Todos los accesos cargados',
    demand: { rates: { N: 12, S: 11, E: 10, W: 11 }, pedRate: 3 },
  },
};
