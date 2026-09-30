import type { LngLat } from '../lib/geo';
import { CxMap, MapMarker, type CxView } from './CxMap';
import { MapControls } from './controls';

/**
 * Minimapa real (mosaicos de la CDMX) alrededor de un punto, con 2D/3D y tráfico en vivo.
 * Sustituye al minimapa dibujado en SVG.
 */
export function LocationMiniMap({
  center,
  color = '#e5484d',
  marks = [],
  zoom = 16.4,
  className = '',
}: {
  center: LngLat;
  color?: string;
  marks?: Array<{ at: LngLat; color: string }>;
  zoom?: number;
  className?: string;
}) {
  const view: CxView = { center: [center[0], center[1]], zoom, pitch: 0, bearing: 0 };
  return (
    <CxMap
      view={view}
      viewKey={`${center[0]},${center[1]}`}
      traffic="lines"
      interactive={false}
      className={className}
      ariaLabel="Minimapa de la ubicación"
      chrome={
        <div className="absolute left-2 top-2">
          <MapControls home={view} variant="compact" />
        </div>
      }
    >
      {marks.map((m, i) => (
        <MapMarker key={i} lngLat={m.at} z={5}>
          <span
            className="block size-3.5 rounded-full border-[2.5px] border-white shadow"
            style={{ background: m.color }}
          />
        </MapMarker>
      ))}
      <MapMarker lngLat={center} z={10}>
        <span className="relative grid size-11 place-items-center">
          <span
            className="absolute inset-0 rounded-full opacity-15"
            style={{ background: color }}
          />
          <span
            className="absolute inset-[9px] rounded-full opacity-25"
            style={{ background: color }}
          />
          <span
            className="relative size-4 rounded-full border-[3px] border-white shadow"
            style={{ background: color }}
          />
        </span>
      </MapMarker>
    </CxMap>
  );
}
