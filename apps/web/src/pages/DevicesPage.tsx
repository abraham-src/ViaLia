import type { DeviceDto, DeviceStatus, DeviceType } from '@simu/shared-types';
import { DEVICE_STATUSES, DEVICE_TYPES } from '@simu/shared-types';
import { useMemo, useState } from 'react';
import { DeviceStatusChip, DrainStatusChip } from '../components/ui/Chip';
import { Empty, ErrorLine, SkeletonRows } from '../components/ui/Feedback';
import { Meter } from '../components/ui/Meter';
import { useSetDeviceStatus } from '../hooks/mutations';
import { useDevices } from '../hooks/queries';
import { ApiError } from '../lib/api';
import { formatAge, formatCoords, formatTime } from '../lib/format';
import { DEVICE_STATUS_LABEL, DEVICE_TYPE_LABEL } from '../lib/labels';

function Toggle<T extends string>({
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

function detail(d: DeviceDto) {
  if (d.drain) {
    return (
      <span className="flex items-center gap-2">
        <Meter value={d.drain.obstruction_level} status={d.drain.status} width={64} />
        <span className="w-9 text-right font-mono text-[12px]">{d.drain.obstruction_level} %</span>
        <DrainStatusChip status={d.drain.status} />
      </span>
    );
  }
  if (d.camera) return <span className="text-[12px] text-fg-muted">{d.camera.model}</span>;
  return <span className="text-fg-muted">—</span>;
}

/** Spec §7.2 "Dispositivos": status, last heartbeat, type and location — live. */
export function DevicesPage() {
  const devices = useDevices();
  const setStatus = useSetDeviceStatus();
  const [types, setTypes] = useState<Set<DeviceType>>(new Set());
  const [statuses, setStatuses] = useState<Set<DeviceStatus>>(new Set());

  const toggle = <T,>(set: Set<T>, v: T, apply: (s: Set<T>) => void) => {
    const next = new Set(set);
    if (next.has(v)) next.delete(v);
    else next.add(v);
    apply(next);
  };

  const rows = useMemo(
    () =>
      (devices.data ?? []).filter(
        (d) =>
          (types.size === 0 || types.has(d.type)) &&
          (statuses.size === 0 || statuses.has(d.status)),
      ),
    [devices.data, types, statuses],
  );

  return (
    <section className="flex h-full min-h-0 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
        <div className="flex flex-wrap gap-1" role="group" aria-label="Tipo">
          <Toggle
            values={DEVICE_TYPES.filter((t) => t !== 'sensor')}
            selected={types}
            label={(t) => DEVICE_TYPE_LABEL[t]}
            onToggle={(t) => toggle(types, t, setTypes)}
          />
        </div>
        <span className="h-4 w-px bg-line" aria-hidden />
        <div className="flex flex-wrap gap-1" role="group" aria-label="Estado">
          <Toggle
            values={DEVICE_STATUSES}
            selected={statuses}
            label={(s) => DEVICE_STATUS_LABEL[s]}
            onToggle={(s) => toggle(statuses, s, setStatuses)}
          />
        </div>
        <span className="flex-1" />
        <span className="font-mono text-[11px] text-fg-muted">
          {rows.length}/{devices.data?.length ?? 0} · offline tras 90 s sin heartbeat
        </span>
      </div>

      {setStatus.error && (
        <ErrorLine
          message={
            setStatus.error instanceof ApiError
              ? setStatus.error.message
              : 'No se pudo cambiar el estado.'
          }
        />
      )}

      <div className="min-h-0 flex-1 overflow-auto">
        {devices.error ? (
          <ErrorLine
            message="No se pudieron cargar los dispositivos."
            onRetry={() => void devices.refetch()}
          />
        ) : devices.isLoading ? (
          <SkeletonRows rows={11} cols={7} />
        ) : rows.length === 0 ? (
          <Empty>Sin dispositivos con estos filtros.</Empty>
        ) : (
          <table className="w-full text-left">
            <thead className="sticky top-0 z-10 bg-surface-2 text-[11px] uppercase tracking-wider text-fg-muted">
              <tr className="border-b border-line">
                <th className="px-3 py-1.5 font-medium">Código</th>
                <th className="px-3 py-1.5 font-medium">Tipo</th>
                <th className="px-3 py-1.5 font-medium">Nombre</th>
                <th className="px-3 py-1.5 font-medium">Estado</th>
                <th className="px-3 py-1.5 font-medium">Último heartbeat</th>
                <th className="px-3 py-1.5 font-medium">Zona</th>
                <th className="px-3 py-1.5 font-medium">Coordenadas</th>
                <th className="px-3 py-1.5 font-medium">Lectura / modelo</th>
                <th className="px-3 py-1.5 font-medium">Mantenimiento</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((d) => (
                <tr
                  key={`${d.device_code}-${d.status}`}
                  className="animate-fade-in border-b border-line"
                >
                  <td className="px-3 py-1.5 font-mono text-[12px]">{d.device_code}</td>
                  <td className="px-3 py-1.5">{DEVICE_TYPE_LABEL[d.type]}</td>
                  <td className="max-w-64 truncate px-3 py-1.5 text-fg-muted" title={d.name}>
                    {d.name}
                  </td>
                  <td className="px-3 py-1.5">
                    <DeviceStatusChip status={d.status} />
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[12px]">
                    {formatTime(d.last_heartbeat)}{' '}
                    <span className="text-fg-muted">· {formatAge(d.last_heartbeat)}</span>
                  </td>
                  <td className="px-3 py-1.5 text-[12px] text-fg-muted">
                    {String(d.metadata.zone_name ?? '—')}
                  </td>
                  <td className="whitespace-nowrap px-3 py-1.5 font-mono text-[11px] text-fg-muted">
                    {formatCoords(d.latitude, d.longitude)}
                  </td>
                  <td className="px-3 py-1.5">{detail(d)}</td>
                  <td className="px-3 py-1.5">
                    <button
                      type="button"
                      disabled={setStatus.isPending}
                      onClick={() =>
                        setStatus.mutate({
                          code: d.device_code,
                          status: d.status === 'maintenance' ? 'online' : 'maintenance',
                          reason:
                            d.status === 'maintenance'
                              ? 'fin de mantenimiento'
                              : 'mantenimiento programado',
                        })
                      }
                      className="rounded-sm border border-line px-2 py-0.5 text-[12px] hover:border-accent disabled:opacity-40"
                    >
                      {d.status === 'maintenance' ? 'Reactivar' : 'Poner en mantenimiento'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
