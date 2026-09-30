import type { Map as MapLibreMap } from 'maplibre-gl';
import { CarFront, LocateFixed, Minus, Plus } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { useTrafficUi } from '../traffic/traffic';
import { flyToView, useCxMap, type CxView } from './CxMap';

const BUILDING_HEIGHT = ['coalesce', ['get', 'render_height'], 6] as const;

/**
 * Cambia entre vista 2D (cenital, edificios planos) y 3D (inclinada, edificios extruidos).
 * `pitch`/`bearing` permiten que cada vista use su propio ángulo 3D.
 */
export function setMap3d(map: MapLibreMap, on: boolean, pitch = 58, bearing = -20): void {
  map.easeTo({ pitch: on ? pitch : 0, bearing: on ? bearing : 0, duration: 700 });
  setBuildings3d(map, on);
}

/** Edificios con altura real en 3D; planos en 2D. */
export function setBuildings3d(map: MapLibreMap, on: boolean): void {
  if (map.getLayer('building-3d')) {
    map.setPaintProperty(
      'building-3d',
      'fill-extrusion-height',
      on ? (BUILDING_HEIGHT as unknown as number) : 0,
    );
  }
}

function useMode3d(pitch: number, bearing: number) {
  const { map } = useCxMap();
  const [on, setOn] = useState(() => map.getPitch() > 10);
  useEffect(() => {
    setBuildings3d(map, map.getPitch() > 10);
  }, [map]);
  const toggle = () => {
    const next = !on;
    setOn(next);
    setMap3d(map, next, pitch, bearing);
  };
  return { on, toggle };
}

/** Controles de zoom, recentrar, 2D/3D y tráfico con el estilo del maquetado. */
export function MapControls({
  home,
  className = '',
  pitch3d,
  bearing3d,
  variant = 'full',
}: {
  home: CxView;
  className?: string;
  pitch3d?: number;
  bearing3d?: number;
  /** `compact`: fila horizontal con 2D/3D y tráfico, para mapas pequeños. */
  variant?: 'full' | 'compact';
}) {
  const { map } = useCxMap();
  // Si la vista inicial ya es 3D se reusa su ángulo; si es plana, se usa uno por defecto.
  const tilted = (home.pitch ?? 0) > 10;
  const p3 = pitch3d ?? (tilted ? (home.pitch ?? 58) : 58);
  const b3 = bearing3d ?? (tilted ? (home.bearing ?? 0) : -20);
  const mode = useMode3d(p3, b3);
  const traffic = useTrafficUi((s) => s.visible);
  const toggleTraffic = useTrafficUi((s) => s.toggle);
  const btn =
    'grid size-10 place-items-center text-cx-ink2 transition hover:bg-cx-line2 hover:text-cx-ink';
  const solo = `${btn} rounded-[14px] border border-cx-line bg-white shadow-cx`;

  const toggle3d = (
    <button
      type="button"
      className={solo}
      onClick={mode.toggle}
      aria-label={mode.on ? 'Cambiar a vista 2D' : 'Cambiar a vista 3D'}
      title={mode.on ? 'Vista 2D' : 'Vista 3D con edificios'}
    >
      <span className="text-[12px] font-extrabold">{mode.on ? '2D' : '3D'}</span>
    </button>
  );
  const trafficBtn = (
    <button
      type="button"
      className={`${solo} ${traffic ? '!border-cx-blue !text-cx-blue' : ''}`}
      onClick={toggleTraffic}
      aria-pressed={traffic}
      aria-label={traffic ? 'Ocultar tráfico en vivo' : 'Mostrar tráfico en vivo'}
      title={traffic ? 'Ocultar tráfico en vivo' : 'Mostrar tráfico en vivo'}
    >
      <CarFront size={17} strokeWidth={2.1} />
    </button>
  );

  if (variant === 'compact') {
    return (
      <div className={`flex gap-1.5 [&>button]:size-8 [&>button]:rounded-[10px] ${className}`}>
        {toggle3d}
        {trafficBtn}
      </div>
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex flex-col overflow-hidden rounded-[14px] border border-cx-line bg-white shadow-cx">
        <button type="button" className={btn} onClick={() => map.zoomIn()} aria-label="Acercar">
          <Plus size={18} strokeWidth={2.2} />
        </button>
        <span className="mx-2 h-px bg-cx-line" />
        <button type="button" className={btn} onClick={() => map.zoomOut()} aria-label="Alejar">
          <Minus size={18} strokeWidth={2.2} />
        </button>
      </div>
      <button
        type="button"
        className={solo}
        onClick={() =>
          flyToView(map, { ...home, pitch: mode.on ? p3 : 0, bearing: mode.on ? b3 : 0 })
        }
        aria-label="Recentrar"
        title="Recentrar"
      >
        <LocateFixed size={18} strokeWidth={2.1} />
      </button>
      {toggle3d}
      {trafficBtn}
    </div>
  );
}

/** Tarjeta flotante sobre el mapa. */
export function MapPanel({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-[16px] border border-white/70 bg-white/95 p-3 shadow-cx-lg backdrop-blur ${className}`}
    >
      {children}
    </div>
  );
}

/** Aviso discreto cuando el mapa usa el respaldo de calles locales. */
export function FallbackNotice() {
  const { fallback } = useCxMap();
  if (!fallback) return null;
  return (
    <div className="pointer-events-none absolute bottom-2.5 right-11 whitespace-nowrap rounded-full bg-white/90 px-3 py-1 text-[11px] font-medium text-cx-ink3 shadow-cx">
      Sin mosaicos en línea · calles © OpenStreetMap del repo
    </div>
  );
}
