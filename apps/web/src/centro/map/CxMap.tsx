import 'maplibre-gl/dist/maplibre-gl.css';
import type { FeatureCollection } from 'geojson';
import maplibregl, {
  type GeoJSONSource,
  type LayerSpecification,
  type Map as MapLibreMap,
} from 'maplibre-gl';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { TrafficLayer } from '../traffic/TrafficLayer';
import { FALLBACK_DATA_URL, FALLBACK_LAYERS, FALLBACK_SOURCE, buildCxStyle } from './cxStyle';

export interface CxView {
  center: [number, number];
  zoom: number;
  pitch?: number;
  bearing?: number;
  /** Si viene, se encuadra a estos límites (y `center`/`zoom` quedan como respaldo). */
  bounds?: [[number, number], [number, number]];
  padding?: { top: number; bottom: number; left: number; right: number };
}

export function flyToView(map: MapLibreMap, v: CxView, duration = 900): void {
  if (v.bounds) {
    map.fitBounds(v.bounds, {
      padding: v.padding ?? 40,
      pitch: v.pitch ?? 0,
      bearing: v.bearing ?? 0,
      duration,
    });
    return;
  }
  map.flyTo({
    center: v.center,
    zoom: v.zoom,
    pitch: v.pitch ?? map.getPitch(),
    bearing: v.bearing ?? map.getBearing(),
    duration,
    essential: true,
  });
}

/**
 * Capas vectoriales del centro. Cada colección trae su estilo en las propiedades
 * (color, opacidad, línea punteada), así las páginas deciden el look sin tocar el mapa.
 *   areas: polígonos (zonas, riesgo, inundación)  → fill, fillOpacity, line, lineWidth, dashed
 *   cones: conos de visión de cámaras            → color
 *   rings: radios (correlación, precisión)       → color, fillOpacity, dashed
 *   lines: rutas o tramos                         → color, width, dashed
 */
export interface CxOverlays {
  areas?: FeatureCollection;
  cones?: FeatureCollection;
  rings?: FeatureCollection;
  lines?: FeatureCollection;
}

const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
const OVERLAY_IDS = ['areas', 'cones', 'rings', 'lines'] as const;

const OVERLAY_LAYERS: LayerSpecification[] = [
  {
    id: 'cx-areas-fill',
    type: 'fill',
    source: 'cx-areas',
    paint: {
      'fill-color': ['coalesce', ['get', 'fill'], '#1f5fa6'],
      'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.12],
    },
  },
  {
    id: 'cx-areas-line',
    type: 'line',
    source: 'cx-areas',
    filter: ['!=', ['get', 'dashed'], true],
    paint: {
      'line-color': ['coalesce', ['get', 'line'], ['get', 'fill'], '#1f5fa6'],
      'line-width': ['coalesce', ['get', 'lineWidth'], 1.5],
      'line-opacity': 0.85,
    },
  },
  {
    id: 'cx-areas-line-dashed',
    type: 'line',
    source: 'cx-areas',
    filter: ['==', ['get', 'dashed'], true],
    paint: {
      'line-color': ['coalesce', ['get', 'line'], ['get', 'fill'], '#1f5fa6'],
      'line-width': ['coalesce', ['get', 'lineWidth'], 1.5],
      'line-dasharray': [2, 2],
      'line-opacity': 0.9,
    },
  },
  {
    id: 'cx-lines',
    type: 'line',
    source: 'cx-lines',
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#1f5fa6'],
      'line-width': ['coalesce', ['get', 'width'], 4],
      'line-opacity': 0.9,
    },
  },
  {
    id: 'cx-cones-fill',
    type: 'fill',
    source: 'cx-cones',
    paint: {
      'fill-color': ['coalesce', ['get', 'color'], '#1f5fa6'],
      'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.2],
    },
  },
  {
    id: 'cx-cones-line',
    type: 'line',
    source: 'cx-cones',
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#1f5fa6'],
      'line-width': 1.2,
      'line-opacity': 0.55,
    },
  },
  {
    id: 'cx-rings-fill',
    type: 'fill',
    source: 'cx-rings',
    paint: {
      'fill-color': ['coalesce', ['get', 'color'], '#e5484d'],
      'fill-opacity': ['coalesce', ['get', 'fillOpacity'], 0.06],
    },
  },
  {
    id: 'cx-rings-line',
    type: 'line',
    source: 'cx-rings',
    paint: {
      'line-color': ['coalesce', ['get', 'color'], '#e5484d'],
      'line-width': ['coalesce', ['get', 'lineWidth'], 1.5],
      'line-dasharray': [3, 2],
      'line-opacity': 0.9,
    },
  },
];

interface MapCtx {
  map: MapLibreMap;
  /** Cambia en cada fin de movimiento: los agrupamientos en pantalla se recalculan con él. */
  moveTick: number;
  fallback: boolean;
}

const Ctx = createContext<MapCtx | null>(null);

export function useCxMap(): MapCtx {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useCxMap fuera de <CxMap>');
  return ctx;
}

export interface CxMapProps {
  view: CxView;
  /** Cambia esta llave para volar a `view` (p. ej. al cambiar de incidencia). */
  viewKey?: string;
  overlays?: CxOverlays;
  className?: string;
  children?: ReactNode;
  /** Controles flotantes (tarjetas, leyenda); se pintan encima del mapa. */
  chrome?: ReactNode;
  ariaLabel?: string;
  /** Tráfico en vivo del simulador: con leyenda (por defecto), solo líneas, o apagado. */
  traffic?: 'full' | 'lines' | 'off';
  /** Mapas pequeños: sin gestos de rotación/inclinación con el mouse. */
  interactive?: boolean;
}

export function CxMap({
  view,
  viewKey,
  overlays,
  className,
  children,
  chrome,
  ariaLabel = 'Mapa de la ciudad',
  traffic = 'full',
  interactive = true,
}: CxMapProps) {
  const interactiveRef = useRef(interactive);
  const container = useRef<HTMLDivElement>(null);
  const [map, setMap] = useState<MapLibreMap | null>(null);
  const [moveTick, setMoveTick] = useState(0);
  const [fallback, setFallback] = useState(false);
  const overlaysRef = useRef(overlays);
  const viewRef = useRef(view);
  overlaysRef.current = overlays;
  viewRef.current = view;

  useEffect(() => {
    if (!container.current) return;
    const m = new maplibregl.Map({
      container: container.current,
      style: buildCxStyle(),
      center: viewRef.current.center,
      zoom: viewRef.current.zoom,
      pitch: viewRef.current.pitch ?? 0,
      bearing: viewRef.current.bearing ?? 0,
      ...(viewRef.current.bounds
        ? {
            bounds: viewRef.current.bounds,
            fitBoundsOptions: { padding: viewRef.current.padding ?? 40 },
          }
        : {}),
      maxPitch: 70,
      attributionControl: { compact: true },
      fadeDuration: 0,
      ...(interactiveRef.current ? {} : { scrollZoom: false, dragRotate: false }),
    });
    if (import.meta.env.DEV) (window as unknown as { __cxMap?: MapLibreMap }).__cxMap = m;

    let fell = false;
    const enableFallback = () => {
      if (fell) return;
      fell = true;
      setFallback(true);
      const add = () => {
        if (!m.getSource(FALLBACK_SOURCE)) {
          m.addSource(FALLBACK_SOURCE, { type: 'geojson', data: FALLBACK_DATA_URL });
          const before = m.getLayer('cx-areas-fill') ? 'cx-areas-fill' : undefined;
          for (const layer of FALLBACK_LAYERS) m.addLayer(layer, before);
        }
      };
      if (m.isStyleLoaded()) add();
      else m.once('load', add);
    };

    m.on('error', (e) => {
      const source = (e as unknown as { sourceId?: string }).sourceId;
      const message = String((e.error as Error | undefined)?.message ?? '');
      if (source === 'openmaptiles' || /openfreemap|Failed to fetch|NetworkError/i.test(message)) {
        enableFallback();
      }
    });
    // Mosaicos que no llegan (red lenta o bloqueada) sin disparar error.
    const probe = window.setTimeout(() => {
      try {
        if (!m.isSourceLoaded('openmaptiles')) enableFallback();
      } catch {
        enableFallback();
      }
    }, 4500);

    m.on('load', () => {
      for (const id of OVERLAY_IDS) {
        m.addSource(`cx-${id}`, { type: 'geojson', data: overlaysRef.current?.[id] ?? EMPTY });
      }
      for (const layer of OVERLAY_LAYERS) m.addLayer(layer);
      setMap(m);
    });
    m.on('moveend', () => setMoveTick((t) => t + 1));

    return () => {
      window.clearTimeout(probe);
      m.remove();
      setMap(null);
    };
  }, []);

  useEffect(() => {
    if (!map) return;
    for (const id of OVERLAY_IDS) {
      (map.getSource(`cx-${id}`) as GeoJSONSource | undefined)?.setData(overlays?.[id] ?? EMPTY);
    }
  }, [map, overlays]);

  // Volar a una vista nueva solo cuando cambia la llave (no en cada render).
  const firstKey = useRef(viewKey);
  useEffect(() => {
    if (!map || viewKey === firstKey.current) return;
    firstKey.current = viewKey;
    flyToView(map, viewRef.current, 1100);
  }, [map, viewKey]);

  return (
    <div className={`cx-map relative isolate overflow-hidden ${className ?? ''}`}>
      <div ref={container} className="h-full w-full" aria-label={ariaLabel} />
      {map && (
        <Ctx.Provider value={{ map, moveTick, fallback }}>
          {traffic !== 'off' && <TrafficLayer legend={traffic === 'full'} />}
          {children}
          {chrome}
        </Ctx.Provider>
      )}
      {!map && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="rounded-full bg-white/90 px-4 py-2 text-[13px] font-medium text-cx-ink2 shadow-cx">
            Cargando mapa…
          </div>
        </div>
      )}
    </div>
  );
}

export interface MapMarkerProps {
  lngLat: [number, number];
  anchor?: maplibregl.PositionAnchor;
  offset?: [number, number];
  children: ReactNode;
  /** Mayor = encima. */
  z?: number;
}

/** Marcador HTML que renderiza React dentro del mapa (portal). */
export function MapMarker({ lngLat, anchor = 'center', offset, children, z = 1 }: MapMarkerProps) {
  const { map } = useCxMap();
  const [el] = useState(() => {
    const div = document.createElement('div');
    div.style.zIndex = String(z);
    return div;
  });
  const markerRef = useRef<maplibregl.Marker | null>(null);
  const lng = lngLat[0];
  const lat = lngLat[1];

  useEffect(() => {
    const marker = new maplibregl.Marker({ element: el, anchor, offset }).setLngLat([lng, lat]);
    marker.addTo(map);
    markerRef.current = marker;
    return () => {
      marker.remove();
      markerRef.current = null;
    };
    // La posición se actualiza en el efecto de abajo; recrear el marcador causaría parpadeo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, el, anchor]);

  useEffect(() => {
    markerRef.current?.setLngLat([lng, lat]);
  }, [lng, lat]);

  useEffect(() => {
    el.style.zIndex = String(z);
  }, [el, z]);

  const ox = offset?.[0] ?? 0;
  const oy = offset?.[1] ?? 0;
  useEffect(() => {
    markerRef.current?.setOffset([ox, oy]);
  }, [ox, oy]);

  return createPortal(children, el);
}
