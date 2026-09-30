import type { IncidentDto, IncidentEventDto, IncidentPriority } from '@simu/shared-types';
import { availableActions, type IncidentAction } from '@simu/shared-utils';
import {
  ArrowRight,
  Bot,
  Camera,
  Check,
  Clock,
  CloudRain,
  Droplets,
  FileText,
  GitMerge,
  MapPin,
  ShieldCheck,
  TriangleAlert,
  Video,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAcceptIncident } from '../../hooks/admin';
import { useAssignees, useIncidentAction, useIncidentEvents } from '../../hooks/mutations';
import { ApiError } from '../../lib/api';
import { formatAge, formatTime } from '../../lib/format';
import { INCIDENT_TYPE_LABEL, ROLE_LABEL } from '../../lib/labels';
import { ACTION_LABEL, EVENT_LABEL } from '../../lib/workflow-labels';
import { useAuth } from '../../stores/auth';
import { BRAND } from '../brand';
import { TrafficLightIcon } from '../components/icons';
import { TopActions } from '../components/TopActions';
import {
  Breadcrumb,
  Button,
  Card,
  Empty,
  InfoRow,
  Meter,
  Note,
  PageHeader,
  Pill,
  PriorityPill,
} from '../components/ui';
import { lngLatOf, type CxData } from '../data/useCxData';
import { useIncidentContext } from '../data/useIncidentContext';
import { EvidenceScene } from '../illustrations/EvidenceScene';
import { formatDistance } from '../lib/geo';
import {
  INCIDENT_VISUAL,
  PRIORITY_COLOR,
  PRIORITY_SOFT,
  PRIORITY_TEXT,
  WORKFLOW_STEPS,
  formatWhen,
  workflowIndex,
} from '../lib/visuals';
import { APPROACH_LABEL, APPROACHES, AXIS_OF, lampFor, usesFixedPlan } from '../sim/intersection';
import { MAIN_LIGHT, flagsFromIncidents, useSignal } from '../sim/store';
import { IncidentSwitcher } from './IncidentZoomPage';

const FACT_LABEL: Record<
  string,
  { label: string; icon: typeof Droplets; fmt: (v: unknown) => string }
> = {
  'drain.obstruction_level': {
    label: 'Coladera sobre 80 %',
    icon: Droplets,
    fmt: (v) => `${String(v)} %`,
  },
  'weather.raining': { label: 'Lluvia en la zona', icon: CloudRain, fmt: (v) => (v ? 'Sí' : 'No') },
  'camera.water_detected': {
    label: 'Agua vista por cámara',
    icon: Video,
    fmt: (v) => (v ? 'Sí' : 'No'),
  },
  'camera.confidence': {
    label: 'Confianza de la cámara',
    icon: Video,
    fmt: (v) => (typeof v === 'number' ? `${Math.round(v * 100)} %` : '—'),
  },
};

const dateFmt = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

function sourceText(i: IncidentDto): string {
  const src = String(i.metadata.source ?? '');
  if (src === 'rules_engine') return 'Motor de reglas (sensor + clima + cámara)';
  if (src === 'camera') return 'Análisis con IA de la cámara';
  if (src === 'sensor') return 'Sensor DrenaGuard';
  if (src === 'citizen_report') return 'Reporte ciudadano';
  return 'Registro manual';
}

function EvidenceCard({
  incident,
  data,
  address,
}: {
  incident: IncidentDto;
  data: CxData;
  address: string | null;
}) {
  const visual = INCIDENT_VISUAL[incident.type];
  const device = incident.device_code ? data.byCode.get(incident.device_code) : undefined;
  // La evidencia la aporta la cámara; si la incidencia es de una coladera, usamos la cámara más cercana.
  const camera =
    device?.type === 'camera'
      ? device
      : data.cameras
          .map((c) => ({
            c,
            d: Math.hypot(c.latitude - incident.latitude, c.longitude - incident.longitude),
          }))
          .sort((a, b) => a.d - b.d)[0]?.c;
  const stream = camera?.camera?.stream_url ?? null;
  const raining = incident.metadata.facts
    ? (incident.metadata.facts as Record<string, unknown>)['weather.raining'] === true
    : data.weather?.raining === true;
  return (
    <div className="relative overflow-hidden rounded-[22px] border border-cx-line bg-[#143254] shadow-cx">
      {stream ? (
        <img src={stream} alt="Video en vivo" className="aspect-[16/10] w-full object-cover" />
      ) : (
        <EvidenceScene
          kind={visual.scene}
          label={visual.evidence}
          confidence={incident.confidence}
          rain={raining}
          className="block aspect-[16/10] w-full"
        />
      )}
      <div className="absolute left-4 top-4 rounded-[12px] bg-black/55 px-3.5 py-2 text-white backdrop-blur">
        <div className="text-[15px] font-bold">Cámara {camera?.device_code ?? '—'}</div>
        <div className="text-[12.5px] text-white/80">
          {address ?? camera?.camera?.location_description ?? ''}
        </div>
      </div>
      <span
        className={`absolute right-4 top-4 inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11.5px] font-extrabold uppercase tracking-wide text-white ${
          stream ? 'bg-[#e5484d]' : 'bg-black/55 backdrop-blur'
        }`}
      >
        <span className={`size-2 rounded-full ${stream ? 'cx-blink bg-white' : 'bg-[#fbbf24]'}`} />
        {stream ? 'En vivo' : 'Evidencia ilustrada'}
      </span>
      <span className="cx-tabular absolute bottom-4 left-4 rounded-[10px] bg-black/55 px-3 py-1.5 text-[13px] font-semibold text-white backdrop-blur">
        {dateFmt.format(new Date(incident.created_at))} · {formatTime(incident.created_at)}
      </span>
    </div>
  );
}

function FusionCard({ incident, data }: { incident: IncidentDto; data: CxData }) {
  const facts = (incident.metadata.facts ?? null) as Record<string, unknown> | null;
  const label = typeof incident.metadata.label === 'string' ? incident.metadata.label : null;
  const drain = incident.device_code ? data.byCode.get(incident.device_code)?.drain : null;
  const tiles = [
    {
      key: 'camera',
      icon: Video,
      title: 'Cámara IA',
      value: `${Math.round(incident.confidence * 100)} %`,
      hint: 'confianza de la detección',
      on: facts ? facts['camera.water_detected'] === true : incident.metadata.source === 'camera',
    },
    {
      key: 'drain',
      icon: Droplets,
      title: 'DrenaGuard',
      value: drain
        ? `${drain.obstruction_level} %`
        : facts?.['drain.obstruction_level'] !== undefined
          ? `${String(facts['drain.obstruction_level'])} %`
          : '—',
      hint: 'obstrucción medida',
      on: facts
        ? Number(facts['drain.obstruction_level'] ?? 0) > 80
        : incident.metadata.source === 'sensor',
    },
    {
      key: 'weather',
      icon: CloudRain,
      title: 'Clima',
      value: data.weather?.raining ? `${data.weather.intensity_mm_h ?? '—'} mm/h` : 'Sin lluvia',
      hint: data.weather?.zone ? `reporte de ${data.weather.zone}` : 'último reporte',
      on: facts ? facts['weather.raining'] === true : false,
    },
  ];
  return (
    <Card
      title="Fusión de datos"
      icon={GitMerge}
      action={label ? <Pill color={PRIORITY_COLOR[incident.priority]}>{label}</Pill> : null}
    >
      <div className="grid grid-cols-3 gap-3">
        {tiles.map((t) => (
          <div
            key={t.key}
            className={`relative rounded-[16px] border p-3.5 ${
              t.on ? 'border-cx-blue/30 bg-cx-bluesoft' : 'border-cx-line bg-cx-line2/60'
            }`}
          >
            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-cx-ink2">
              <t.icon
                size={15}
                strokeWidth={2.2}
                className={t.on ? 'text-cx-blue' : 'text-cx-ink3'}
              />
              {t.title}
            </div>
            <div className="cx-tabular mt-1.5 text-[22px] font-extrabold tracking-tight text-cx-ink">
              {t.value}
            </div>
            <div className="text-[11.5px] text-cx-ink3">{t.hint}</div>
            <span
              className={`absolute right-3 top-3 grid size-5 place-items-center rounded-full ${
                t.on ? 'bg-cx-blue text-white' : 'bg-[#dfe5ee] text-cx-ink3'
              }`}
            >
              {t.on ? <Check size={12} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}
            </span>
          </div>
        ))}
      </div>
      {facts ? (
        <div className="mt-4 rounded-[14px] border border-cx-line bg-white px-4 py-3">
          <div className="text-[12px] font-bold uppercase tracking-[0.1em] text-cx-ink3">
            Regla aplicada
          </div>
          <div className="mt-1 text-[14px] font-semibold text-cx-ink">
            {String(incident.metadata.rule_name ?? 'Motor de reglas')}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px]">
            {Object.entries(facts).map(([k, v], idx) => {
              const f = FACT_LABEL[k];
              return (
                <span key={k} className="flex items-center gap-2">
                  {idx > 0 && <span className="font-bold text-cx-ink3">+</span>}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-cx-line2 px-2.5 py-1 font-semibold text-cx-ink2">
                    <Check size={12} strokeWidth={3} className="text-cx-ok" />
                    {f?.label ?? k}: {f ? f.fmt(v) : String(v)}
                  </span>
                </span>
              );
            })}
            <ArrowRight size={15} className="text-cx-ink3" />
            <PriorityPill priority={incident.priority} solid />
          </div>
        </div>
      ) : (
        <Note className="mt-3">
          Esta incidencia viene de una sola fuente ({sourceText(incident).toLowerCase()}). Las del
          motor de reglas muestran aquí cada dato que las activó.
        </Note>
      )}
    </Card>
  );
}

function OperationCard({ incident }: { incident: IncidentDto }) {
  const user = useAuth((s) => s.user);
  const isTriage = user?.role === 'admin' || user?.role === 'operator';
  const assignees = useAssignees(isTriage);
  const action = useIncidentAction();
  const accept = useAcceptIncident();
  const [assignee, setAssignee] = useState('');
  const step = workflowIndex(incident.status);
  const actions: IncidentAction[] = user
    ? availableActions(user, {
        status: incident.status,
        assignedToId: incident.assigned_to?.id ?? null,
      })
    : [];
  const run = (a: IncidentAction) => {
    if (a === 'assign' && !assignee) return;
    action.mutate({ id: incident.id, action: a, ...(a === 'assign' && { assigneeId: assignee }) });
  };
  const canAccept =
    incident.status === 'assigned' &&
    typeof incident.metadata.accepted_at !== 'string' &&
    user &&
    (incident.assigned_to?.id === user.id || user.role === 'admin');
  const error = action.error ?? accept.error;

  return (
    <Card title="Atención de la incidencia" icon={ShieldCheck}>
      <ol className="flex items-start">
        {WORKFLOW_STEPS.map((s, i) => {
          const done = incident.status !== 'rejected' && i <= step;
          const current = i === step && incident.status !== 'resolved';
          return (
            <li key={s.key} className="relative flex flex-1 flex-col items-center text-center">
              {i > 0 && (
                <span
                  className={`absolute right-1/2 top-[13px] h-[3px] w-full -translate-x-[14px] ${
                    i <= step ? 'bg-cx-blue' : 'bg-cx-line'
                  }`}
                  style={{ width: 'calc(100% - 28px)', left: 'calc(-50% + 14px)' }}
                  aria-hidden
                />
              )}
              <span
                className={`relative z-10 grid size-7 place-items-center rounded-full border-2 text-[12px] font-bold ${
                  done
                    ? 'border-cx-blue bg-cx-blue text-white'
                    : 'border-cx-line bg-white text-cx-ink3'
                } ${current ? 'ring-4 ring-cx-blue/15' : ''}`}
              >
                {done && !current ? <Check size={14} strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={`mt-1.5 text-[11.5px] font-semibold ${done ? 'text-cx-ink' : 'text-cx-ink3'}`}
              >
                {s.label}
              </span>
            </li>
          );
        })}
      </ol>
      {incident.status === 'rejected' && (
        <Note className="mt-3">Esta incidencia fue rechazada.</Note>
      )}
      <div className="mt-4 text-[13px] text-cx-ink2">
        Responsable:{' '}
        <span className="font-semibold text-cx-ink">
          {incident.assigned_to?.name ?? 'sin asignar'}
        </span>
      </div>
      {(actions.length > 0 || canAccept) && (
        <div className="mt-3 flex flex-col gap-2.5">
          {actions.includes('assign') && (
            <div className="flex gap-2">
              <select
                value={assignee}
                onChange={(e) => setAssignee(e.target.value)}
                className="min-w-0 flex-1 rounded-[12px] border border-cx-line bg-white px-3 py-2.5 text-[13.5px] text-cx-ink"
                aria-label="Cuadrilla de mantenimiento"
              >
                <option value="">Asignar cuadrilla…</option>
                {assignees.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
              <Button
                variant="ghost"
                disabled={!assignee || action.isPending}
                onClick={() => run('assign')}
              >
                {ACTION_LABEL.assign}
              </Button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {canAccept && (
              <Button disabled={accept.isPending} onClick={() => accept.mutate(incident.id)}>
                Aceptar tarea
              </Button>
            )}
            {actions
              .filter((a) => a !== 'assign')
              .map((a) => (
                <Button
                  key={a}
                  variant={
                    a === 'reject'
                      ? 'danger'
                      : a === 'validate' || a === 'start' || a === 'resolve'
                        ? 'primary'
                        : 'ghost'
                  }
                  disabled={action.isPending}
                  onClick={() => run(a)}
                >
                  {ACTION_LABEL[a]}
                </Button>
              ))}
          </div>
        </div>
      )}
      {error && (
        <p className="mt-2 text-[12.5px] font-medium text-[#c62a2f]">
          {error instanceof ApiError ? error.message : 'La acción no se pudo completar.'}
        </p>
      )}
    </Card>
  );
}

function MobilityCard({ data, incident }: { data: CxData; incident: IncidentDto }) {
  const sim = useSignal((s) => s.sim);
  useSignal((s) => s.v);
  const light = data.byCode.get(MAIN_LIGHT);
  // Qué acceso restringiría esta incidencia por sí sola (misma regla que usa la simulación).
  const own = light ? flagsFromIncidents(lngLatOf(light), [incident]) : null;
  const mine = own ? APPROACHES.filter((a) => own[a]) : [];
  const anyFlag = APPROACHES.filter((a) => sim.flags[a]);
  return (
    <Card title="Respuesta en movilidad" icon={TrafficLightIcon}>
      {!light ? (
        <Empty>Sin semáforos registrados.</Empty>
      ) : mine.length ? (
        <>
          <p className="text-[13.5px] text-cx-ink2">
            <span className="font-semibold text-cx-ink">{MAIN_LIGHT}</span> (
            {light.name.replace(/^Semáforo\s+/, '')}) limita el flujo hacia la zona afectada:
          </p>
          <ul className="mt-2.5 flex flex-col gap-2">
            {mine.map((a) => (
              <li
                key={a}
                className="flex items-center gap-3 rounded-[12px] bg-[#fff4ec] px-3 py-2.5"
              >
                <span className="grid size-8 place-items-center rounded-full bg-cx-high text-white">
                  <TriangleAlert size={15} strokeWidth={2.4} />
                </span>
                <span className="text-[13px] leading-snug">
                  <span className="block font-semibold text-cx-ink">
                    Acceso {APPROACH_LABEL[a]} con prioridad reducida
                  </span>
                  <span className="text-cx-ink3">
                    Semáforo en{' '}
                    {lampFor(sim, a) === 'green'
                      ? 'verde'
                      : lampFor(sim, a) === 'yellow'
                        ? 'amarillo'
                        : 'rojo'}{' '}
                    · eje {AXIS_OF[a] === 'NS' ? 'Norte–Sur' : 'Oriente–Poniente'}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-[13.5px] text-cx-ink2">
          Ningún semáforo adaptativo está a menos de 600 m de esta incidencia o el tipo no afecta la
          circulación. {anyFlag.length ? `${MAIN_LIGHT} tiene otras restricciones activas.` : ''}
        </p>
      )}
      <div className="mt-3 flex items-center justify-between">
        <Pill color={usesFixedPlan(sim) ? '#64748b' : '#1f5fa6'}>
          {usesFixedPlan(sim) ? 'Plan fijo' : 'Control adaptativo'}
        </Pill>
        <Link
          to="/centro/interseccion"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-cx-blue hover:underline"
        >
          Ver intersección <ArrowRight size={14} />
        </Link>
      </div>
    </Card>
  );
}

function describe(e: IncidentEventDto): string {
  const p = e.payload as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof p.label === 'string') parts.push(p.label);
  if (typeof p.from === 'string' && typeof p.to === 'string') {
    const tr = (x: string) => (x in PRIORITY_TEXT ? PRIORITY_TEXT[x as IncidentPriority] : x);
    parts.push(`${tr(p.from)} → ${tr(p.to)}`);
  }
  if (typeof p.note === 'string') parts.push(`“${p.note}”`);
  if (typeof p.confidence === 'number') parts.push(`confianza ${Math.round(p.confidence * 100)} %`);
  const actor = p.actor as { role?: string } | undefined;
  const role = actor?.role ?? (typeof p.by_role === 'string' ? p.by_role : undefined);
  if (role && role in ROLE_LABEL) parts.push(ROLE_LABEL[role as keyof typeof ROLE_LABEL]);
  if (typeof p.source === 'string' && e.event_type === 'created') parts.push(`origen: ${p.source}`);
  return parts.join(' · ');
}

function LogCard({ incident }: { incident: IncidentDto }) {
  const user = useAuth((s) => s.user);
  const canSee = user?.role !== 'citizen';
  const events = useIncidentEvents(incident.id, canSee);
  return (
    <Card title="Bitácora" icon={FileText}>
      {!canSee ? (
        <Empty>La bitácora es solo para personal operativo.</Empty>
      ) : events.isLoading ? (
        <Empty>Cargando…</Empty>
      ) : !events.data?.length ? (
        <Empty>Sin eventos.</Empty>
      ) : (
        <ol className="relative ml-2 border-l-2 border-cx-line2 pl-5">
          {[...events.data].reverse().map((e) => (
            <li key={e.id} className="relative pb-3.5 last:pb-0">
              <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-white bg-cx-blue shadow" />
              <div className="flex items-baseline gap-2">
                <span className="text-[13.5px] font-semibold text-cx-ink">
                  {EVENT_LABEL[e.event_type] ?? e.event_type}
                </span>
                <time className="cx-tabular ml-auto text-[12px] text-cx-ink3">
                  {formatTime(e.created_at)}
                </time>
              </div>
              <p className="text-[12.5px] text-cx-ink3">{describe(e)}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function IncidentDetailPage() {
  const { id } = useParams();
  const { data, incident, ctx, loading } = useIncidentContext(id);

  if (!incident || !ctx) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader title="Vista de detalle" subtitle="Información y evidencia de la incidencia">
          <TopActions />
        </PageHeader>
        <div className="px-4 sm:px-7">
          <Card>
            <Empty>{loading ? 'Cargando…' : 'No se encontró la incidencia.'}</Empty>
          </Card>
        </div>
      </div>
    );
  }

  const visual = INCIDENT_VISUAL[incident.type];
  const color = PRIORITY_COLOR[incident.priority];
  const confidence = Math.round(incident.confidence * 100);

  return (
    <div className="flex min-h-full flex-col">
      <PageHeader title="Vista de detalle" subtitle="Información y evidencia de la incidencia">
        <Breadcrumb
          items={[
            { label: 'Ciudad', to: '/centro' },
            { label: ctx.zone?.name ?? BRAND.city },
            { label: ctx.names[0] ?? visual.title, to: `/centro/incidencias/${incident.id}` },
            { label: incident.device_code ?? 'Reporte' },
          ]}
        />
        <IncidentSwitcher data={data} current={incident} suffix="/detalle" />
        <TopActions search={false} />
      </PageHeader>

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(360px,1fr)] px-4 sm:px-7 pb-8">
        <div className="flex min-w-0 flex-col gap-5">
          <EvidenceCard incident={incident} data={data} address={ctx.address} />
          <FusionCard incident={incident} data={data} />
          <LogCard incident={incident} />
        </div>

        <div className="flex min-w-0 flex-col gap-5">
          <section className="overflow-hidden rounded-[20px] border border-cx-line bg-white shadow-cx">
            <header
              className="flex items-center gap-3.5 px-5 py-4"
              style={{ background: PRIORITY_SOFT[incident.priority] }}
            >
              <span
                className="grid size-11 shrink-0 place-items-center rounded-[14px]"
                style={{ background: color }}
              >
                <TriangleAlert size={22} strokeWidth={2.4} className="text-white" />
              </span>
              <div className="min-w-0 flex-1">
                <h2
                  className="text-[17px] font-extrabold leading-tight"
                  style={{ color: incident.priority === 'medium' ? '#8a5a00' : color }}
                >
                  Incidencia detectada
                </h2>
                <p className="truncate text-[13.5px] font-medium text-cx-ink2">{visual.title}</p>
              </div>
              <PriorityPill priority={incident.priority} solid />
            </header>
            <div className="divide-y divide-cx-line2 px-5 pb-2 pt-1">
              <InfoRow icon={MapPin} label="Ubicación">
                {ctx.address ?? 'Sin calle cercana'}
                <div className="text-[12.5px] font-normal text-cx-ink3">
                  {ctx.zone
                    ? `${ctx.zone.name}${ctx.zone.alcaldia ? `, ${ctx.zone.alcaldia}` : ''}`
                    : BRAND.city}
                </div>
              </InfoRow>
              <InfoRow icon={Clock} label="Hora de detección">
                {formatWhen(incident.created_at)}{' '}
                <span className="font-normal text-cx-ink3">({formatAge(incident.created_at)})</span>
              </InfoRow>
              <InfoRow icon={Camera} label="Fuente">
                {incident.device_code ?? 'Sin dispositivo'}
                <div className="text-[12.5px] font-normal text-cx-ink3">{sourceText(incident)}</div>
              </InfoRow>
              <InfoRow icon={FileText} label="Descripción">
                <span className="font-normal text-cx-ink2">{incident.description}</span>
              </InfoRow>
            </div>
          </section>

          <section className="rounded-[20px] border border-[#d6e4ff] bg-gradient-to-br from-[#f3f7ff] to-[#e8f0f9] p-5 shadow-cx">
            <div className="flex items-center gap-2 text-[15.5px] font-bold text-cx-ink">
              <Bot size={18} strokeWidth={2.2} className="text-cx-blue" /> Datos de la IA
            </div>
            <div className="mt-3 grid grid-cols-1 gap-5 sm:grid-cols-[1fr_1.25fr]">
              <div>
                <div className="text-[12.5px] font-medium text-cx-ink3">Confianza de detección</div>
                <div className="cx-tabular mt-1 text-[30px] font-extrabold leading-none tracking-tight text-cx-ink">
                  {confidence} %
                </div>
                <div className="mt-2.5">
                  <Meter value={confidence} color="#1f5fa6" height={9} />
                </div>
              </div>
              <div>
                <div className="text-[12.5px] font-medium text-cx-ink3">
                  Clases que busca el modelo
                </div>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {visual.classes.map((c) => (
                    <span
                      key={c}
                      className="rounded-full bg-white px-2.5 py-1 text-[12px] font-semibold text-cx-ink2 shadow-sm"
                    >
                      {c}
                    </span>
                  ))}
                </div>
              </div>
            </div>
            <Note className="mt-3">
              Tipo {INCIDENT_TYPE_LABEL[incident.type].toLowerCase()}. El servicio de IA del repo es
              un mock; al conectar el modelo real, las clases detectadas llegan en los metadatos.
            </Note>
          </section>

          <OperationCard incident={incident} />
          <MobilityCard data={data} incident={incident} />
          {ctx.light && (
            <Note className="px-1">
              Semáforo más cercano: {ctx.light.item.device_code} a{' '}
              {formatDistance(ctx.light.distance)}.
            </Note>
          )}
        </div>
      </div>
    </div>
  );
}
