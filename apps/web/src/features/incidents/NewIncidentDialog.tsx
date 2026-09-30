import type { IncidentPriority, IncidentType } from '@simu/shared-types';
import { INCIDENT_PRIORITIES, INCIDENT_TYPES } from '@simu/shared-types';
import { Crosshair, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useCreateIncident } from '../../hooks/mutations';
import { ApiError } from '../../lib/api';
import { INCIDENT_TYPE_LABEL, PRIORITY_LABEL } from '../../lib/labels';
import { isStaff, useAuth } from '../../stores/auth';

/** Reference corners from the seed zones (quick picks for the demo). */
const PRESETS = [
  { label: 'Roma Norte · Álvaro Obregón y Orizaba', lat: 19.41866, lng: -99.15972 },
  { label: 'Centro · Madero y Eje Central', lat: 19.4341, lng: -99.14115 },
  { label: 'Condesa · Av. México (Parque México)', lat: 19.4119, lng: -99.1692 },
  { label: 'Coyoacán · Jardín Centenario', lat: 19.3501, lng: -99.1628 },
];

export function NewIncidentDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const staff = isStaff(useAuth((s) => s.user));
  const create = useCreateIncident();
  const dialog = useRef<HTMLDialogElement>(null);
  const [type, setType] = useState<IncidentType>('obstacle');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<IncidentPriority>('medium');
  const [lat, setLat] = useState(String(PRESETS[0]!.lat));
  const [lng, setLng] = useState(String(PRESETS[0]!.lng));
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const useMyLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation)
      return setGeoError('Este navegador no permite obtener la ubicación.');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLat(pos.coords.latitude.toFixed(6));
        setLng(pos.coords.longitude.toFixed(6));
      },
      () => setGeoError('No se pudo obtener tu ubicación.'),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    create.mutate(
      {
        type,
        description: description.trim(),
        latitude: Number(lat),
        longitude: Number(lng),
        ...(staff && { priority }),
      },
      { onSuccess: (incident) => onCreated(incident.id) },
    );
  };

  const field = 'w-full rounded-sm border border-line bg-base px-2 py-1 text-[12px] text-fg';
  const errorMessage =
    create.error instanceof ApiError
      ? create.error.details && Array.isArray(create.error.details)
        ? (create.error.details as Array<{ message: string }>).map((d) => d.message).join('; ')
        : create.error.message
      : create.error
        ? 'No se pudo crear el reporte.'
        : null;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto w-[440px] max-w-[calc(100vw-32px)] border border-line bg-surface p-0 text-fg backdrop:bg-black/60"
      aria-label="Nuevo reporte de incidencia"
    >
      <form onSubmit={submit}>
        <div className="flex h-8 items-center border-b border-line bg-surface-2 px-3">
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
            Nuevo reporte
          </h2>
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="ml-auto text-fg-muted hover:text-fg"
            aria-label="Cerrar"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
        <div className="space-y-2.5 p-3">
          <label className="block">
            <span className="mb-1 block text-[12px] text-fg-muted">Tipo</span>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as IncidentType)}
              className={field}
            >
              {INCIDENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {INCIDENT_TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[12px] text-fg-muted">Descripción</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              maxLength={2000}
              required
              minLength={5}
              placeholder="Qué pasa y dónde exactamente"
              className={`${field} resize-none`}
            />
          </label>
          {staff && (
            <label className="block">
              <span className="mb-1 block text-[12px] text-fg-muted">Prioridad</span>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as IncidentPriority)}
                className={field}
              >
                {INCIDENT_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <div>
            <span className="mb-1 block text-[12px] text-fg-muted">Ubicación</span>
            <select
              onChange={(e) => {
                const p = PRESETS[Number(e.target.value)];
                if (p) {
                  setLat(String(p.lat));
                  setLng(String(p.lng));
                }
              }}
              className={field}
              aria-label="Ubicación de referencia"
            >
              {PRESETS.map((p, i) => (
                <option key={p.label} value={i}>
                  {p.label}
                </option>
              ))}
            </select>
            <div className="mt-1.5 flex gap-1.5">
              <input
                value={lat}
                onChange={(e) => setLat(e.target.value)}
                className={`${field} font-mono`}
                aria-label="Latitud"
                inputMode="decimal"
              />
              <input
                value={lng}
                onChange={(e) => setLng(e.target.value)}
                className={`${field} font-mono`}
                aria-label="Longitud"
                inputMode="decimal"
              />
              <button
                type="button"
                onClick={useMyLocation}
                title="Usar mi ubicación"
                aria-label="Usar mi ubicación"
                className="shrink-0 rounded-sm border border-line px-2 text-fg-muted hover:border-accent hover:text-fg"
              >
                <Crosshair size={14} strokeWidth={1.5} />
              </button>
            </div>
            {geoError && <p className="mt-1 text-[11px] text-warn">{geoError}</p>}
            {!staff && (
              <p className="mt-1 text-[11px] text-fg-muted">
                Operación revisará tu reporte y le asignará prioridad.
              </p>
            )}
          </div>
          {errorMessage && (
            <p
              role="alert"
              className="border border-danger/50 bg-danger/10 px-2 py-1 text-[12px] text-critical"
            >
              {errorMessage}
            </p>
          )}
        </div>
        <div className="flex justify-end gap-2 border-t border-line px-3 py-2">
          <button
            type="button"
            onClick={() => dialog.current?.close()}
            className="rounded-sm border border-line px-3 py-1 text-[12px] hover:border-accent"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={create.isPending || description.trim().length < 5}
            className="rounded-sm border border-accent bg-accent px-3 py-1 text-[12px] text-white disabled:opacity-50"
          >
            {create.isPending ? 'Enviando…' : 'Enviar reporte'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
