import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import maplibregl, { type GeoJSONSource, type Map as MapLibreMap } from 'maplibre-gl';
import { Box, CarFront, LocateFixed, Square } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  TRAFFIC_LINE_COLOR,
  trafficLineWidth,
  useTraffic,
  useTrafficUi,
} from '../../centro/traffic/traffic';
import { registerIcons } from './icons';
import {
  INTERACTIVE_LAYERS,
  LAYER_KEYS,
  MAP_LAYERS,
  OVERLAY_LAYERS,
  RENDER_ORDER,
  type LayerKey,
} from './layers';
import { popupHtml } from './popup';
import { EMPTY_FC } from './sources';
import { useMapUi } from './store';
import { buildBaseStyle } from './style';

export type MapSources = Record<
  'devices' | 'incidents' | 'access' | 'routes' | 'flood',
  FeatureCollection
>;

/** Roma Norte / Condesa / Centro in view, tilted to show the 3D skyline. */
const HOME = {
  center: [-99.1545, 19.4225] as [number, number],
  zoom: 13.6,
  pitch: 52,
  bearing: -18,
};
export type MapCamera = typeof HOME;

export interface MapViewProps {
  sources: MapSources;
  hiddenKeys: readonly LayerKey[];
  /** Per-view layer visibility that wins over the user's toggles (e.g. accessibility view). */
  layerOverride?: Partial<Record<LayerKey, boolean>>;
  /** Route-planner overlay (see OVERLAY_LAYERS). */
  overlay?: FeatureCollection;
  /** When set, a map click picks a coordinate instead of opening a popup. */
  onPick?: ((lngLat: [number, number]) => void) | null;
  /** Fit the camera to these bounds whenever the object changes. */
  fit?: { bounds: [[number, number], [number, number]]; nonce: number } | null;
  /** Initial camera (defaults to the city overview). */
  initialView?: Partial<MapCamera>;
}

const popup = () => new maplibregl.Popup({ maxWidth: '320px', className: 'simu-popup-wrap' });

export function MapView({
  sources,
  hiddenKeys,
  layerOverride,
  overlay,
  onPick = null,
  fit = null,
  initialView,
}: MapViewProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const popupRef = useRef<maplibregl.Popup | null>(null);
  const latest = useRef(sources);
  const latestOverlay = useRef(overlay);
  const pickRef = useRef(onPick);
  const home = useRef<MapCamera>({ ...HOME, ...initialView });
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const visible = useMapUi((s) => s.visible);
  const pitched = useMapUi((s) => s.pitched);
  const focus = useMapUi((s) => s.focus);
  const setPitched = useMapUi((s) => s.setPitched);
  const traffic = useTraffic();
  const trafficVisible = useTrafficUi((s) => s.visible);
  const toggleTraffic = useTrafficUi((s) => s.toggle);
  const latestTraffic = useRef(traffic.live);
  latestTraffic.current = traffic.live;

  latest.current = sources;
  latestOverlay.current = overlay;
  pickRef.current = onPick;

  // Create the map once.
  useEffect(() => {
    if (!container.current) return;
    const map = new maplibregl.Map({
      container: container.current,
      style: buildBaseStyle(),
      ...home.current,
      maxPitch: 70,
      attributionControl: { compact: true },
    });
    mapRef.current = map;
    // Dev/E2E hook to inspect the map from the browser (never in production builds).
    if (import.meta.env.DEV) (window as unknown as { __simuMap?: MapLibreMap }).__simuMap = map;
    map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric', maxWidth: 110 }), 'bottom-left');

    map.on('error', (e) => {
      // Tile hiccups are transient; only surface a style/load failure.
      if (!map.isStyleLoaded())
        setLoadError((e.error as Error | undefined)?.message ?? 'No se pudo cargar el mapa base');
    });

    map.on('load', () => {
      void registerIcons(map).then(() => {
        // Real-time traffic from the field simulator, beneath the operational layers.
        map.addSource('traffic', { type: 'geojson', data: latestTraffic.current });
        map.addLayer({
          id: 'traffic',
          type: 'line',
          source: 'traffic',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': TRAFFIC_LINE_COLOR,
            'line-width': trafficLineWidth(),
            'line-opacity': 0.8,
          },
        });
        for (const id of ['devices', 'incidents', 'access', 'routes', 'flood'] as const) {
          map.addSource(id, { type: 'geojson', data: latest.current[id] ?? EMPTY_FC });
        }
        for (const key of RENDER_ORDER) for (const layer of MAP_LAYERS[key]) map.addLayer(layer);
        map.addSource('overlay', { type: 'geojson', data: latestOverlay.current ?? EMPTY_FC });
        for (const layer of OVERLAY_LAYERS) map.addLayer(layer);

        for (const id of INTERACTIVE_LAYERS) {
          map.on('mouseenter', id, () => {
            if (!pickRef.current) map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', id, () => {
            map.getCanvas().style.cursor = pickRef.current ? 'crosshair' : '';
          });
        }
        map.on('click', (e) => {
          if (pickRef.current) {
            pickRef.current([e.lngLat.lng, e.lngLat.lat]);
            return;
          }
          const layers = INTERACTIVE_LAYERS.filter((id) => map.getLayer(id));
          const [feature] = map.queryRenderedFeatures(e.point, { layers });
          if (!feature) return;
          popupRef.current?.remove();
          popupRef.current = popup()
            .setLngLat(e.lngLat)
            .setHTML(popupHtml(feature.properties ?? {}))
            .addTo(map);
        });
        setReady(true);
      });
    });

    return () => {
      popupRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Live data: the query cache is patched by WebSocket messages, so this runs on every
  // drain reading / status change without a page reload (spec §7.4).
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const [id, data] of Object.entries(sources)) {
      (map.getSource(id) as GeoJSONSource | undefined)?.setData(data);
    }
  }, [ready, sources]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('overlay') as GeoJSONSource | undefined)?.setData(overlay ?? EMPTY_FC);
  }, [ready, overlay]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    (map.getSource('traffic') as GeoJSONSource | undefined)?.setData(traffic.live);
  }, [ready, traffic.live]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map?.getLayer('traffic')) return;
    map.setLayoutProperty('traffic', 'visibility', trafficVisible ? 'visible' : 'none');
  }, [ready, trafficVisible]);

  // Crosshair while picking a point.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.getCanvas().style.cursor = onPick ? 'crosshair' : '';
  }, [ready, onPick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !fit) return;
    map.fitBounds(fit.bounds, { padding: 80, maxZoom: 17, duration: 800 });
  }, [ready, fit]);

  // Layer toggles.
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    for (const key of LAYER_KEYS) {
      const show = (layerOverride?.[key] ?? visible[key]) && !hiddenKeys.includes(key);
      for (const layer of MAP_LAYERS[key]) {
        if (map.getLayer(layer.id))
          map.setLayoutProperty(layer.id, 'visibility', show ? 'visible' : 'none');
      }
    }
  }, [ready, visible, hiddenKeys, layerOverride]);

  // 2D / 3D
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map) return;
    map.easeTo({
      pitch: pitched ? home.current.pitch : 0,
      bearing: pitched ? home.current.bearing : 0,
      duration: 600,
    });
    if (map.getLayer('building-3d')) {
      map.setPaintProperty(
        'building-3d',
        'fill-extrusion-height',
        pitched ? ['coalesce', ['get', 'render_height'], 6] : 0,
      );
    }
  }, [ready, pitched]);

  // Focus requests (incident panel, "Ver en mapa").
  useEffect(() => {
    const map = mapRef.current;
    if (!ready || !map || !focus) return;
    map.flyTo({ center: [focus.lng, focus.lat], zoom: Math.max(map.getZoom(), 16), duration: 900 });
    popupRef.current?.remove();
    popupRef.current = popup().setLngLat([focus.lng, focus.lat]).setHTML(focus.html).addTo(map);
  }, [ready, focus]);

  return (
    <div className="relative h-full w-full bg-base">
      {/* Explicit size: maplibre-gl.css forces position:relative on this node, so inset-0 would collapse it. */}
      <div ref={container} className="h-full w-full" aria-label="Mapa de la Ciudad de México" />
      {!ready && !loadError && (
        <div className="pointer-events-none absolute left-3 top-3 border border-line bg-surface px-2 py-1 font-mono text-[11px] text-fg-muted">
          Cargando mapa base…
        </div>
      )}
      {loadError && (
        <div
          role="alert"
          className="absolute left-3 top-3 border border-danger/50 bg-surface px-2 py-1 text-[12px] text-critical"
        >
          Mapa base no disponible ({loadError}). Las capas operativas siguen actualizándose.
        </div>
      )}
      <div
        className="absolute left-3 top-3 flex flex-col gap-1"
        style={{ marginTop: !ready || loadError ? 32 : 0 }}
      >
        <button
          type="button"
          onClick={() => setPitched(!pitched)}
          className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2 py-1 text-[12px] text-fg hover:border-accent"
          title={pitched ? 'Vista 2D' : 'Vista 3D con edificios'}
        >
          {pitched ? (
            <Square size={13} strokeWidth={1.5} aria-hidden />
          ) : (
            <Box size={13} strokeWidth={1.5} aria-hidden />
          )}
          {pitched ? '2D' : '3D'}
        </button>
        <button
          type="button"
          onClick={() =>
            mapRef.current?.flyTo({
              ...home.current,
              pitch: pitched ? home.current.pitch : 0,
              bearing: pitched ? home.current.bearing : 0,
            })
          }
          className="inline-flex items-center gap-1.5 rounded-sm border border-line bg-surface px-2 py-1 text-[12px] text-fg hover:border-accent"
          title="Recentrar"
        >
          <LocateFixed size={13} strokeWidth={1.5} aria-hidden /> Centrar
        </button>
        <button
          type="button"
          onClick={toggleTraffic}
          aria-pressed={trafficVisible}
          className={`inline-flex items-center gap-1.5 rounded-sm border bg-surface px-2 py-1 text-[12px] hover:border-accent ${trafficVisible ? 'border-accent text-fg' : 'border-line text-fg-muted'}`}
          title="Tráfico en tiempo real del simulador"
        >
          <CarFront size={13} strokeWidth={1.5} aria-hidden /> Tráfico
          {traffic.offline && <span className="text-warn">· sin datos</span>}
        </button>
      </div>
    </div>
  );
}
