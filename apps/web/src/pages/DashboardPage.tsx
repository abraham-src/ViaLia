import type { DeviceDto, DeviceStatus, DeviceType, IncidentDto } from '@simu/shared-types';
import {
  AlertOctagon,
  Camera,
  CircleAlert,
  CloudRain,
  Accessibility,
  Droplets,
} from 'lucide-react';
import { useMemo } from 'react';
import {
  DeviceStatusChip,
  DrainStatusChip,
  IncidentStatusChip,
  PriorityBadge,
} from '../components/ui/Chip';
import { Empty, ErrorLine, SkeletonRows } from '../components/ui/Feedback';
import { Meter } from '../components/ui/Meter';
import { Panel } from '../components/ui/Panel';
import { Sparkline } from '../components/ui/Sparkline';
import { StatTile } from '../components/ui/StatTile';
import {
  useAccessibilityPoints,
  useDevices,
  useIncidents,
  useReadingSeries,
  useWeather,
} from '../hooks/queries';
import { formatAge, formatTime, hourlyBuckets } from '../lib/format';
import {
  ACTIVE_INCIDENT_STATUSES,
  DEVICE_STATUS_LABEL,
  DEVICE_TYPE_LABEL,
  INCIDENT_TYPE_LABEL,
} from '../lib/labels';
import { isStaff, useAuth } from '../stores/auth';
import { useLive } from '../stores/live';
import { SEVERITY_TEXT } from '../components/shell/BottomBar';

const ACTIVE = ACTIVE_INCIDENT_STATUSES.join(',');
const TREND_HOURS = 12;

function trendPoints(values: number[]) {
  const now = Date.now();
  return values.map((value, i) => ({
    value,
    label: `${formatTime(now - (values.length - 1 - i) * 3600_000).slice(0, 5)} h`,
  }));
}

// ───────────────────────────── KPI row ─────────────────────────────

function StaffKpis({ devices, loading }: { devices: DeviceDto[] | undefined; loading: boolean }) {
  const active = useIncidents({ status: ACTIVE, sort: '-priority', page_size: 200 });
  const recent = useIncidents({ sort: '-created_at', page_size: 200 });

  const cams = devices?.filter((d) => d.type === 'camera') ?? [];
  const drains = devices?.filter((d) => d.type === 'drain') ?? [];
  const up = (list: DeviceDto[]) =>
    list.filter((d) => d.status === 'online' || d.status === 'degraded').length;
  const worst = [...drains].sort(
    (a, b) => (b.drain?.obstruction_level ?? 0) - (a.drain?.obstruction_level ?? 0),
  )[0];
  const drainAlert = drains.some(
    (d) => d.drain && (d.drain.status === 'alert' || d.drain.status === 'critical'),
  );

  const activeList = active.data?.data ?? [];
  const critical = activeList.filter((i) => i.priority === 'critical');
  const created = (recent.data?.data ?? []).map((i) => i.created_at);
  const createdCritical = (recent.data?.data ?? [])
    .filter((i) => i.priority === 'critical')
    .map((i) => i.created_at);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        icon={Camera}
        label="Cámaras en línea"
        loading={loading}
        value={`${up(cams)}/${cams.length}`}
        detail={`${cams.filter((c) => c.status === 'degraded').length} degradadas · ${cams.filter((c) => c.status === 'offline').length} fuera de línea`}
      />
      <StatTile
        icon={Droplets}
        label="Coladeras en línea"
        loading={loading}
        tone={drainAlert ? 'alert' : 'default'}
        value={`${up(drains)}/${drains.length}`}
        detail={
          worst?.drain ? `máx. ${worst.drain.obstruction_level} % · ${worst.device_code}` : '—'
        }
      />
      <StatTile
        icon={CircleAlert}
        label="Incidencias activas"
        loading={active.isLoading}
        value={active.data?.meta.total ?? 0}
        detail={`${activeList.filter((i) => i.status === 'pending').length} pendientes de validar`}
        trend={trendPoints(hourlyBuckets(created, TREND_HOURS))}
        trendLabel="nuevas · 12 h"
      />
      <StatTile
        icon={AlertOctagon}
        label="Alertas críticas"
        loading={active.isLoading}
        tone={critical.length > 0 ? 'alert' : 'default'}
        value={critical.length}
        detail={`${activeList.filter((i) => i.priority === 'high').length} de prioridad alta`}
        trend={trendPoints(hourlyBuckets(createdCritical, TREND_HOURS))}
        trendLabel="críticas · 12 h"
      />
    </div>
  );
}

function CitizenKpis() {
  const active = useIncidents({ status: ACTIVE, page_size: 200 });
  const blocked = useAccessibilityPoints({ status: 'blocked' });
  const weather = useWeather();
  const list = active.data?.data ?? [];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatTile
        icon={CircleAlert}
        label="Incidencias activas"
        loading={active.isLoading}
        value={active.data?.meta.total ?? 0}
      />
      <StatTile
        icon={AlertOctagon}
        label="Incidencias críticas"
        loading={active.isLoading}
        value={list.filter((i) => i.priority === 'critical').length}
        tone={list.some((i) => i.priority === 'critical') ? 'alert' : 'default'}
      />
      <StatTile
        icon={Accessibility}
        label="Puntos de accesibilidad bloqueados"
        loading={blocked.isLoading}
        value={blocked.data?.length ?? 0}
      />
      <StatTile
        icon={CloudRain}
        label="Clima"
        loading={weather.isLoading}
        value={weather.data?.raining ? 'Lluvia' : 'Sin lluvia'}
        detail={
          weather.data
            ? `${weather.data.zone ?? 'CDMX'} · ${formatAge(weather.data.recorded_at)}`
            : 'sin reporte'
        }
      />
    </div>
  );
}

// ───────────────────────────── Drains ─────────────────────────────

function DrainRow({ drain }: { drain: DeviceDto }) {
  const series = useReadingSeries(drain.device_code);
  const info = drain.drain;
  const points = (series.data ?? []).map((p) => ({
    value: p.max,
    label: formatTime(p.t).slice(0, 5),
  }));
  if (!info) return null;
  return (
    <tr className="border-b border-line last:border-b-0">
      <td className="px-3 py-1.5 font-mono text-[12px]">{drain.device_code}</td>
      <td className="max-w-48 truncate px-3 py-1.5 text-fg-muted" title={drain.name}>
        {drain.name.replace('Coladera ', '')}
      </td>
      <td className="px-3 py-1.5">
        <span className="flex items-center gap-2">
          <Meter value={info.obstruction_level} status={info.status} />
          <span className="w-10 text-right font-mono text-[12px]">{info.obstruction_level} %</span>
        </span>
      </td>
      <td className="px-3 py-1.5">
        <DrainStatusChip status={info.status} />
      </td>
      <td className="px-3 py-1.5">
        {series.isLoading ? (
          <span className="block h-6 w-24 animate-pulse bg-surface-2" />
        ) : (
          <Sparkline points={points} domain={[0, 100]} format={(v) => `${v} %`} />
        )}
      </td>
      <td className="px-3 py-1.5 font-mono text-[12px] text-fg-muted">
        {formatAge(info.last_reading_at)}
      </td>
      <td className="px-3 py-1.5">
        <DeviceStatusChip status={drain.status} />
      </td>
    </tr>
  );
}

function DrainsPanel({
  devices,
  isLoading,
  error,
  retry,
}: {
  devices: DeviceDto[] | undefined;
  isLoading: boolean;
  error: Error | null;
  retry: () => void;
}) {
  const drains = devices?.filter((d) => d.type === 'drain') ?? [];
  return (
    <Panel title="Coladeras inteligentes" meta="nivel de obstrucción · 24 h (máx. por 30 min)">
      {error ? (
        <ErrorLine message="No se pudieron cargar las coladeras." onRetry={retry} />
      ) : isLoading ? (
        <SkeletonRows rows={4} cols={6} />
      ) : (
        <table className="w-full text-left">
          <thead className="text-[11px] uppercase tracking-wider text-fg-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-1.5 font-medium">Código</th>
              <th className="px-3 py-1.5 font-medium">Ubicación</th>
              <th className="px-3 py-1.5 font-medium">Nivel</th>
              <th className="px-3 py-1.5 font-medium">Estado</th>
              <th className="px-3 py-1.5 font-medium">24 h</th>
              <th className="px-3 py-1.5 font-medium">Lectura</th>
              <th className="px-3 py-1.5 font-medium">Dispositivo</th>
            </tr>
          </thead>
          <tbody>
            {drains.map((d) => (
              <DrainRow key={d.device_code} drain={d} />
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

// ───────────────────────────── Incidents ─────────────────────────────

function IncidentsPanel() {
  const { data, isLoading, error, refetch } = useIncidents({
    status: ACTIVE,
    sort: '-priority',
    page_size: 12,
  });
  const items: IncidentDto[] = data?.data ?? [];
  return (
    <Panel title="Incidencias activas" meta={data ? `${data.meta.total} en total` : undefined}>
      {error ? (
        <ErrorLine
          message="No se pudieron cargar las incidencias."
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <SkeletonRows rows={6} cols={4} />
      ) : items.length === 0 ? (
        <Empty>Sin incidencias activas.</Empty>
      ) : (
        <ul className="divide-y divide-line">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2 px-3 py-1.5">
              <PriorityBadge priority={i.priority} />
              <span className="min-w-0 flex-1 truncate" title={i.description}>
                {INCIDENT_TYPE_LABEL[i.type]}
                <span className="ml-2 font-mono text-[11px] text-fg-muted">
                  {i.device_code ?? 'reporte'}
                </span>
              </span>
              <IncidentStatusChip status={i.status} />
              <span className="w-20 text-right font-mono text-[11px] text-fg-muted">
                {formatAge(i.created_at)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ───────────────────────────── Devices & alerts ─────────────────────────────

const TYPES: DeviceType[] = ['camera', 'drain', 'traffic_light', 'gateway'];
const STATUSES: DeviceStatus[] = ['online', 'degraded', 'offline', 'maintenance'];

function DevicesByTypePanel({
  devices,
  isLoading,
}: {
  devices: DeviceDto[] | undefined;
  isLoading: boolean;
}) {
  const table = useMemo(
    () =>
      TYPES.map((type) => {
        const list = devices?.filter((d) => d.type === type) ?? [];
        return {
          type,
          total: list.length,
          counts: STATUSES.map((s) => list.filter((d) => d.status === s).length),
        };
      }),
    [devices],
  );
  return (
    <Panel title="Dispositivos por tipo">
      {isLoading ? (
        <SkeletonRows rows={4} cols={5} />
      ) : (
        <table className="w-full text-left">
          <thead className="text-[11px] uppercase tracking-wider text-fg-muted">
            <tr className="border-b border-line">
              <th className="px-3 py-1.5 font-medium">Tipo</th>
              {STATUSES.map((s) => (
                <th key={s} className="px-3 py-1.5 text-right font-medium">
                  {DEVICE_STATUS_LABEL[s]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="font-mono text-[12px]">
            {table.map((row) => (
              <tr key={row.type} className="border-b border-line last:border-b-0">
                <td className="px-3 py-1.5 font-sans text-[13px]">
                  {DEVICE_TYPE_LABEL[row.type]} <span className="text-fg-muted">({row.total})</span>
                </td>
                {row.counts.map((n, i) => (
                  <td
                    key={STATUSES[i]}
                    className={`px-3 py-1.5 text-right ${n === 0 ? 'text-fg-muted' : i === 0 ? 'text-ok' : i === 1 ? 'text-warn' : i === 2 ? 'text-critical' : ''}`}
                  >
                    {n}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Panel>
  );
}

function AlertsPanel() {
  const alerts = useLive((s) => s.alerts);
  const severity = { low: 'info', medium: 'warn', high: 'danger', critical: 'critical' } as const;
  return (
    <Panel title="Alertas en vivo" meta="desde que abriste la sesión">
      {alerts.length === 0 ? (
        <Empty>Sin alertas en esta sesión. Las nuevas aparecerán aquí al instante.</Empty>
      ) : (
        <ul className="max-h-64 divide-y divide-line overflow-auto">
          {alerts.map((a) => (
            <li key={`${a.incident_id}-${a.ts}`} className="animate-fade-in px-3 py-1.5">
              <div className="flex items-center gap-2">
                <PriorityBadge priority={a.priority} />
                <span className={`font-mono text-[12px] ${SEVERITY_TEXT[severity[a.priority]]}`}>
                  {a.label}
                </span>
                <span className="ml-auto font-mono text-[11px] text-fg-muted">
                  {formatTime(a.ts)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-[12px] text-fg-muted" title={a.message}>
                {a.message}
              </p>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

// ───────────────────────────── Page ─────────────────────────────

export function DashboardPage() {
  const user = useAuth((s) => s.user);
  const staff = isStaff(user);
  const devices = useDevices(staff);

  return (
    <div className="space-y-3 p-3">
      {staff ? <StaffKpis devices={devices.data} loading={devices.isLoading} /> : <CitizenKpis />}
      {staff ? (
        <>
          <div className="grid gap-3 2xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <DrainsPanel
              devices={devices.data}
              isLoading={devices.isLoading}
              error={devices.error}
              retry={() => void devices.refetch()}
            />
            <IncidentsPanel />
          </div>
          <div className="grid gap-3 xl:grid-cols-2">
            <DevicesByTypePanel devices={devices.data} isLoading={devices.isLoading} />
            <AlertsPanel />
          </div>
        </>
      ) : (
        <div className="grid gap-3 xl:grid-cols-2">
          <IncidentsPanel />
          <AlertsPanel />
        </div>
      )}
    </div>
  );
}
