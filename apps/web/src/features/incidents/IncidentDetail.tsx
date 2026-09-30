import type { IncidentDto, IncidentEventDto, IncidentPriority } from '@simu/shared-types';
import { INCIDENT_PRIORITIES } from '@simu/shared-types';
import { availableActions, type IncidentAction } from '@simu/shared-utils';
import { MapPin, X } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { IncidentStatusChip, PriorityBadge } from '../../components/ui/Chip';
import { Empty, ErrorLine, SkeletonRows } from '../../components/ui/Feedback';
import {
  useAssignees,
  useIncident,
  useIncidentAction,
  useIncidentEvents,
  useSetPriority,
} from '../../hooks/mutations';
import { useAcceptIncident } from '../../hooks/admin';
import { ApiError } from '../../lib/api';
import { formatAge, formatCoords, formatDateTime, formatTime } from '../../lib/format';
import { INCIDENT_TYPE_LABEL, PRIORITY_LABEL, ROLE_LABEL } from '../../lib/labels';
import { ACTION_LABEL, EVENT_LABEL } from '../../lib/workflow-labels';
import { useAuth } from '../../stores/auth';
import { popupHtml } from '../map/popup';
import { incidentsToGeoJSON } from '../map/sources';
import { useMapUi } from '../map/store';

const PRIMARY: ReadonlySet<IncidentAction> = new Set(['validate', 'start', 'resolve']);

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-fg-muted">{label}</dt>
      <dd className="min-w-0 font-mono text-[12px]">{children}</dd>
    </>
  );
}

function describePayload(e: IncidentEventDto): string {
  const p = e.payload as Record<string, unknown>;
  const parts: string[] = [];
  if (typeof p.label === 'string') parts.push(p.label);
  if (typeof p.from === 'string' && typeof p.to === 'string') parts.push(`${p.from} → ${p.to}`);
  if (typeof p.note === 'string') parts.push(`“${p.note}”`);
  if (typeof p.source === 'string' && e.event_type === 'created') parts.push(`origen ${p.source}`);
  if (typeof p.confidence === 'number') parts.push(`confianza ${p.confidence.toFixed(2)}`);
  const actor = p.actor as { role?: string } | undefined;
  if (actor?.role && actor.role in ROLE_LABEL)
    parts.push(ROLE_LABEL[actor.role as keyof typeof ROLE_LABEL]);
  const changes = p.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  if (changes)
    for (const [k, v] of Object.entries(changes))
      parts.push(`${k}: ${String(v.from)} → ${String(v.to)}`);
  return parts.join(' · ');
}

export function IncidentDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const user = useAuth((s) => s.user);
  const canSeeLog = user?.role !== 'citizen';
  const isTriage = user?.role === 'admin' || user?.role === 'operator';
  const incident = useIncident(id);
  const events = useIncidentEvents(id, canSeeLog);
  const assignees = useAssignees(isTriage);
  const action = useIncidentAction();
  const accept = useAcceptIncident();
  const setPriority = useSetPriority();
  const navigate = useNavigate();
  const focusOn = useMapUi((s) => s.focusOn);
  const [note, setNote] = useState('');
  const [assignee, setAssignee] = useState('');

  const i: IncidentDto | undefined = incident.data;
  const actions =
    i && user
      ? availableActions(user, { status: i.status, assignedToId: i.assigned_to?.id ?? null })
      : [];
  const error = action.error ?? setPriority.error;

  const run = (a: IncidentAction) => {
    if (!i) return;
    if (a === 'assign' && !assignee) return;
    const sent = note;
    action.mutate(
      { id: i.id, action: a, note: sent, ...(a === 'assign' && { assigneeId: assignee }) },
      // Clear only what was sent: a note typed while the request was in flight survives.
      { onSuccess: () => setNote((current) => (current === sent ? '' : current)) },
    );
  };

  const showOnMap = () => {
    if (!i) return;
    const f = incidentsToGeoJSON([i]).features[0];
    focusOn(i.longitude, i.latitude, popupHtml(f?.properties ?? {}));
    navigate('/mapa');
  };

  return (
    <aside
      className="flex min-h-0 flex-col border-l border-line bg-surface"
      aria-label="Detalle de incidencia"
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line bg-surface-2 px-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">Detalle</h2>
        <span className="font-mono text-[11px] text-fg-muted">{id.slice(0, 8)}</span>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-fg-muted hover:text-fg"
          aria-label="Cerrar detalle"
        >
          <X size={14} strokeWidth={1.5} />
        </button>
      </div>

      {incident.isLoading ? (
        <SkeletonRows rows={6} cols={2} />
      ) : incident.error || !i ? (
        <ErrorLine
          message="No se pudo cargar la incidencia."
          onRetry={() => void incident.refetch()}
        />
      ) : (
        <div className="min-h-0 flex-1 overflow-auto">
          <div className="space-y-2 border-b border-line px-3 py-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <PriorityBadge priority={i.priority} />
              <IncidentStatusChip status={i.status} />
              <span className="font-medium">{INCIDENT_TYPE_LABEL[i.type]}</span>
            </div>
            <p className="text-[12px] text-fg-muted">{i.description}</p>
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[12px]">
              <Field label="Dispositivo">{i.device_code ?? 'reporte ciudadano'}</Field>
              <Field label="Confianza">{i.confidence.toFixed(2)}</Field>
              <Field label="Asignada a">{i.assigned_to?.name ?? '—'}</Field>
              <Field label="Creada">
                {formatDateTime(i.created_at)}{' '}
                <span className="text-fg-muted">· {formatAge(i.created_at)}</span>
              </Field>
              <Field label="Validada">{formatDateTime(i.validated_at)}</Field>
              <Field label="Resuelta">{formatDateTime(i.resolved_at)}</Field>
              <Field label="Coordenadas">{formatCoords(i.latitude, i.longitude)}</Field>
              {typeof i.metadata.label === 'string' && (
                <Field label="Regla">{i.metadata.label}</Field>
              )}
            </dl>
            <button
              type="button"
              onClick={showOnMap}
              className="inline-flex items-center gap-1 rounded-sm border border-line px-2 py-0.5 text-[12px] hover:border-accent"
            >
              <MapPin size={12} strokeWidth={1.5} aria-hidden /> Ver en mapa
            </button>
          </div>

          {i.status === 'assigned' &&
            typeof i.metadata.accepted_at !== 'string' &&
            user &&
            (i.assigned_to?.id === user.id || user.role === 'admin') && (
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <span className="text-[12px] text-fg-muted">
                  Pendiente de aceptar por mantenimiento
                </span>
                <button
                  type="button"
                  disabled={accept.isPending}
                  onClick={() => accept.mutate(i.id)}
                  className="ml-auto rounded-sm border border-accent bg-accent px-2 py-1 text-[12px] text-white disabled:opacity-40"
                >
                  Aceptar
                </button>
              </div>
            )}

          {actions.length > 0 && (
            <div className="space-y-2 border-b border-line px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-fg-muted">Acciones</div>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Nota para la bitácora (opcional)"
                rows={2}
                maxLength={1000}
                className="w-full resize-none rounded-sm border border-line bg-base px-2 py-1 text-[12px] text-fg"
              />
              {actions.includes('assign') && (
                <div className="flex gap-1.5">
                  <select
                    value={assignee}
                    onChange={(e) => setAssignee(e.target.value)}
                    className="min-w-0 flex-1 rounded-sm border border-line bg-base px-1.5 py-1 text-[12px] text-fg"
                    aria-label="Personal de mantenimiento"
                  >
                    <option value="">Asignar a…</option>
                    {assignees.data?.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!assignee || action.isPending}
                    onClick={() => run('assign')}
                    className="rounded-sm border border-line px-2 py-1 text-[12px] hover:border-accent disabled:opacity-40"
                  >
                    {ACTION_LABEL.assign}
                  </button>
                </div>
              )}
              <div className="flex flex-wrap gap-1.5">
                {actions
                  .filter((a) => a !== 'assign')
                  .map((a) => (
                    <button
                      key={a}
                      type="button"
                      disabled={action.isPending}
                      onClick={() => run(a)}
                      className={`rounded-sm border px-2 py-1 text-[12px] disabled:opacity-40 ${
                        PRIMARY.has(a)
                          ? 'border-accent bg-accent text-white'
                          : a === 'reject'
                            ? 'border-danger/60 text-critical hover:bg-danger/10'
                            : 'border-line hover:border-accent'
                      }`}
                    >
                      {ACTION_LABEL[a]}
                    </button>
                  ))}
              </div>
            </div>
          )}

          {isTriage && i.status !== 'resolved' && i.status !== 'rejected' && (
            <div className="flex items-center gap-1.5 border-b border-line px-3 py-2">
              <span className="text-[12px] text-fg-muted">Prioridad</span>
              <select
                value={i.priority}
                disabled={setPriority.isPending}
                onChange={(e) =>
                  setPriority.mutate({ id: i.id, priority: e.target.value as IncidentPriority })
                }
                className="rounded-sm border border-line bg-base px-1.5 py-0.5 text-[12px] text-fg"
                aria-label="Cambiar prioridad"
              >
                {INCIDENT_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
          )}

          {error && (
            <ErrorLine
              message={
                error instanceof ApiError ? error.message : 'La acción no se pudo completar.'
              }
            />
          )}

          {canSeeLog && (
            <div className="px-3 py-2">
              <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-muted">
                Bitácora
              </div>
              {events.isLoading ? (
                <SkeletonRows rows={3} cols={2} />
              ) : !events.data?.length ? (
                <Empty>Sin eventos.</Empty>
              ) : (
                <ol className="relative space-y-2 border-l border-line pl-3">
                  {events.data.map((e) => (
                    <li key={e.id} className="relative animate-fade-in">
                      <span
                        className="absolute -left-[16px] top-1.5 size-1.5 bg-accent"
                        aria-hidden
                      />
                      <div className="flex items-baseline gap-2">
                        <span className="text-[12px]">
                          {EVENT_LABEL[e.event_type] ?? e.event_type}
                        </span>
                        <time
                          className="ml-auto font-mono text-[11px] text-fg-muted"
                          title={e.created_at}
                        >
                          {formatTime(e.created_at)}
                        </time>
                      </div>
                      <p className="font-mono text-[11px] text-fg-muted">{describePayload(e)}</p>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
