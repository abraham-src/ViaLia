import { CAMERA_EVENT_TYPES, WEATHER_EVENT_TYPE } from '@simu/shared-types';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Chip, PriorityBadge } from '../components/ui/Chip';
import { Empty, ErrorLine, SkeletonRows } from '../components/ui/Feedback';
import { useAuditLog, useDeviceEvents } from '../hooks/admin';
import { useDevices } from '../hooks/queries';
import { formatDateTime, formatTime } from '../lib/format';
import { INCIDENT_TYPE_LABEL, ROLE_LABEL } from '../lib/labels';
import { EVENT_LABEL } from '../lib/workflow-labels';

type Tab = 'device' | 'audit';
const PAGE_SIZE = 50;
const RANGES = [
  { label: '1 h', ms: 3600_000 },
  { label: '24 h', ms: 24 * 3600_000 },
  { label: '7 d', ms: 7 * 24 * 3600_000 },
] as const;
const AUDIT_TYPES = Object.keys(EVENT_LABEL);
const field = 'rounded-sm border border-line bg-base px-1.5 py-1 text-[12px] text-fg';

function payloadSummary(p: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(p)) {
    if (v === null || v === undefined) continue;
    if (k === 'actor' && typeof v === 'object') {
      const role = (v as { role?: string }).role;
      if (role && role in ROLE_LABEL)
        parts.push(`por ${ROLE_LABEL[role as keyof typeof ROLE_LABEL]}`);
      continue;
    }
    if (k === 'facts' || k === 'trigger') continue;
    parts.push(`${k}=${typeof v === 'object' ? JSON.stringify(v) : String(v)}`);
  }
  return parts.join(' · ');
}

/** Spec §7.2 "Logs / Eventos": dense tables with filters. */
export function LogsPage() {
  const [tab, setTab] = useState<Tab>('device');
  const [range, setRange] = useState<number>(RANGES[1].ms);
  const [device, setDevice] = useState('');
  const [type, setType] = useState('');
  const [page, setPage] = useState(1);
  const devices = useDevices();

  // Stable window per filter change (not per render), so paging stays consistent.
  const window_ = useMemo(() => {
    const to = new Date();
    return { from: new Date(to.getTime() - range).toISOString(), to: to.toISOString() };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- recompute on filter change only
  }, [range, tab, device, type]);

  const base = { ...window_, page, page_size: PAGE_SIZE };
  const deviceLog = useDeviceEvents(
    { ...base, device_id: device || undefined, type: type || undefined },
    tab === 'device',
  );
  const audit = useAuditLog({ ...base, event_type: type || undefined }, tab === 'audit');
  const current = tab === 'device' ? deviceLog : audit;
  const total = current.data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const reset = (fn: () => void) => {
    fn();
    setPage(1);
  };

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <div className="flex" role="tablist" aria-label="Tipo de registro">
          {(
            [
              ['device', 'Eventos de dispositivos'],
              ['audit', 'Bitácora de incidencias'],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              role="tab"
              aria-selected={tab === key}
              onClick={() =>
                reset(() => {
                  setTab(key);
                  setType('');
                })
              }
              className={`border px-2 py-1 text-[12px] ${tab === key ? 'border-accent bg-accent/15 text-fg' : 'border-line text-fg-muted hover:text-fg'} first:rounded-l-sm last:rounded-r-sm`}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="h-4 w-px bg-line" aria-hidden />
        <div className="flex gap-1" role="group" aria-label="Periodo">
          {RANGES.map((r) => (
            <button
              key={r.label}
              type="button"
              aria-pressed={range === r.ms}
              onClick={() => reset(() => setRange(r.ms))}
              className={`rounded-sm border px-1.5 py-px font-mono text-[11px] ${range === r.ms ? 'border-accent bg-accent/15 text-fg' : 'border-line text-fg-muted hover:text-fg'}`}
            >
              {r.label}
            </button>
          ))}
        </div>
        {tab === 'device' && (
          <select
            value={device}
            onChange={(e) => reset(() => setDevice(e.target.value))}
            className={field}
            aria-label="Dispositivo"
          >
            <option value="">Todos los dispositivos</option>
            {devices.data?.map((d) => (
              <option key={d.device_code} value={d.device_code}>
                {d.device_code}
              </option>
            ))}
          </select>
        )}
        <select
          value={type}
          onChange={(e) => reset(() => setType(e.target.value))}
          className={field}
          aria-label="Tipo de evento"
        >
          <option value="">Todos los tipos</option>
          {(tab === 'device' ? [...CAMERA_EVENT_TYPES, WEATHER_EVENT_TYPE] : AUDIT_TYPES).map(
            (t) => (
              <option key={t} value={t}>
                {tab === 'audit' ? (EVENT_LABEL[t] ?? t) : t}
              </option>
            ),
          )}
        </select>
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-fg-muted">
          {current.isFetching
            ? 'actualizando…'
            : `${total} registros · ${formatTime(window_.from)} → ${formatTime(window_.to)}`}
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        {current.error ? (
          <ErrorLine
            message="No se pudieron cargar los registros."
            onRetry={() => void current.refetch()}
          />
        ) : current.isLoading ? (
          <SkeletonRows rows={12} cols={5} />
        ) : tab === 'device' ? (
          !deviceLog.data?.data.length ? (
            <Empty>Sin eventos en este periodo.</Empty>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wider text-fg-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-1.5 font-medium">Registrado</th>
                  <th className="px-3 py-1.5 font-medium">Recibido</th>
                  <th className="px-3 py-1.5 font-medium">Dispositivo</th>
                  <th className="px-3 py-1.5 font-medium">Evento</th>
                  <th className="px-3 py-1.5 font-medium">Confianza</th>
                  <th className="px-3 py-1.5 font-medium">Sincronía</th>
                  <th className="px-3 py-1.5 font-medium">Datos</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[12px]">
                {deviceLog.data.data.map((e) => (
                  <tr key={e.id} className="border-b border-line">
                    <td className="whitespace-nowrap px-3 py-1">{formatDateTime(e.recorded_at)}</td>
                    <td className="whitespace-nowrap px-3 py-1 text-fg-muted">
                      {formatTime(e.received_at)}
                    </td>
                    <td className="px-3 py-1">{e.device_code}</td>
                    <td className="px-3 py-1">{e.event_type}</td>
                    <td className="px-3 py-1">{e.confidence?.toFixed(2) ?? '—'}</td>
                    <td className="px-3 py-1">
                      <Chip
                        tone={e.synced ? 'ok' : 'warn'}
                        label={e.synced ? 'a tiempo' : 'tarde'}
                      />
                    </td>
                    <td
                      className="max-w-md truncate px-3 py-1 text-fg-muted"
                      title={JSON.stringify(e.payload)}
                    >
                      {payloadSummary(e.payload)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        ) : !audit.data?.data.length ? (
          <Empty>Sin movimientos en este periodo.</Empty>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wider text-fg-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-1.5 font-medium">Fecha</th>
                <th className="px-3 py-1.5 font-medium">Movimiento</th>
                <th className="px-3 py-1.5 font-medium">Incidencia</th>
                <th className="px-3 py-1.5 font-medium">Dispositivo</th>
                <th className="px-3 py-1.5 font-medium">Detalle</th>
              </tr>
            </thead>
            <tbody>
              {audit.data.data.map((e) => (
                <tr key={e.id} className="border-b border-line">
                  <td className="whitespace-nowrap px-3 py-1 font-mono text-[12px]">
                    {formatDateTime(e.created_at)}
                  </td>
                  <td className="px-3 py-1 text-[12px]">
                    {EVENT_LABEL[e.event_type] ?? e.event_type}
                  </td>
                  <td className="px-3 py-1">
                    <span className="flex items-center gap-1.5">
                      <PriorityBadge priority={e.incident_priority} />
                      <span className="text-[12px]">{INCIDENT_TYPE_LABEL[e.incident_type]}</span>
                      <span className="font-mono text-[10px] text-fg-muted">
                        {e.incident_id.slice(0, 8)}
                      </span>
                    </span>
                  </td>
                  <td className="px-3 py-1 font-mono text-[12px]">{e.device_code ?? 'reporte'}</td>
                  <td
                    className="max-w-md truncate px-3 py-1 font-mono text-[11px] text-fg-muted"
                    title={JSON.stringify(e.payload)}
                  >
                    {payloadSummary(e.payload)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex h-8 shrink-0 items-center gap-2 border-t border-line bg-surface px-3 font-mono text-[11px] text-fg-muted">
        <span>
          Página {page} de {pages}
        </span>
        <span className="flex-1" />
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => setPage(page - 1)}
          className="rounded-sm border border-line p-0.5 hover:border-accent disabled:opacity-30"
          aria-label="Página anterior"
        >
          <ChevronLeft size={14} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          disabled={page >= pages}
          onClick={() => setPage(page + 1)}
          className="rounded-sm border border-line p-0.5 hover:border-accent disabled:opacity-30"
          aria-label="Página siguiente"
        >
          <ChevronRight size={14} strokeWidth={1.5} />
        </button>
      </div>
    </section>
  );
}
