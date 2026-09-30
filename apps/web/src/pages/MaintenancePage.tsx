import type { IncidentDto } from '@simu/shared-types';
import { availableActions } from '@simu/shared-utils';
import { ExternalLink } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PriorityBadge } from '../components/ui/Chip';
import { Empty, ErrorLine, SkeletonRows } from '../components/ui/Feedback';
import { useAcceptIncident } from '../hooks/admin';
import { useIncidentAction } from '../hooks/mutations';
import { useIncidents } from '../hooks/queries';
import { ApiError } from '../lib/api';
import { formatAge, formatTime } from '../lib/format';
import { INCIDENT_TYPE_LABEL } from '../lib/labels';
import { useAuth } from '../stores/auth';

type Column = 'pendiente' | 'aceptada' | 'atencion' | 'resuelta';

const COLUMNS: Array<{ key: Column; title: string; hint: string }> = [
  { key: 'pendiente', title: 'Pendiente', hint: 'asignada, sin aceptar' },
  { key: 'aceptada', title: 'Aceptada', hint: 'la cuadrilla la tomó' },
  { key: 'atencion', title: 'En atención', hint: 'trabajo en sitio' },
  { key: 'resuelta', title: 'Resuelta', hint: 'últimas 24 h' },
];

const accepted = (i: IncidentDto) => typeof i.metadata.accepted_at === 'string';

function columnOf(i: IncidentDto): Column | null {
  if (i.status === 'assigned') return accepted(i) ? 'aceptada' : 'pendiente';
  if (i.status === 'in_progress') return 'atencion';
  if (
    i.status === 'resolved' &&
    i.resolved_at &&
    Date.now() - Date.parse(i.resolved_at) < 24 * 3600_000
  ) {
    return 'resuelta';
  }
  return null;
}

/** Spec §7.2 "Mantenimiento": PENDIENTE → ACEPTADA → EN ATENCIÓN → RESUELTA. */
export function MaintenancePage() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const mine = user?.role === 'maintenance';
  const { data, isLoading, error, refetch } = useIncidents({
    status: 'assigned,in_progress,resolved',
    assigned_to: mine ? 'me' : undefined,
    sort: '-priority',
    page_size: 200,
  });
  const accept = useAcceptIncident();
  const action = useIncidentAction();
  const [notes, setNotes] = useState<Record<string, string>>({});

  const byColumn = new Map<Column, IncidentDto[]>(COLUMNS.map((c) => [c.key, []]));
  for (const i of data?.data ?? []) {
    const col = columnOf(i);
    if (col) byColumn.get(col)!.push(i);
  }
  const mutationError = accept.error ?? action.error;

  const card = (i: IncidentDto, col: Column) => {
    const actions = user
      ? availableActions(user, { status: i.status, assignedToId: i.assigned_to?.id ?? null })
      : [];
    const canAccept =
      col === 'pendiente' && user && (i.assigned_to?.id === user.id || user.role === 'admin');
    const busy = accept.isPending || action.isPending;
    return (
      <li key={`${i.id}-${i.updated_at}`} className="animate-fade-in border border-line bg-base">
        <div className="flex items-center gap-1.5 border-b border-line px-2 py-1">
          <PriorityBadge priority={i.priority} />
          <span className="min-w-0 flex-1 truncate text-[12px] font-medium">
            {INCIDENT_TYPE_LABEL[i.type]}
          </span>
          <button
            type="button"
            onClick={() => navigate(`/incidencias?id=${i.id}&status=all`)}
            className="text-fg-muted hover:text-fg"
            aria-label="Abrir detalle"
            title="Abrir detalle"
          >
            <ExternalLink size={12} strokeWidth={1.5} />
          </button>
        </div>
        <div className="space-y-1 px-2 py-1.5">
          <p className="line-clamp-2 text-[12px] text-fg-muted" title={i.description}>
            {i.description}
          </p>
          <div className="flex flex-wrap gap-x-3 font-mono text-[10px] text-fg-muted">
            <span>{i.device_code ?? 'reporte'}</span>
            <span>creada {formatAge(i.created_at)}</span>
            {accepted(i) && <span>aceptada {formatTime(String(i.metadata.accepted_at))}</span>}
            {i.resolved_at && <span>resuelta {formatTime(i.resolved_at)}</span>}
            {!mine && i.assigned_to && <span>{i.assigned_to.name}</span>}
          </div>
          {(canAccept || actions.includes('start') || actions.includes('resolve')) &&
            col !== 'resuelta' && (
              <div className="space-y-1 pt-1">
                {col === 'atencion' && (
                  <input
                    value={notes[i.id] ?? ''}
                    onChange={(e) => setNotes({ ...notes, [i.id]: e.target.value })}
                    placeholder="Nota de cierre (opcional)"
                    maxLength={1000}
                    className="w-full rounded-sm border border-line bg-surface px-1.5 py-0.5 text-[12px] text-fg"
                  />
                )}
                <div className="flex gap-1.5">
                  {canAccept && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => accept.mutate(i.id)}
                      className="rounded-sm border border-accent bg-accent px-2 py-0.5 text-[12px] text-white disabled:opacity-40"
                    >
                      Aceptar
                    </button>
                  )}
                  {col === 'aceptada' && actions.includes('start') && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => action.mutate({ id: i.id, action: 'start' })}
                      className="rounded-sm border border-accent bg-accent px-2 py-0.5 text-[12px] text-white disabled:opacity-40"
                    >
                      Iniciar atención
                    </button>
                  )}
                  {col === 'atencion' && actions.includes('resolve') && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        action.mutate({ id: i.id, action: 'resolve', note: notes[i.id] })
                      }
                      className="rounded-sm border border-ok bg-ok px-2 py-0.5 text-[12px] text-white disabled:opacity-40"
                    >
                      Resolver
                    </button>
                  )}
                </div>
              </div>
            )}
        </div>
      </li>
    );
  };

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2">
        <h1 className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
          {mine ? 'Mis asignaciones' : 'Tablero de mantenimiento'}
        </h1>
        <span className="font-mono text-[11px] text-fg-muted">
          Pendiente → Aceptada → En atención → Resuelta
        </span>
      </div>
      {mutationError && (
        <ErrorLine
          message={
            mutationError instanceof ApiError
              ? mutationError.message
              : 'No se pudo completar la acción.'
          }
        />
      )}
      {error ? (
        <ErrorLine
          message="No se pudieron cargar las asignaciones."
          onRetry={() => void refetch()}
        />
      ) : isLoading ? (
        <SkeletonRows rows={8} cols={4} />
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 overflow-auto p-3 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((c) => {
            const items = byColumn.get(c.key) ?? [];
            return (
              <div key={c.key} className="flex min-h-0 flex-col border border-line bg-surface">
                <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line bg-surface-2 px-3">
                  <h2 className="text-[11px] font-medium uppercase tracking-wider">{c.title}</h2>
                  <span className="font-mono text-[11px] text-fg-muted">{items.length}</span>
                  <span className="ml-auto text-[10px] text-fg-muted">{c.hint}</span>
                </div>
                <ul className="min-h-0 flex-1 space-y-2 overflow-auto p-2">
                  {items.length === 0 ? (
                    <Empty>Sin incidencias.</Empty>
                  ) : (
                    items.map((i) => card(i, c.key))
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
