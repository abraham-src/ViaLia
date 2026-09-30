import type {
  IncidentDto,
  IncidentPriority,
  IncidentStatus,
  IncidentType,
} from '@simu/shared-types';
import { INCIDENT_PRIORITIES, INCIDENT_STATUSES, INCIDENT_TYPES } from '@simu/shared-types';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Plus, Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { IncidentStatusChip, PriorityBadge } from '../components/ui/Chip';
import { Empty, ErrorLine, SkeletonRows } from '../components/ui/Feedback';
import { IncidentDetail } from '../features/incidents/IncidentDetail';
import { NewIncidentDialog } from '../features/incidents/NewIncidentDialog';
import { useIncidents } from '../hooks/queries';
import { formatAge } from '../lib/format';
import {
  ACTIVE_INCIDENT_STATUSES,
  INCIDENT_STATUS_LABEL,
  INCIDENT_TYPE_LABEL,
  PRIORITY_LABEL,
} from '../lib/labels';
import { rowActivation } from '../lib/row-activation';
import { useAuth } from '../stores/auth';

const PAGE_SIZE = 25;
type SortKey = 'created_at' | 'priority';

function csvSet<T extends string>(value: string | null): Set<T> {
  return new Set((value ? value.split(',') : []) as T[]);
}

function ChipToggle<T extends string>({
  values,
  selected,
  label,
  onToggle,
}: {
  values: readonly T[];
  selected: Set<T>;
  label: (v: T) => string;
  onToggle: (v: T) => void;
}) {
  return (
    <>
      {values.map((v) => (
        <button
          key={v}
          type="button"
          aria-pressed={selected.has(v)}
          onClick={() => onToggle(v)}
          className={`rounded-sm border px-1.5 py-px font-mono text-[11px] uppercase ${
            selected.has(v)
              ? 'border-accent bg-accent/15 text-fg'
              : 'border-line text-fg-muted hover:text-fg'
          }`}
        >
          {label(v)}
        </button>
      ))}
    </>
  );
}

/** Spec §7.2 "Incidencias": dense table · filters · sort · pagination · actions. */
export function IncidentsPage() {
  const user = useAuth((s) => s.user);
  const [params, setParams] = useSearchParams();
  const [showNew, setShowNew] = useState(false);
  const [search, setSearch] = useState(params.get('q') ?? '');

  // Filters live in the URL: shareable, and they survive reloads.
  const statuses = csvSet<IncidentStatus>(
    params.get('status') ?? ACTIVE_INCIDENT_STATUSES.join(','),
  );
  const priorities = csvSet<IncidentPriority>(params.get('priority'));
  const type = (params.get('type') ?? '') as IncidentType | '';
  const mine = params.get('mine') === '1';
  const sort = (params.get('sort') ?? '-priority') as `${'' | '-'}${SortKey}`;
  const page = Math.max(1, Number(params.get('page') ?? 1));
  const selected = params.get('id');

  const update = (patch: Record<string, string | null>, resetPage = true) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (resetPage && !('page' in patch)) next.delete('page');
    setParams(next, { replace: true });
  };

  // Debounced search.
  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((params.get('q') ?? '') !== search) update({ q: search.trim() || null });
    }, 350);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to typing
  }, [search]);

  const toggleIn = <T extends string>(key: string, set: Set<T>, v: T) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    update({ [key]: [...next].join(',') || (key === 'status' ? 'all' : null) });
  };

  const query = {
    status:
      [...statuses].filter((s) => (INCIDENT_STATUSES as readonly string[]).includes(s)).join(',') ||
      undefined,
    priority: [...priorities].join(',') || undefined,
    type: type || undefined,
    q: params.get('q') || undefined,
    assigned_to: mine ? 'me' : undefined,
    sort,
    page,
    page_size: PAGE_SIZE,
  };
  const { data, isLoading, isFetching, error, refetch } = useIncidents(query);
  const total = data?.meta.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const rows: IncidentDto[] = data?.data ?? [];

  const sortBy = (key: SortKey) => update({ sort: sort === `-${key}` ? key : `-${key}` });
  const sortIcon = (key: SortKey) =>
    sort.endsWith(key) ? (
      sort.startsWith('-') ? (
        <ArrowDown size={11} aria-hidden />
      ) : (
        <ArrowUp size={11} aria-hidden />
      )
    ) : null;

  const summary = useMemo(
    () => (data ? `${total} resultado${total === 1 ? '' : 's'}` : ''),
    [data, total],
  );

  return (
    <div
      className={`grid h-full min-h-0 grid-rows-[minmax(0,1fr)] ${selected ? 'grid-cols-[minmax(0,1fr)_400px]' : 'grid-cols-1'}`}
    >
      <section className="flex min-h-0 flex-col">
        {/* Toolbar: all filters in one row above the table */}
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <div className="relative">
            <Search
              size={13}
              strokeWidth={1.5}
              className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-fg-muted"
              aria-hidden
            />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar en descripción"
              aria-label="Buscar en descripción"
              className="w-56 rounded-sm border border-line bg-base py-1 pl-7 pr-2 text-[12px] text-fg"
            />
          </div>
          <span className="h-4 w-px bg-line" aria-hidden />
          <div className="flex flex-wrap gap-1" role="group" aria-label="Estado">
            <ChipToggle
              values={INCIDENT_STATUSES}
              selected={statuses}
              label={(s) => INCIDENT_STATUS_LABEL[s]}
              onToggle={(s) => toggleIn('status', statuses, s)}
            />
          </div>
          <span className="h-4 w-px bg-line" aria-hidden />
          <div className="flex flex-wrap gap-1" role="group" aria-label="Prioridad">
            <ChipToggle
              values={[...INCIDENT_PRIORITIES].reverse()}
              selected={priorities}
              label={(p) => PRIORITY_LABEL[p]}
              onToggle={(p) => toggleIn('priority', priorities, p)}
            />
          </div>
          <select
            value={type}
            onChange={(e) => update({ type: e.target.value || null })}
            aria-label="Tipo"
            className="rounded-sm border border-line bg-base px-1.5 py-1 text-[12px] text-fg"
          >
            <option value="">Todos los tipos</option>
            {INCIDENT_TYPES.map((t) => (
              <option key={t} value={t}>
                {INCIDENT_TYPE_LABEL[t]}
              </option>
            ))}
          </select>
          {user?.role === 'maintenance' && (
            <label className="flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={mine}
                onChange={() => update({ mine: mine ? null : '1' })}
                className="accent-[#1f6feb]"
              />
              Solo mis asignaciones
            </label>
          )}
          <span className="flex-1" />
          <span className="font-mono text-[11px] text-fg-muted">
            {isFetching ? 'actualizando…' : summary}
          </span>
          <button
            type="button"
            onClick={() => setShowNew(true)}
            className="inline-flex items-center gap-1 rounded-sm border border-accent bg-accent px-2 py-1 text-[12px] text-white"
          >
            <Plus size={13} strokeWidth={1.5} aria-hidden /> Nuevo reporte
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto">
          {error ? (
            <ErrorLine
              message="No se pudieron cargar las incidencias."
              onRetry={() => void refetch()}
            />
          ) : isLoading ? (
            <SkeletonRows rows={12} cols={6} />
          ) : rows.length === 0 ? (
            <Empty>Sin incidencias con estos filtros.</Empty>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 z-10 bg-surface-2 text-[11px] uppercase tracking-wider text-fg-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-1.5 font-medium">
                    <button
                      type="button"
                      onClick={() => sortBy('priority')}
                      className="inline-flex items-center gap-1 uppercase hover:text-fg"
                    >
                      Prioridad {sortIcon('priority')}
                    </button>
                  </th>
                  <th className="px-3 py-1.5 font-medium">Tipo</th>
                  <th className="px-3 py-1.5 font-medium">Descripción</th>
                  <th className="px-3 py-1.5 font-medium">Dispositivo</th>
                  <th className="px-3 py-1.5 font-medium">Estado</th>
                  <th className="px-3 py-1.5 font-medium">Asignada a</th>
                  <th className="px-3 py-1.5 font-medium">
                    <button
                      type="button"
                      onClick={() => sortBy('created_at')}
                      className="inline-flex items-center gap-1 uppercase hover:text-fg"
                    >
                      Creada {sortIcon('created_at')}
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((i) => (
                  <tr
                    // Remount on update → subtle fade-in marks rows that just changed live.
                    key={`${i.id}-${i.updated_at}`}
                    {...rowActivation(() => update({ id: i.id }, false))}
                    aria-selected={selected === i.id}
                    className={`animate-fade-in cursor-pointer border-b border-line hover:bg-surface-2 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent ${
                      selected === i.id ? 'bg-accent/10' : ''
                    }`}
                  >
                    <td className="px-3 py-1.5">
                      <PriorityBadge priority={i.priority} />
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5">{INCIDENT_TYPE_LABEL[i.type]}</td>
                    <td
                      className="max-w-md truncate px-3 py-1.5 text-fg-muted"
                      title={i.description}
                    >
                      {i.description}
                    </td>
                    <td className="px-3 py-1.5 font-mono text-[12px]">
                      {i.device_code ?? 'reporte'}
                    </td>
                    <td className="px-3 py-1.5">
                      <IncidentStatusChip status={i.status} />
                    </td>
                    <td className="px-3 py-1.5 text-[12px] text-fg-muted">
                      {i.assigned_to?.name ?? '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[12px] text-fg-muted">
                      {formatAge(i.created_at)}
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
            onClick={() => update({ page: String(page - 1) }, false)}
            className="rounded-sm border border-line p-0.5 hover:border-accent disabled:opacity-30"
            aria-label="Página anterior"
          >
            <ChevronLeft size={14} strokeWidth={1.5} />
          </button>
          <button
            type="button"
            disabled={page >= pages}
            onClick={() => update({ page: String(page + 1) }, false)}
            className="rounded-sm border border-line p-0.5 hover:border-accent disabled:opacity-30"
            aria-label="Página siguiente"
          >
            <ChevronRight size={14} strokeWidth={1.5} />
          </button>
        </div>
      </section>

      {selected && (
        <IncidentDetail key={selected} id={selected} onClose={() => update({ id: null }, false)} />
      )}
      {showNew && (
        <NewIncidentDialog
          onClose={() => setShowNew(false)}
          onCreated={(id) => {
            setShowNew(false);
            update({ id, status: 'pending,validated,assigned,in_progress' }, false);
          }}
        />
      )}
    </div>
  );
}
