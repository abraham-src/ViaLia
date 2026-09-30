import {
  Check,
  Cpu,
  FlaskConical,
  Gauge,
  History,
  Play,
  RotateCcw,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { TopActions } from '../components/TopActions';
import { ComparisonBars, ComparisonTable, Legend, SERIES } from '../components/charts';
import { Button, Card, Meter, Note, PageHeader, Pill, Segmented, Toggle } from '../components/ui';
import { useCxData } from '../data/useCxData';
import { IntersectionMap } from '../map/IntersectionMap';
import { INTERSECTION_CENTER } from '../sim/geometry';
import {
  APPROACHES,
  APPROACH_LABEL,
  AXIS_LABEL,
  LIMITS,
  SCENARIOS,
  compareModes,
  maxWait,
  queueLen,
  usesFixedPlan,
  type Comparison,
  type Decision,
  type ScenarioKey,
} from '../sim/intersection';
import {
  LIVE_SCENARIO,
  MAIN_LIGHT,
  currentDemand,
  useSignal,
  type SignalScenario,
} from '../sim/store';

const PHASE_TEXT = {
  green: 'Verde',
  yellow: 'Amarillo',
  allred: 'Todo en rojo',
  walk: 'Cruce peatonal',
  flash: 'Peatones: despejar',
} as const;

const DECISION_COLOR: Record<Decision['kind'], string> = {
  extend: '#2563eb',
  switch: '#0ea5e9',
  gap: '#0ea5e9',
  max: '#f5812a',
  ped: '#a855f7',
  failsafe: '#e5484d',
  flag: '#f5812a',
  mode: '#64748b',
};

function DemandCard() {
  const sim = useSignal((s) => s.sim);
  useSignal((s) => s.v);
  const max = Math.max(8, ...APPROACHES.map((a) => queueLen(sim, a)));
  return (
    <Card
      title="Demanda detectada"
      icon={Cpu}
      action={<Pill color="#0f766e">Conteo por zonas</Pill>}
    >
      <ul className="flex flex-col gap-2.5">
        {APPROACHES.map((a) => {
          const q = queueLen(sim, a);
          const flag = sim.flags[a];
          return (
            <li key={a}>
              <div className="flex items-baseline gap-2">
                <span className="w-20 text-[13.5px] font-semibold text-cx-ink">
                  {APPROACH_LABEL[a]}
                </span>
                <span className="text-[20px] font-extrabold leading-none text-cx-ink">{q}</span>
                <span className="text-[12px] text-cx-ink3">
                  veh. · espera máx. {Math.round(maxWait(sim, a))} s
                </span>
              </div>
              <div className="mt-1.5">
                <Meter value={(q / max) * 100} color={flag ? '#f5812a' : '#2563eb'} height={7} />
              </div>
              {flag && (
                <div className="mt-1 text-[11.5px] font-medium text-[#b85a10]">{flag.reason}</div>
              )}
            </li>
          );
        })}
        <li className="mt-1 flex items-center gap-2 border-t border-cx-line2 pt-2.5">
          <Users size={16} className="text-[#a855f7]" />
          <span className="text-[13.5px] font-semibold text-cx-ink">Peatones esperando</span>
          <span className="ml-auto text-[18px] font-extrabold text-cx-ink">{sim.peds.length}</span>
        </li>
      </ul>
    </Card>
  );
}

function SafetyCard() {
  const sim = useSignal((s) => s.sim);
  useSignal((s) => s.v);
  const { phase } = sim;
  const fixed = usesFixedPlan(sim);
  const limit = fixed ? LIMITS.fixedGreen : LIMITS.maxGreen;
  const oldestPed = sim.peds[0] === undefined ? 0 : sim.t - sim.peds[0];
  const checks = [
    { ok: true, text: `Verde mínimo ${LIMITS.minGreen} s y máximo ${LIMITS.maxGreen} s` },
    { ok: true, text: `Amarillo fijo ${LIMITS.yellow} s + todo en rojo ${LIMITS.allRed} s` },
    { ok: true, text: 'Fases incompatibles nunca en verde a la vez' },
    {
      ok: oldestPed <= LIMITS.pedMaxWait,
      text: `Peatón espera ≤ ${LIMITS.pedMaxWait} s (ahora ${Math.round(oldestPed)} s)`,
    },
    {
      ok: true,
      text: sim.aiOnline ? 'IA en línea: control adaptativo' : 'IA caída: plan fijo seguro',
    },
  ];
  const lampColor =
    phase.kind === 'green'
      ? '#22c55e'
      : phase.kind === 'yellow'
        ? '#f5b400'
        : phase.kind === 'walk'
          ? '#a855f7'
          : '#ef4444';
  return (
    <Card title="Decisión segura" icon={ShieldCheck}>
      <div className="flex items-center gap-3 rounded-[14px] bg-cx-line2 px-3.5 py-3">
        <span
          className="size-3.5 rounded-full"
          style={{ background: lampColor, boxShadow: `0 0 10px ${lampColor}` }}
        />
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-bold text-cx-ink">
            {PHASE_TEXT[phase.kind]}
            {phase.kind === 'green' || phase.kind === 'yellow' ? ` ${AXIS_LABEL[phase.axis]}` : ''}
          </div>
          <div className="text-[12px] text-cx-ink3">
            {phase.kind === 'green'
              ? `${Math.floor(phase.elapsed)} s de ${limit} s máx.`
              : `${Math.floor(phase.elapsed)} s`}
            {' · '}
            {fixed ? 'plan fijo' : 'adaptativo'}
          </div>
        </div>
      </div>
      {phase.kind === 'green' && (
        <div className="mt-2">
          <Meter
            value={(phase.elapsed / limit) * 100}
            color={phase.elapsed < LIMITS.minGreen ? '#94a3b8' : '#22c55e'}
            height={6}
          />
        </div>
      )}
      <ul className="mt-3 flex flex-col gap-1.5">
        {checks.map((c) => (
          <li key={c.text} className="flex items-start gap-2 text-[12.5px] text-cx-ink2">
            <span
              className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${c.ok ? 'bg-cx-ok' : 'bg-cx-critical'} text-white`}
            >
              <Check size={10} strokeWidth={3.5} />
            </span>
            {c.text}
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ScenarioCard() {
  const scenario = useSignal((s) => s.scenario);
  const setScenario = useSignal((s) => s.setScenario);
  const speed = useSignal((s) => s.speed);
  const setSpeed = useSignal((s) => s.setSpeed);
  const reset = useSignal((s) => s.reset);
  const liveDemand = useSignal((s) => s.liveDemand);
  const demand = currentDemand({ scenario, liveDemand });
  const options: Array<{ key: SignalScenario; label: string; hint: string }> = [
    { key: 'live', ...LIVE_SCENARIO },
    ...(Object.keys(SCENARIOS) as ScenarioKey[]).map((k) => ({ key: k, ...SCENARIOS[k] })),
  ];
  return (
    <Card
      title="Escenario de tráfico"
      icon={Play}
      action={
        <Segmented
          size="sm"
          value={String(speed)}
          onChange={(v) => setSpeed(Number(v))}
          options={[
            { value: '1', label: '1×' },
            { value: '4', label: '4×' },
          ]}
        />
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {options.map(({ key: k, label, hint }) => (
          <button
            key={k}
            type="button"
            onClick={() => setScenario(k)}
            aria-pressed={scenario === k}
            className={`rounded-[12px] border px-3 py-2 text-left transition ${
              scenario === k
                ? 'border-cx-blue bg-cx-bluesoft'
                : 'border-cx-line bg-white hover:border-cx-blue/40'
            }`}
          >
            <span
              className={`block text-[13px] font-bold ${scenario === k ? 'text-cx-blue' : 'text-cx-ink'}`}
            >
              {label}
            </span>
            <span className="block text-[11.5px] text-cx-ink3">{hint}</span>
          </button>
        ))}
      </div>
      <p className="mt-3 text-[12px] text-cx-ink3">
        Llegadas por minuto: N {demand.rates.N} · S {demand.rates.S} · O {demand.rates.E} · P{' '}
        {demand.rates.W} · peatones {demand.pedRate}
        {scenario === 'live' && !liveDemand && (
          <span className="block text-[#b45309]">
            Sin tráfico del simulador en esta zona: se usa el caso base.
          </span>
        )}
      </p>
      <button
        type="button"
        onClick={reset}
        className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-cx-ink2 hover:text-cx-blue"
      >
        <RotateCcw size={14} /> Reiniciar colas
      </button>
    </Card>
  );
}

function DecisionLog() {
  const sim = useSignal((s) => s.sim);
  useSignal((s) => s.v);
  return (
    <Card title="Bitácora de decisiones" icon={History}>
      {sim.decisions.length === 0 ? (
        <p className="text-[13px] text-cx-ink3">
          Las decisiones aparecerán en cuanto termine el primer verde mínimo.
        </p>
      ) : (
        <ol className="flex flex-col gap-2">
          {sim.decisions.slice(0, 7).map((d, i) => (
            <li key={`${d.t}-${i}`} className="flex gap-2.5">
              <span
                className="mt-1.5 size-2 shrink-0 rounded-full"
                style={{ background: DECISION_COLOR[d.kind] }}
              />
              <div className="min-w-0 flex-1 text-[12.5px] leading-snug text-cx-ink2">{d.text}</div>
              <span className="shrink-0 text-[11px] text-cx-ink3">t+{Math.round(d.t)} s</span>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

function ComparisonCard() {
  const scenario = useSignal((s) => s.scenario);
  const hasLive = useSignal((s) => s.liveDemand !== null);
  const [runs, setRuns] = useState(0);
  // Con tráfico en vivo se toma una foto de la demanda: la prueba no se recalcula cada 3 s,
  // solo al cambiar de escenario, al llegar los primeros datos o con "Volver a correr".
  const result: Comparison = useMemo(() => {
    void runs;
    void hasLive;
    void scenario;
    return compareModes(currentDemand(useSignal.getState()), 10, 900);
  }, [scenario, runs, hasLive]);
  const scenarioLabel = scenario === 'live' ? LIVE_SCENARIO.label : SCENARIOS[scenario].label;
  const change = Math.round(result.waitChange * 100);
  const better = change < 0;
  return (
    <Card
      title="Prueba 14.1 · ciclo fijo contra adaptativo"
      icon={FlaskConical}
      action={
        <Button
          variant="ghost"
          className="!py-1.5"
          icon={RotateCcw}
          onClick={() => setRuns((r) => r + 1)}
        >
          Volver a correr
        </Button>
      }
    >
      <div className="grid grid-cols-[250px_minmax(0,1fr)] gap-7">
        <div>
          <div className="text-[12.5px] font-medium text-cx-ink3">Espera promedio por vehículo</div>
          <div
            className={`mt-1 text-[48px] font-extrabold leading-none tracking-tight ${better ? 'text-cx-ok' : 'text-cx-critical'}`}
          >
            {change > 0 ? '+' : ''}
            {change} %
          </div>
          <p className="mt-2 text-[13px] text-cx-ink2">
            {better ? 'Menos espera' : 'Más espera'} con control adaptativo en “
            {scenarioLabel.toLowerCase()}”, mismo tráfico para los dos modos.
          </p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <div className="rounded-[12px] bg-cx-line2 px-3 py-2">
              <div className="text-[11.5px] text-cx-ink3">Corridas</div>
              <div className="text-[17px] font-bold text-cx-ink">{result.reps} × 2</div>
            </div>
            <div className="rounded-[12px] bg-cx-line2 px-3 py-2">
              <div className="text-[11.5px] text-cx-ink3">Duración</div>
              <div className="text-[17px] font-bold text-cx-ink">{result.seconds / 60} min</div>
            </div>
          </div>
          <Note className="mt-3">
            Resultado de simulación en el navegador (modelo de colas), no una medición de campo. En
            la maqueta física se repite la misma prueba con los conteos reales.
          </Note>
        </div>
        <div className="min-w-0">
          <Legend items={[SERIES.fixed, SERIES.adaptive]} />
          <div className="mt-3">
            <ComparisonBars result={result} />
          </div>
          <details className="mt-2 text-[12.5px]">
            <summary className="cursor-pointer font-semibold text-cx-blue">Ver tabla</summary>
            <div className="mt-2">
              <ComparisonTable result={result} />
            </div>
          </details>
        </div>
      </div>
    </Card>
  );
}

export function IntersectionPage() {
  const data = useCxData();
  const sim = useSignal((s) => s.sim);
  useSignal((s) => s.v);
  const setMode = useSignal((s) => s.setMode);
  const setAi = useSignal((s) => s.setAi);
  const light = data.byCode.get(MAIN_LIGHT);
  const fixed = usesFixedPlan(sim);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Intersección inteligente"
        subtitle={`${MAIN_LIGHT} · ${light?.name.replace(/^Semáforo\s+/, '') ?? 'Insurgentes y Álvaro Obregón'} · la IA propone, las reglas de seguridad deciden`}
      >
        <Segmented
          value={sim.mode}
          onChange={setMode}
          options={[
            { value: 'adaptive', label: 'Adaptativo' },
            { value: 'fixed', label: 'Ciclo fijo' },
          ]}
        />
        <TopActions search={false} />
      </PageHeader>

      <div className="grid grid-cols-[minmax(0,1fr)_360px] items-start gap-5 px-7 pb-8">
        <div className="flex min-w-0 flex-col gap-5">
          <section className="relative overflow-hidden rounded-[22px] border border-cx-line bg-[#e3e8ef] shadow-cx">
            <IntersectionMap
              center={INTERSECTION_CENTER}
              className="h-[calc(100vh-150px)] min-h-[560px] w-full"
            />
            <div className="absolute left-4 top-4 flex flex-col gap-2">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/95 px-3 py-1.5 text-[12.5px] font-bold text-cx-ink shadow-cx">
                <Gauge size={15} className="text-cx-blue" />
                {fixed ? 'Plan fijo' : 'Adaptativo'} · {PHASE_TEXT[sim.phase.kind]}
                {sim.phase.kind === 'green' ? ` ${AXIS_LABEL[sim.phase.axis]}` : ''}
              </span>
            </div>
            <div className="absolute left-4 top-16 w-[250px] rounded-[16px] border border-white/70 bg-white/95 p-3 shadow-cx-lg backdrop-blur">
              <Toggle
                checked={sim.aiOnline}
                onChange={setAi}
                label="IA de conteo en línea"
                hint={sim.aiOnline ? 'Apágala para ver el modo seguro' : 'Modo seguro: plan fijo'}
              />
            </div>
          </section>
          <ComparisonCard />
        </div>

        <div className="flex flex-col gap-4">
          <DemandCard />
          <SafetyCard />
          <ScenarioCard />
          <DecisionLog />
        </div>
      </div>
    </div>
  );
}
