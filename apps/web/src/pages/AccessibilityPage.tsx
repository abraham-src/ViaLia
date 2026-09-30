import type { AccessibleRouteDto, ListResponse, RouteComputation } from '@simu/shared-types';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Accessibility,
  ArrowDownUp,
  Crosshair,
  Footprints,
  Route as RouteIcon,
  Save,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Chip } from '../components/ui/Chip';
import { ErrorLine } from '../components/ui/Feedback';
import { routeBounds, routeOverlay, type LngLat } from '../features/accessibility/route-overlay';
import type { LayerKey } from '../features/map/layers';
import { MapView, type MapSources } from '../features/map/MapView';
import {
  EMPTY_FC,
  incidentsToGeoJSON,
  pointsToGeoJSON,
  routesToGeoJSON,
} from '../features/map/sources';
import { useAccessibilityPoints, useIncidents } from '../hooks/queries';
import { api, ApiError, qs } from '../lib/api';
import { formatCoords } from '../lib/format';
import { ACTIVE_INCIDENT_STATUSES } from '../lib/labels';

/** Real corners (from the OSM network) for quick picks. */
const PLACES: ReadonlyArray<{ label: string; at: LngLat }> = [
  { label: 'Roma Norte · Orizaba y Colima', at: [-99.160194, 19.41985] },
  { label: 'Roma Norte · Álvaro Obregón y Orizaba', at: [-99.15981, 19.418376] },
  { label: 'Roma Norte · Álvaro Obregón y Córdoba', at: [-99.158511, 19.418423] },
  { label: 'Roma Norte · Álvaro Obregón y Mérida', at: [-99.157323, 19.418656] },
  { label: 'Roma Norte · Insurgentes y Álvaro Obregón', at: [-99.164942, 19.417175] },
  { label: 'Centro · Madero y Eje Central', at: [-99.140869, 19.434132] },
  { label: 'Centro · 5 de Mayo y Monte de Piedad', at: [-99.134016, 19.433965] },
  { label: 'Condesa · Av. México y Michoacán', at: [-99.16887, 19.411067] },
  { label: 'Condesa · Av. México y Sonora', at: [-99.167986, 19.413131] },
  { label: 'Coyoacán · Centenario y Francisco Sosa', at: [-99.164246, 19.349217] },
  { label: 'Coyoacán · Allende y Malintzin', at: [-99.161927, 19.352206] },
];

/** The accessibility view shows the city's accessibility layers, not device internals. */
const LAYERS: Partial<Record<LayerKey, boolean>> = {
  cameras: false,
  traffic_lights: false,
  drains: false,
  sensor_state: false,
  device_state: false,
  flood_zones: false,
  routes: false,
  incidents: true,
  ramps: true,
  sidewalks: true,
  crosswalks: true,
  obstacles: true,
};
const HIDDEN: LayerKey[] = [];

interface RouteReq {
  origin: LngLat;
  destination: LngLat;
  accessible: boolean;
}

const lngLatParam = (p: LngLat) => `${p[0].toFixed(6)},${p[1].toFixed(6)}`;

function PlaceField({
  label,
  value,
  onChange,
  picking,
  onPick,
}: {
  label: 'A' | 'B';
  value: LngLat;
  onChange: (v: LngLat) => void;
  picking: boolean;
  onPick: () => void;
}) {
  const preset = PLACES.findIndex((p) => p.at[0] === value[0] && p.at[1] === value[1]);
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <span className="flex size-4 items-center justify-center rounded-full bg-fg font-mono text-[10px] text-base">
          {label}
        </span>
        <span className="text-[12px] text-fg-muted">{label === 'A' ? 'Origen' : 'Destino'}</span>
      </div>
      <div className="flex gap-1.5">
        <select
          value={preset}
          onChange={(e) => {
            const p = PLACES[Number(e.target.value)];
            if (p) onChange(p.at);
          }}
          aria-label={label === 'A' ? 'Origen' : 'Destino'}
          className="min-w-0 flex-1 rounded-sm border border-line bg-base px-1.5 py-1 text-[12px] text-fg"
        >
          {preset === -1 && (
            <option value={-1}>Punto en el mapa · {formatCoords(value[1], value[0])}</option>
          )}
          {PLACES.map((p, i) => (
            <option key={p.label} value={i}>
              {p.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={onPick}
          aria-pressed={picking}
          title="Elegir en el mapa"
          aria-label={`Elegir ${label === 'A' ? 'origen' : 'destino'} en el mapa`}
          className={`shrink-0 rounded-sm border px-2 ${picking ? 'border-accent bg-accent/15 text-fg' : 'border-line text-fg-muted hover:border-accent hover:text-fg'}`}
        >
          <Crosshair size={14} strokeWidth={1.5} />
        </button>
      </div>
    </div>
  );
}

/** Spec §7.2 "Accesibilidad": map + origin/destination form + accessible toggle + alternative. */
export function AccessibilityPage() {
  const qc = useQueryClient();
  const [origin, setOrigin] = useState<LngLat>(PLACES[0]!.at);
  const [destination, setDestination] = useState<LngLat>(PLACES[3]!.at);
  const [accessible, setAccessible] = useState(true);
  const [picking, setPicking] = useState<'origin' | 'destination' | null>(null);
  const [req, setReq] = useState<RouteReq | null>(null);
  const [fitNonce, setFitNonce] = useState(0);

  const points = useAccessibilityPoints();
  const incidents = useIncidents({ status: ACTIVE_INCIDENT_STATUSES.join(','), page_size: 200 });
  const stored = useQuery({
    queryKey: ['routes'],
    queryFn: ({ signal }) =>
      api
        .get<ListResponse<AccessibleRouteDto>>('/accessibility/routes', signal)
        .then((r) => r.data),
  });

  // Keyed under 'incidents' on purpose: every live incident change invalidates it, so a
  // new blockage recomputes the route and shows the alternative automatically.
  const route = useQuery<RouteComputation>({
    queryKey: ['incidents', 'route', req],
    queryFn: ({ signal }) =>
      api
        .get<{ computed: RouteComputation }>(
          `/accessibility/routes${qs({
            origin: req && lngLatParam(req.origin),
            destination: req && lngLatParam(req.destination),
            accessible: req?.accessible,
          })}`,
          signal,
        )
        .then((r) => r.computed),
    enabled: !!req,
    placeholderData: keepPreviousData,
  });

  const save = useMutation({
    mutationFn: (r: RouteReq) =>
      api.post<{ computed: RouteComputation; saved_id: string | null }>(
        '/accessibility/routes/alternative',
        {
          origin: r.origin,
          destination: r.destination,
          accessible: r.accessible,
        },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['routes'] }),
  });

  const result = route.data;
  // Re-frame the camera when a new route arrives.
  useEffect(() => {
    if (result?.route) setFitNonce((n) => n + 1);
  }, [result?.route]);

  const bounds = routeBounds(result);
  const fit = useMemo(() => (bounds ? { bounds, nonce: fitNonce } : null), [fitNonce]); // eslint-disable-line react-hooks/exhaustive-deps -- refit only per new route

  const sources: MapSources = useMemo(
    () => ({
      devices: EMPTY_FC,
      incidents: incidents.data ? incidentsToGeoJSON(incidents.data.data) : EMPTY_FC,
      access: points.data ? pointsToGeoJSON(points.data) : EMPTY_FC,
      routes: stored.data ? routesToGeoJSON(stored.data) : EMPTY_FC,
      flood: EMPTY_FC,
    }),
    [incidents.data, points.data, stored.data],
  );
  const overlay = useMemo(
    () => routeOverlay(origin, destination, result),
    [origin, destination, result],
  );

  const onPick =
    picking &&
    ((p: LngLat) => {
      if (picking === 'origin') setOrigin(p);
      else setDestination(p);
      setPicking(null);
    });

  const calculate = () => setReq({ origin, destination, accessible });
  const statusChip = result ? (
    result.status === 'alternative' ? (
      <Chip tone="ok" label="Ruta alternativa" />
    ) : result.status === 'active' ? (
      <Chip tone="accent" label={accessible ? 'Ruta accesible óptima' : 'Ruta más corta'} />
    ) : (
      <Chip tone="danger" label="Sin ruta" />
    )
  ) : null;

  return (
    <div className="grid h-full min-h-0 grid-cols-[340px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)]">
      <aside
        className="flex min-h-0 flex-col overflow-auto border-r border-line bg-surface"
        aria-label="Planificador de ruta accesible"
      >
        <div className="flex h-8 shrink-0 items-center gap-2 border-b border-line bg-surface-2 px-3">
          <Accessibility size={13} strokeWidth={1.5} className="text-fg-muted" aria-hidden />
          <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">
            Ruta accesible
          </h2>
        </div>

        <div className="space-y-2.5 border-b border-line p-3">
          <PlaceField
            label="A"
            value={origin}
            onChange={setOrigin}
            picking={picking === 'origin'}
            onPick={() => setPicking(picking === 'origin' ? null : 'origin')}
          />
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                setOrigin(destination);
                setDestination(origin);
              }}
              className="rounded-sm border border-line p-1 text-fg-muted hover:border-accent hover:text-fg"
              aria-label="Intercambiar origen y destino"
              title="Intercambiar"
            >
              <ArrowDownUp size={13} strokeWidth={1.5} />
            </button>
          </div>
          <PlaceField
            label="B"
            value={destination}
            onChange={setDestination}
            picking={picking === 'destination'}
            onPick={() => setPicking(picking === 'destination' ? null : 'destination')}
          />
          {picking && (
            <p className="text-[11px] text-warn">
              Haz clic en el mapa para elegir el {picking === 'origin' ? 'origen' : 'destino'}.
            </p>
          )}
          <label className="flex cursor-pointer items-center justify-between gap-2 border border-line bg-base px-2 py-1.5">
            <span>
              <span className="block text-[12px]">Ruta accesible</span>
              <span className="block text-[11px] text-fg-muted">
                Rampas, sin escaleras, evita obstáculos
              </span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={accessible}
              onChange={(e) => setAccessible(e.target.checked)}
              className="size-4 accent-[#3d7fcf]"
            />
          </label>
          <button
            type="button"
            onClick={calculate}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-sm border border-accent bg-accent px-3 py-1.5 text-[12px] font-medium text-white"
          >
            <RouteIcon size={14} strokeWidth={1.5} aria-hidden /> Calcular ruta
          </button>
        </div>

        {route.error && (
          <ErrorLine
            message={
              route.error instanceof ApiError ? route.error.message : 'No se pudo calcular la ruta.'
            }
            onRetry={() => void route.refetch()}
          />
        )}

        {result && (
          <div className="space-y-2 border-b border-line p-3" aria-live="polite">
            <div className="flex items-center gap-2">
              {statusChip}
              {route.isFetching && (
                <span className="font-mono text-[11px] text-fg-muted">recalculando…</span>
              )}
            </div>
            <p className="text-[12px] text-fg-muted">{result.message}</p>
            {result.route && (
              <dl className="grid grid-cols-3 gap-2 text-center">
                <div className="border border-line px-2 py-1">
                  <dt className="text-[10px] uppercase tracking-wider text-fg-muted">Distancia</dt>
                  <dd className="font-mono text-[15px]">{result.route.length_m} m</dd>
                </div>
                <div className="border border-line px-2 py-1">
                  <dt className="text-[10px] uppercase tracking-wider text-fg-muted">Tiempo</dt>
                  <dd className="font-mono text-[15px]">{result.route.duration_min} min</dd>
                </div>
                <div className="border border-line px-2 py-1">
                  <dt className="text-[10px] uppercase tracking-wider text-fg-muted">Rampas</dt>
                  <dd className="font-mono text-[15px]">{result.route.ramps.length}</dd>
                </div>
              </dl>
            )}
            {result.baseline && (
              <p className="text-[11px] text-fg-muted">
                La ruta directa ({result.baseline.length_m} m, línea roja punteada) está bloqueada.
              </p>
            )}
            {result.route && (
              <button
                type="button"
                disabled={save.isPending || !req}
                onClick={() => req && save.mutate(req)}
                className="inline-flex items-center gap-1 rounded-sm border border-line px-2 py-0.5 text-[12px] hover:border-accent disabled:opacity-40"
              >
                <Save size={12} strokeWidth={1.5} aria-hidden />
                {save.isSuccess ? 'Guardada' : 'Guardar ruta'}
              </button>
            )}
          </div>
        )}

        {result && result.avoided.length > 0 && (
          <div className="border-b border-line p-3">
            <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-muted">
              Obstáculos evitados
            </div>
            <ul className="space-y-1">
              {result.avoided.map((b, i) => (
                <li key={`${b.id ?? 'manual'}-${i}`} className="flex gap-1.5 text-[12px]">
                  <span className="mt-1.5 size-1.5 shrink-0 bg-critical" aria-hidden />
                  <span>
                    {b.label}
                    <span className="ml-1 font-mono text-[10px] text-fg-muted">
                      radio {b.radius_m} m
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {result?.route && (
          <div className="p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-fg-muted">
              <Footprints size={12} strokeWidth={1.5} aria-hidden /> Indicaciones
            </div>
            <ol className="space-y-1">
              {result.route.steps.map((s, i) => (
                <li key={i} className="grid grid-cols-[18px_1fr_auto] gap-1.5 text-[12px]">
                  <span className="font-mono text-[11px] text-fg-muted">{i + 1}.</span>
                  <span>{s.instruction}</span>
                  <span className="font-mono text-[11px] text-fg-muted">{s.distance_m} m</span>
                </li>
              ))}
            </ol>
            {result.route.ramps.length > 0 && (
              <p className="mt-2 text-[11px] text-fg-muted">
                Rampas: {result.route.ramps.map((r) => r.name ?? 'rampa').join(' · ')}
              </p>
            )}
          </div>
        )}

        {!result && !route.isFetching && (
          <p className="p-3 text-[12px] text-fg-muted">
            Elige origen y destino y calcula la ruta. Si una incidencia activa bloquea el camino, se
            muestra una ruta alternativa y se recalcula sola cuando cambian las incidencias.
          </p>
        )}
      </aside>

      <MapView
        sources={sources}
        hiddenKeys={HIDDEN}
        layerOverride={LAYERS}
        overlay={overlay}
        onPick={onPick || null}
        fit={fit}
        initialView={{ center: [-99.1588, 19.4192], zoom: 16.2, pitch: 45, bearing: -18 }}
      />
    </div>
  );
}
