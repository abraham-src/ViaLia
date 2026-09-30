import type { IncidentDto, IncidentPriority, IncidentType } from '@simu/shared-types';
import { INCIDENT_PRIORITIES, INCIDENT_TYPES } from '@simu/shared-types';
import { useMemo, useState } from 'react';
import { IncidentStatusChip, PriorityBadge } from '../../components/ui/Chip';
import { Empty, SkeletonRows } from '../../components/ui/Feedback';
import { formatAge } from '../../lib/format';
import { INCIDENT_TYPE_LABEL, PRIORITY_LABEL } from '../../lib/labels';
import { popupHtml } from './popup';
import { incidentsToGeoJSON } from './sources';
import { useMapUi } from './store';

/** Right-hand list of active incidents, filterable, click to fly to it on the map. */
export function IncidentSidePanel({
  incidents,
  loading,
}: {
  incidents: IncidentDto[];
  loading: boolean;
}) {
  const [priorities, setPriorities] = useState<Set<IncidentPriority>>(new Set());
  const [type, setType] = useState<IncidentType | ''>('');
  const focusOn = useMapUi((s) => s.focusOn);

  const filtered = useMemo(
    () =>
      incidents.filter(
        (i) => (priorities.size === 0 || priorities.has(i.priority)) && (!type || i.type === type),
      ),
    [incidents, priorities, type],
  );

  const togglePriority = (p: IncidentPriority) => {
    const next = new Set(priorities);
    if (next.has(p)) next.delete(p);
    else next.add(p);
    setPriorities(next);
  };

  const focus = (i: IncidentDto) => {
    const feature = incidentsToGeoJSON([i]).features[0];
    if (feature) focusOn(i.longitude, i.latitude, popupHtml(feature.properties ?? {}));
  };

  return (
    <aside
      className="hidden min-h-0 flex-col border-l border-line bg-surface xl:flex"
      aria-label="Incidencias activas"
    >
      <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line bg-surface-2 px-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
          Incidencias activas
        </h2>
        <span className="ml-auto font-mono text-[11px] text-fg-muted">
          {filtered.length}/{incidents.length}
        </span>
      </div>
      <div className="space-y-1.5 border-b border-line px-3 py-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por prioridad">
          {[...INCIDENT_PRIORITIES].reverse().map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={priorities.has(p)}
              onClick={() => togglePriority(p)}
              className={`rounded-sm border px-1.5 py-px font-mono text-[11px] uppercase ${
                priorities.has(p)
                  ? 'border-accent bg-accent/15 text-fg'
                  : 'border-line text-fg-muted hover:text-fg'
              }`}
            >
              {PRIORITY_LABEL[p]}
            </button>
          ))}
        </div>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as IncidentType | '')}
          className="w-full rounded-sm border border-line bg-base px-1.5 py-1 text-[12px] text-fg"
          aria-label="Filtrar por tipo"
        >
          <option value="">Todos los tipos</option>
          {INCIDENT_TYPES.map((t) => (
            <option key={t} value={t}>
              {INCIDENT_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {loading ? (
          <SkeletonRows rows={8} cols={2} />
        ) : filtered.length === 0 ? (
          <Empty>Sin incidencias con estos filtros.</Empty>
        ) : (
          <ul className="divide-y divide-line">
            {filtered.map((i) => (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => focus(i)}
                  className="w-full px-3 py-1.5 text-left hover:bg-surface-2 focus-visible:bg-surface-2"
                >
                  <div className="flex items-center gap-1.5">
                    <PriorityBadge priority={i.priority} />
                    <span className="min-w-0 flex-1 truncate text-[12px]">
                      {INCIDENT_TYPE_LABEL[i.type]}
                    </span>
                    <span className="font-mono text-[10px] text-fg-muted">
                      {formatAge(i.created_at)}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className="font-mono text-[11px] text-fg-muted">
                      {i.device_code ?? 'reporte'}
                    </span>
                    <span className="flex-1" />
                    <IncidentStatusChip status={i.status} />
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
