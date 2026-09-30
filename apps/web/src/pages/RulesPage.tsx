import type { IncidentPriority, IncidentType, RuleDto } from '@simu/shared-types';
import { INCIDENT_PRIORITIES, INCIDENT_TYPES } from '@simu/shared-types';
import { Plus, Trash2, X } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Chip, PriorityBadge } from '../components/ui/Chip';
import { Empty, ErrorLine, SkeletonRows } from '../components/ui/Feedback';
import { useDeleteRule, useRules, useSaveRule } from '../hooks/admin';
import { ApiError } from '../lib/api';
import { formatDateTime } from '../lib/format';
import { INCIDENT_TYPE_LABEL, PRIORITY_LABEL } from '../lib/labels';
import { rowActivation } from '../lib/row-activation';
import {
  BOOLEAN_FACTS,
  describeConditions,
  FACT_LABEL,
  OP_LABEL,
  RULE_FACTS,
  RULE_OPERATORS,
  WINDOW_FACTS,
  type RuleCondition,
  type RuleFact,
  type RuleOperator,
} from '../lib/rules-text';
import { useAuth } from '../stores/auth';

interface Draft {
  id: string | null;
  name: string;
  description: string;
  sort_order: number;
  enabled: boolean;
  conditions: RuleCondition[];
  incident_type: IncidentType;
  set_priority: IncidentPriority;
  label: string;
  emit_alert: boolean;
}

const EMPTY: Draft = {
  id: null,
  name: '',
  description: '',
  sort_order: 100,
  enabled: true,
  conditions: [{ fact: 'drain.obstruction_level', op: 'gt', value: 80 }],
  incident_type: 'drain_obstruction',
  set_priority: 'medium',
  label: '',
  emit_alert: true,
};

function toDraft(r: RuleDto): Draft {
  const action = r.action as Record<string, unknown>;
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    sort_order: r.sort_order,
    enabled: r.enabled,
    conditions: ((r.conditions as { all?: RuleCondition[] }).all ?? []).map((c) => ({ ...c })),
    incident_type: (action.incident_type as IncidentType) ?? 'drain_obstruction',
    set_priority: (action.set_priority as IncidentPriority) ?? 'medium',
    label: typeof action.label === 'string' ? action.label : '',
    emit_alert: action.emit_alert !== false,
  };
}

const field = 'rounded-sm border border-line bg-base px-1.5 py-1 text-[12px] text-fg';

function ConditionRow({
  c,
  onChange,
  onRemove,
  removable,
}: {
  c: RuleCondition;
  onChange: (c: RuleCondition) => void;
  onRemove: () => void;
  removable: boolean;
}) {
  const bool = BOOLEAN_FACTS.has(c.fact);
  const setFact = (fact: RuleFact) =>
    onChange({
      fact,
      op: BOOLEAN_FACTS.has(fact) ? 'eq' : 'gt',
      value: BOOLEAN_FACTS.has(fact) ? true : fact === 'camera.confidence' ? 0.8 : 80,
      ...(WINDOW_FACTS.has(fact) && { window: c.window ?? { radius_m: 250, seconds: 900 } }),
    });
  return (
    <div className="space-y-1 border border-line bg-base p-2">
      <div className="flex gap-1.5">
        <select
          value={c.fact}
          onChange={(e) => setFact(e.target.value as RuleFact)}
          className={`${field} min-w-0 flex-1`}
          aria-label="Hecho"
        >
          {RULE_FACTS.map((f) => (
            <option key={f} value={f}>
              {FACT_LABEL[f]}
            </option>
          ))}
        </select>
        <select
          value={c.op}
          onChange={(e) => onChange({ ...c, op: e.target.value as RuleOperator })}
          className={field}
          aria-label="Operador"
        >
          {(bool ? (['eq', 'neq'] as RuleOperator[]) : RULE_OPERATORS).map((o) => (
            <option key={o} value={o}>
              {OP_LABEL[o]}
            </option>
          ))}
        </select>
        {bool ? (
          <select
            value={String(c.value)}
            onChange={(e) => onChange({ ...c, value: e.target.value === 'true' })}
            className={field}
            aria-label="Valor"
          >
            <option value="true">sí</option>
            <option value="false">no</option>
          </select>
        ) : (
          <input
            type="number"
            step={c.fact === 'camera.confidence' ? 0.05 : 1}
            value={Number(c.value)}
            onChange={(e) => onChange({ ...c, value: Number(e.target.value) })}
            className={`${field} w-20 font-mono`}
            aria-label="Valor"
          />
        )}
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            className="text-fg-muted hover:text-critical"
            aria-label="Quitar condición"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        )}
      </div>
      {WINDOW_FACTS.has(c.fact) && c.window && (
        <div className="flex items-center gap-1.5 text-[11px] text-fg-muted">
          radio
          <input
            type="number"
            min={1}
            max={5000}
            value={c.window.radius_m}
            onChange={(e) =>
              onChange({ ...c, window: { ...c.window!, radius_m: Number(e.target.value) } })
            }
            className={`${field} w-16 font-mono`}
            aria-label="Radio en metros"
          />
          m · ventana
          <input
            type="number"
            min={1}
            max={1440}
            value={Math.round(c.window.seconds / 60)}
            onChange={(e) =>
              onChange({ ...c, window: { ...c.window!, seconds: Number(e.target.value) * 60 } })
            }
            className={`${field} w-16 font-mono`}
            aria-label="Ventana en minutos"
          />
          min
        </div>
      )}
    </div>
  );
}

function RuleEditor({ initial, onClose }: { initial: Draft; onClose: () => void }) {
  const [d, setD] = useState<Draft>(initial);
  const save = useSaveRule();
  const remove = useDeleteRule();
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD({ ...d, [k]: v });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate(
      {
        id: d.id,
        input: {
          name: d.name.trim(),
          description: d.description.trim(),
          sort_order: d.sort_order,
          enabled: d.enabled,
          conditions: { all: d.conditions },
          action: {
            incident_type: d.incident_type,
            set_priority: d.set_priority,
            emit_alert: d.emit_alert,
            ...(d.label.trim() && { label: d.label.trim() }),
          },
        },
      },
      { onSuccess: onClose },
    );
  };

  const error = save.error ?? remove.error;
  const message =
    error instanceof ApiError
      ? Array.isArray(error.details)
        ? (error.details as Array<{ path: string; message: string }>)
            .map((x) => `${x.path}: ${x.message}`)
            .join('; ')
        : error.message
      : error
        ? 'No se pudo guardar.'
        : null;

  return (
    <aside
      className="flex min-h-0 flex-col border-l border-line bg-surface"
      aria-label="Editor de regla"
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="flex h-8 shrink-0 items-center border-b border-line bg-surface-2 px-3">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
            {d.id ? 'Editar regla' : 'Nueva regla'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="ml-auto text-fg-muted hover:text-fg"
            aria-label="Cerrar editor"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
        <div className="min-h-0 flex-1 space-y-3 overflow-auto p-3">
          <label className="block">
            <span className="mb-1 block text-[12px] text-fg-muted">Nombre</span>
            <input
              value={d.name}
              onChange={(e) => set('name', e.target.value)}
              className={`${field} w-full`}
              required
              minLength={3}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-fg-muted">Descripción</span>
            <input
              value={d.description}
              onChange={(e) => set('description', e.target.value)}
              className={`${field} w-full`}
              required
              minLength={3}
            />
          </label>
          <div className="flex gap-3">
            <label className="block">
              <span className="mb-1 block text-[12px] text-fg-muted">Orden</span>
              <input
                type="number"
                value={d.sort_order}
                onChange={(e) => set('sort_order', Number(e.target.value))}
                className={`${field} w-20 font-mono`}
              />
            </label>
            <label className="mt-5 flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={d.enabled}
                onChange={(e) => set('enabled', e.target.checked)}
                className="accent-[#1f6feb]"
              />
              Activa
            </label>
          </div>

          <div>
            <div className="mb-1 flex items-center">
              <span className="text-[10px] uppercase tracking-wider text-fg-muted">
                Condiciones (todas deben cumplirse)
              </span>
              <button
                type="button"
                disabled={d.conditions.length >= 10}
                onClick={() =>
                  set('conditions', [
                    ...d.conditions,
                    { fact: 'weather.raining', op: 'eq', value: true },
                  ])
                }
                className="ml-auto inline-flex items-center gap-1 text-[12px] text-fg-muted hover:text-fg disabled:opacity-40"
              >
                <Plus size={12} aria-hidden /> Agregar
              </button>
            </div>
            <div className="space-y-1.5">
              {d.conditions.map((c, i) => (
                <ConditionRow
                  key={i}
                  c={c}
                  removable={d.conditions.length > 1}
                  onChange={(next) =>
                    set(
                      'conditions',
                      d.conditions.map((x, j) => (j === i ? next : x)),
                    )
                  }
                  onRemove={() =>
                    set(
                      'conditions',
                      d.conditions.filter((_, j) => j !== i),
                    )
                  }
                />
              ))}
            </div>
            <p className="mt-1 font-mono text-[11px] text-fg-muted">
              SI {describeConditions({ all: d.conditions })}
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="text-[10px] uppercase tracking-wider text-fg-muted">Acción</span>
            <div className="flex gap-1.5">
              <select
                value={d.incident_type}
                onChange={(e) => set('incident_type', e.target.value as IncidentType)}
                className={`${field} min-w-0 flex-1`}
                aria-label="Tipo de incidencia"
              >
                {INCIDENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {INCIDENT_TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
              <select
                value={d.set_priority}
                onChange={(e) => set('set_priority', e.target.value as IncidentPriority)}
                className={field}
                aria-label="Prioridad"
              >
                {INCIDENT_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </div>
            <input
              value={d.label}
              onChange={(e) => set('label', e.target.value)}
              placeholder="Etiqueta de la alerta, p. ej. RIESGO ALTO"
              maxLength={40}
              className={`${field} w-full`}
            />
            <label className="flex items-center gap-1.5 text-[12px]">
              <input
                type="checkbox"
                checked={d.emit_alert}
                onChange={(e) => set('emit_alert', e.target.checked)}
                className="accent-[#1f6feb]"
              />
              Emitir alerta en tiempo real
            </label>
          </div>
          {message && (
            <p
              role="alert"
              className="border border-danger/50 bg-danger/10 px-2 py-1 text-[12px] text-critical"
            >
              {message}
            </p>
          )}
        </div>
        <div className="flex gap-2 border-t border-line px-3 py-2">
          {d.id && (
            <button
              type="button"
              disabled={remove.isPending}
              onClick={() => {
                if (
                  window.confirm(`¿Eliminar la regla "${d.name}"? El motor dejará de evaluarla.`)
                ) {
                  remove.mutate(d.id!, { onSuccess: onClose });
                }
              }}
              className="inline-flex items-center gap-1 rounded-sm border border-danger/60 px-2 py-1 text-[12px] text-critical hover:bg-danger/10"
            >
              <Trash2 size={12} aria-hidden /> Eliminar
            </button>
          )}
          <span className="flex-1" />
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm border border-line px-3 py-1 text-[12px] hover:border-accent"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={save.isPending}
            className="rounded-sm border border-accent bg-accent px-3 py-1 text-[12px] text-white disabled:opacity-50"
          >
            {save.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </form>
    </aside>
  );
}

/** Spec §7.2 "Reglas": CRUD of the rules engine (admin only). */
export function RulesPage() {
  const isAdmin = useAuth((s) => s.user?.role === 'admin');
  const { data, isLoading, error, refetch } = useRules();
  const save = useSaveRule();
  const [editing, setEditing] = useState<Draft | null>(null);

  return (
    <div
      className={`grid h-full min-h-0 grid-rows-[minmax(0,1fr)] ${editing ? 'grid-cols-[minmax(0,1fr)_440px]' : 'grid-cols-1'}`}
    >
      <section className="flex min-h-0 flex-col">
        <div className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2">
          <h1 className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
            Motor de reglas
          </h1>
          <span className="text-[12px] text-fg-muted">
            Se evalúan en orden con cada lectura, detección de cámara y reporte de clima; gana la
            acción más severa.
          </span>
          <span className="flex-1" />
          {isAdmin && (
            <button
              type="button"
              onClick={() =>
                setEditing({ ...EMPTY, sort_order: (data?.at(-1)?.sort_order ?? 30) + 10 })
              }
              className="inline-flex items-center gap-1 rounded-sm border border-accent bg-accent px-2 py-1 text-[12px] text-white"
            >
              <Plus size={13} strokeWidth={1.5} aria-hidden /> Nueva regla
            </button>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {error ? (
            <ErrorLine message="No se pudieron cargar las reglas." onRetry={() => void refetch()} />
          ) : isLoading ? (
            <SkeletonRows rows={4} cols={5} />
          ) : !data?.length ? (
            <Empty>No hay reglas.</Empty>
          ) : (
            <table className="w-full text-left">
              <thead className="sticky top-0 bg-surface-2 text-[11px] uppercase tracking-wider text-fg-muted">
                <tr className="border-b border-line">
                  <th className="px-3 py-1.5 font-medium">Orden</th>
                  <th className="px-3 py-1.5 font-medium">Regla</th>
                  <th className="px-3 py-1.5 font-medium">Condición (SI …)</th>
                  <th className="px-3 py-1.5 font-medium">Acción</th>
                  <th className="px-3 py-1.5 font-medium">Estado</th>
                  <th className="px-3 py-1.5 font-medium">Actualizada</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => {
                  const action = r.action as {
                    set_priority?: IncidentPriority;
                    incident_type?: IncidentType;
                    label?: string;
                  };
                  return (
                    <tr
                      key={r.id}
                      {...(isAdmin ? rowActivation(() => setEditing(toDraft(r))) : {})}
                      className={`border-b border-line ${isAdmin ? 'cursor-pointer hover:bg-surface-2 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-accent' : ''} ${editing?.id === r.id ? 'bg-accent/10' : ''}`}
                    >
                      <td className="px-3 py-1.5 font-mono text-[12px]">{r.sort_order}</td>
                      <td className="px-3 py-1.5">
                        <div className="text-[13px]">{r.name}</div>
                        <div className="text-[11px] text-fg-muted">{r.description}</div>
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[12px]">
                        {describeConditions(r.conditions)}
                      </td>
                      <td className="px-3 py-1.5">
                        <div className="flex items-center gap-1.5">
                          {action.set_priority && <PriorityBadge priority={action.set_priority} />}
                          <span className="text-[12px]">{action.label ?? ''}</span>
                        </div>
                        <div className="text-[11px] text-fg-muted">
                          {action.incident_type ? INCIDENT_TYPE_LABEL[action.incident_type] : ''}
                        </div>
                      </td>
                      <td className="px-3 py-1.5" onClick={(e) => e.stopPropagation()}>
                        {isAdmin ? (
                          <label className="flex items-center gap-1.5 text-[12px]">
                            <input
                              type="checkbox"
                              role="switch"
                              checked={r.enabled}
                              disabled={save.isPending}
                              onChange={(e) =>
                                save.mutate({ id: r.id, input: { enabled: e.target.checked } })
                              }
                              className="accent-[#1f6feb]"
                              aria-label={`Regla ${r.name} activa`}
                            />
                            {r.enabled ? 'Activa' : 'Inactiva'}
                          </label>
                        ) : (
                          <Chip
                            tone={r.enabled ? 'ok' : 'neutral'}
                            label={r.enabled ? 'Activa' : 'Inactiva'}
                          />
                        )}
                      </td>
                      <td className="px-3 py-1.5 font-mono text-[11px] text-fg-muted">
                        {formatDateTime(r.updated_at)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </section>
      {editing && (
        <RuleEditor key={editing.id ?? 'new'} initial={editing} onClose={() => setEditing(null)} />
      )}
    </div>
  );
}
