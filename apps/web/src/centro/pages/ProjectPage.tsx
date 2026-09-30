import {
  ArrowRight,
  BookOpenCheck,
  Boxes,
  CircleCheck,
  CircleDashed,
  CircleDot,
  Cpu,
  Database,
  Droplets,
  Globe,
  HardHat,
  MonitorPlay,
  Radio,
  Server,
  Sparkles,
  Video,
  Workflow,
} from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useRules } from '../../hooks/admin';
import { BRAND } from '../brand';
import { TrafficLightIcon, type IconType } from '../components/icons';
import { TopActions } from '../components/TopActions';
import { Card, PageHeader, Pill } from '../components/ui';
import { useCxData } from '../data/useCxData';
import {
  ActArt,
  PerceiveArt,
  PredictArt,
  ResolveArt,
  UnderstandArt,
} from '../illustrations/CycleArt';
import { LEVEL_COLOR, LEVEL_LABEL } from '../risk/model';
import { usePrediction } from '../risk/usePrediction';
import { AXIS_LABEL, usesFixedPlan } from '../sim/intersection';
import { MAIN_LIGHT, useSignal } from '../sim/store';

type Status = 'real' | 'sim' | 'pending';

const STATUS: Record<Status, { label: string; color: string; icon: IconType }> = {
  real: { label: 'Funciona con la API', color: '#1fa464', icon: CircleCheck },
  sim: { label: 'Simulado', color: '#2563eb', icon: CircleDot },
  pending: { label: 'Pendiente', color: '#8591a6', icon: CircleDashed },
};

function StatusTag({ s }: { s: Status }) {
  const x = STATUS[s];
  return (
    <span
      className="inline-flex items-center gap-1 text-[11.5px] font-semibold"
      style={{ color: x.color }}
    >
      <x.icon size={13} strokeWidth={2.4} />
      {x.label}
    </span>
  );
}

function Stage({
  n,
  title,
  subtitle,
  art,
  metric,
  detail,
  to,
  color,
}: {
  n: number;
  title: string;
  subtitle: string;
  art: ReactNode;
  metric: ReactNode;
  detail: ReactNode;
  to: string;
  color: string;
}) {
  return (
    <Link
      to={to}
      className="group relative flex min-w-0 flex-col rounded-[20px] border border-cx-line bg-white p-4 shadow-cx transition hover:-translate-y-0.5 hover:border-cx-blue/40"
    >
      <div className="aspect-[160/96] w-full overflow-hidden rounded-[14px]">{art}</div>
      <div className="mt-3 flex items-center gap-2">
        <span
          className="grid size-6 place-items-center rounded-full text-[12px] font-extrabold text-white"
          style={{ background: color }}
        >
          {n}
        </span>
        <span className="text-[15px] font-extrabold uppercase tracking-[0.06em] text-cx-ink">
          {title}
        </span>
      </div>
      <div className="mt-0.5 text-[12.5px] text-cx-ink3">{subtitle}</div>
      <div className="mt-3 text-[15px] font-bold leading-snug text-cx-ink">{metric}</div>
      <div className="mt-0.5 text-[12px] leading-snug text-cx-ink2">{detail}</div>
      <span className="mt-3 inline-flex items-center gap-1 text-[12.5px] font-semibold text-cx-blue">
        Ver <ArrowRight size={13} className="transition group-hover:translate-x-0.5" />
      </span>
    </Link>
  );
}

function Node({
  icon: Icon,
  title,
  hint,
  status,
}: {
  icon: IconType;
  title: string;
  hint: string;
  status: Status;
}) {
  return (
    <div className="rounded-[14px] border border-cx-line bg-white px-3.5 py-3 shadow-[0_1px_2px_rgb(16_24_40/0.04)]">
      <div className="flex items-center gap-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-[10px] bg-cx-bluesoft text-cx-blue">
          <Icon size={16} strokeWidth={2.2} />
        </span>
        <div className="min-w-0">
          <div className="truncate text-[13.5px] font-bold text-cx-ink">{title}</div>
          <div className="truncate text-[11.5px] text-cx-ink3">{hint}</div>
        </div>
      </div>
      <div className="mt-2">
        <StatusTag s={status} />
      </div>
    </div>
  );
}

function Flow() {
  return (
    <div className="flex items-center justify-center" aria-hidden>
      <svg width="44" height="24" viewBox="0 0 44 24">
        <line
          x1="2"
          y1="12"
          x2="34"
          y2="12"
          stroke="#2563eb"
          strokeWidth="2.5"
          className="cx-flow"
        />
        <path
          d="M32 5l9 7-9 7"
          fill="none"
          stroke="#2563eb"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

const CASES: ReadonlyArray<{
  id: string;
  title: string;
  what: string;
  how: string;
  to: string;
  status: Status;
}> = [
  {
    id: 'A',
    title: 'Demanda desigual',
    what: 'Un acceso se carga y el semáforo le da más verde sin pasar del máximo.',
    how: 'Intersección → “Hora pico en Norte”',
    to: '/centro/interseccion',
    status: 'sim',
  },
  {
    id: 'B',
    title: 'Peatón',
    what: 'Se registra demanda peatonal y se habilita una fase segura.',
    how: 'Intersección → “Muchos peatones”',
    to: '/centro/interseccion',
    status: 'sim',
  },
  {
    id: 'C',
    title: 'Drenaje',
    what: 'La coladera pasa de normal a alerta y el mapa cambia en vivo.',
    how: 'Simulador → escenario 2 · Mapa general',
    to: '/centro',
    status: 'real',
  },
  {
    id: 'D',
    title: 'Predicción',
    what: 'Lluvia prevista + coladera tapada marcan riesgo antes del agua.',
    how: 'Predicción → “Lluvia de 30 mm/h en 30 min”',
    to: '/centro/prediccion',
    status: 'sim',
  },
  {
    id: 'E',
    title: 'Incidente vial',
    what: 'La incidencia es real; el semáforo limita el flujo hacia la zona.',
    how: 'Simulador → escenario 4 · Detalle de la incidencia',
    to: '/centro/incidencias',
    status: 'sim',
  },
  {
    id: 'F',
    title: 'Mantenimiento',
    what: 'La cuadrilla acepta, atiende y cierra; el mapa se normaliza.',
    how: 'Detalle → Validar, Asignar, Resolver',
    to: '/centro/incidencias',
    status: 'real',
  },
  {
    id: 'G',
    title: 'Resiliencia',
    what: 'Sin Internet las lecturas esperan en SQLite y se sincronizan.',
    how: 'Simulador → escenario 6 · Consola técnica',
    to: '/dispositivos',
    status: 'real',
  },
];

export function ProjectPage() {
  const data = useCxData();
  const { risks, horizon } = usePrediction();
  const rules = useRules();
  const sim = useSignal((s) => s.sim);
  useSignal((s) => s.v);
  const online = data.devices.filter(
    (d) => d.status === 'online' || d.status === 'degraded',
  ).length;
  const top = risks[0];
  const inCare = data.incidents.filter(
    (i) => i.status === 'assigned' || i.status === 'in_progress',
  ).length;
  const pending = data.incidents.filter((i) => i.status === 'pending').length;
  const ruleCount = rules.data?.filter((r) => r.enabled).length;

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader
        title="Cómo funciona"
        subtitle="Un solo ciclo: percibir, entender, predecir, actuar y resolver"
      >
        <TopActions search={false} />
      </PageHeader>

      <div className="flex flex-col gap-6 px-7 pb-10">
        <section className="relative overflow-hidden rounded-[24px] bg-gradient-to-br from-[#0c1d38] via-[#12305e] to-[#1d4ed8] px-8 py-7 text-white shadow-cx-lg">
          <svg
            className="pointer-events-none absolute -right-10 -top-10 h-[260px] w-[420px] opacity-25"
            viewBox="0 0 420 260"
            aria-hidden
          >
            {Array.from({ length: 9 }, (_, i) => (
              <line
                key={`v${i}`}
                x1={i * 52}
                y1="0"
                x2={i * 52 - 60}
                y2="260"
                stroke="#93c5fd"
                strokeWidth={i % 3 === 0 ? 6 : 2}
              />
            ))}
            {Array.from({ length: 6 }, (_, i) => (
              <line
                key={`h${i}`}
                x1="0"
                y1={i * 52}
                x2="420"
                y2={i * 52 - 30}
                stroke="#93c5fd"
                strokeWidth={i % 2 ? 2 : 5}
              />
            ))}
            <circle cx="260" cy="120" r="10" fill="#fbbf24" />
            <circle cx="260" cy="120" r="26" fill="none" stroke="#fbbf24" strokeWidth="2" />
          </svg>
          <div className="relative max-w-[760px]">
            <Pill color="#bfdbfe" soft="rgb(255 255 255 / 0.12)">
              <Sparkles size={13} /> {BRAND.name} {BRAND.tagline}
            </Pill>
            <h2 className="mt-3 text-[28px] font-extrabold leading-tight tracking-[-0.02em]">
              Una red inteligente que observa las calles, anticipa problemas y adapta la movilidad
              antes y durante una incidencia.
            </h2>
            <p className="mt-2 text-[14.5px] text-[#c7d7f5]">
              No es otra tecnología aislada: es cerrar el ciclo completo en una intersección real de
              la {BRAND.city}, con los datos que ya produce el sistema.
            </p>
          </div>
          <div className="relative mt-6 grid max-w-[760px] grid-cols-3 gap-3">
            {[
              [`${online}/${data.devices.length || '—'}`, 'dispositivos en línea'],
              [`${data.incidents.length}`, 'incidencias activas'],
              [
                top ? `${Math.round(top.probability * 100)} %` : '—',
                top ? `riesgo en ${top.name} (${horizon} min)` : 'riesgo máximo',
              ],
            ].map(([v, k]) => (
              <div key={k} className="rounded-[16px] bg-white/10 px-4 py-3 backdrop-blur">
                <div className="text-[26px] font-extrabold leading-none">{v}</div>
                <div className="mt-1 text-[12.5px] text-[#c7d7f5]">{k}</div>
              </div>
            ))}
          </div>
        </section>

        <div className="grid grid-cols-5 gap-3">
          <Stage
            n={1}
            title="Percibir"
            subtitle="Cámaras IA y sensores IoT"
            art={<PerceiveArt />}
            metric={`${data.cameras.length} cámaras · ${data.drains.length} coladeras`}
            detail={`${data.lights.length} semáforos y 1 gateway con respaldo sin Internet`}
            to="/centro"
            color="#2563eb"
          />
          <Stage
            n={2}
            title="Entender"
            subtitle="Fusión de datos y reglas"
            art={<UnderstandArt />}
            metric={`${ruleCount ?? 3} reglas de fusión`}
            detail="Coladera + lluvia + cámara escalan una sola incidencia"
            to="/centro/incidencias"
            color="#0ea5e9"
          />
          <Stage
            n={3}
            title="Predecir"
            subtitle="Clima, historial y gemelo digital"
            art={<PredictArt />}
            metric={
              top ? (
                <span>
                  {top.name}:{' '}
                  <span style={{ color: LEVEL_COLOR[top.level] }}>
                    {LEVEL_LABEL[top.level].toLowerCase()}
                  </span>
                </span>
              ) : (
                'Sin datos'
              )
            }
            detail={`Probabilidad, confianza y factores a ${horizon} min`}
            to="/centro/prediccion"
            color="#7c3aed"
          />
          <Stage
            n={4}
            title="Actuar"
            subtitle="Semáforo adaptativo, alertas y API"
            art={<ActArt />}
            metric={`${MAIN_LIGHT} ${usesFixedPlan(sim) ? 'en plan fijo' : 'adaptativo'}`}
            detail={
              sim.phase.kind === 'green'
                ? `Verde ${AXIS_LABEL[sim.phase.axis]} · ${Math.floor(sim.phase.elapsed)} s`
                : 'Cambio de fase en curso'
            }
            to="/centro/interseccion"
            color="#f5812a"
          />
          <Stage
            n={5}
            title="Resolver"
            subtitle="Cuadrillas y mantenimiento"
            art={<ResolveArt />}
            metric={`${inCare} en atención · ${pending} por validar`}
            detail="Cada paso queda en la bitácora con su rol"
            to="/centro/incidencias"
            color="#1fa464"
          />
        </div>

        <Card
          title="Arquitectura en operación"
          icon={Boxes}
          action={
            <div className="flex gap-3">
              <StatusTag s="real" />
              <StatusTag s="sim" />
              <StatusTag s="pending" />
            </div>
          }
        >
          <div className="grid grid-cols-[minmax(0,1fr)_44px_minmax(0,1fr)_44px_minmax(0,1fr)_44px_minmax(0,1fr)] items-stretch">
            <div className="flex min-w-0 flex-col gap-2">
              <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-cx-ink3">
                Campo
              </div>
              <Node
                icon={Video}
                title={`Cámaras IA ×${data.cameras.length || 4}`}
                hint="Webcam o Ray-Ban Meta + servicio IA"
                status="sim"
              />
              <Node
                icon={Droplets}
                title={`Coladeras ×${data.drains.length || 4}`}
                hint="Arduino + HC-SR04 (DrenaGuard)"
                status="sim"
              />
              <Node
                icon={TrafficLightIcon}
                title={`Semáforos ×${data.lights.length || 2}`}
                hint="LEDs de la maqueta"
                status="sim"
              />
            </div>
            <Flow />
            <div className="flex min-w-0 flex-col justify-center gap-2">
              <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-cx-ink3">
                Gateway
              </div>
              <Node
                icon={Radio}
                title="Store-and-forward"
                hint="SQLite, reintentos con backoff"
                status="real"
              />
              <Node
                icon={Cpu}
                title="Heartbeats"
                hint="Estado en línea / fuera de línea"
                status="real"
              />
            </div>
            <Flow />
            <div className="flex min-w-0 flex-col justify-center gap-2">
              <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-cx-ink3">
                Núcleo
              </div>
              <Node
                icon={Server}
                title="API Fastify + WebSocket"
                hint="Tiempo real por canales"
                status="real"
              />
              <Node
                icon={Workflow}
                title="Motor de reglas"
                hint={`${ruleCount ?? 3} reglas con bitácora`}
                status="real"
              />
              <Node
                icon={Database}
                title="PostgreSQL + PostGIS"
                hint="Distancias reales y zonas"
                status="real"
              />
            </div>
            <Flow />
            <div className="flex min-w-0 flex-col gap-2">
              <div className="text-[11.5px] font-bold uppercase tracking-[0.12em] text-cx-ink3">
                Salidas
              </div>
              <Node
                icon={MonitorPlay}
                title="Centro de control"
                hint="Esta vista y la consola técnica"
                status="real"
              />
              <Node
                icon={HardHat}
                title="Cuadrillas"
                hint="Aceptar, atender, resolver"
                status="real"
              />
              <Node
                icon={TrafficLightIcon}
                title={`Control de ${MAIN_LIGHT}`}
                hint="Decisión segura en el navegador"
                status="sim"
              />
              <Node
                icon={Globe}
                title="API para terceros"
                hint="Feed de eventos (sección 10)"
                status="pending"
              />
            </div>
          </div>
        </Card>

        <Card title="Guion de la demo (Anexo B)" icon={BookOpenCheck}>
          <div className="grid grid-cols-4 gap-3">
            {CASES.map((c) => (
              <Link
                key={c.id}
                to={c.to}
                className="group flex flex-col rounded-[16px] border border-cx-line bg-white p-3.5 transition hover:border-cx-blue/40 hover:shadow-cx"
              >
                <div className="flex items-center gap-2">
                  <span className="grid size-7 place-items-center rounded-[9px] bg-cx-navy text-[13px] font-extrabold text-white">
                    {c.id}
                  </span>
                  <span className="text-[14px] font-bold text-cx-ink">{c.title}</span>
                </div>
                <p className="mt-2 flex-1 text-[12.5px] leading-snug text-cx-ink2">{c.what}</p>
                <p className="mt-2 text-[11.5px] font-semibold text-cx-ink3">{c.how}</p>
                <div className="mt-2">
                  <StatusTag s={c.status} />
                </div>
              </Link>
            ))}
            <div className="flex flex-col justify-center rounded-[16px] border border-dashed border-cx-line bg-cx-line2/50 p-3.5 text-[12.5px] leading-snug text-cx-ink2">
              <span className="font-bold text-cx-ink">Momento wow</span>
              La zona se marca como riesgosa en Predicción antes de provocar el escenario en la
              maqueta; luego sensores y cámara lo confirman y el semáforo reacciona.
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}
