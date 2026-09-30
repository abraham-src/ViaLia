import maplibregl, { type GeoJSONSource, type MapLayerMouseEvent } from 'maplibre-gl';
import { useEffect } from 'react';
import { useCxMap } from '../map/CxMap';
import {
  TRAFFIC_COLOR,
  TRAFFIC_LABEL,
  TRAFFIC_LINE_COLOR,
  trafficLineWidth,
  useTraffic,
  useTrafficUi,
  type TrafficLevel,
} from './traffic';

const SOURCE = 'cx-traffic';
const LAYERS = ['cx-traffic-casing', 'cx-traffic'] as const;

const esc = (s: string) =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);

/** Líneas de tráfico en vivo (simulador) dentro de un <CxMap>, con leyenda opcional. */
export function TrafficLayer({ legend = true }: { legend?: boolean }) {
  const { map } = useCxMap();
  const { live, snapshot, offline } = useTraffic();
  const visible = useTrafficUi((s) => s.visible);

  useEffect(() => {
    if (map.getSource(SOURCE)) return;
    map.addSource(SOURCE, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    // Debajo de las capas de cada página (zonas, conos, rutas).
    const before = map.getLayer('cx-areas-fill') ? 'cx-areas-fill' : undefined;
    map.addLayer(
      {
        id: 'cx-traffic-casing',
        type: 'line',
        source: SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': '#ffffff',
          'line-width': trafficLineWidth(2.2),
          'line-opacity': 0.85,
        },
      },
      before,
    );
    map.addLayer(
      {
        id: 'cx-traffic',
        type: 'line',
        source: SOURCE,
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': TRAFFIC_LINE_COLOR,
          'line-width': trafficLineWidth(),
          'line-opacity': 0.92,
        },
      },
      before,
    );

    const popup = new maplibregl.Popup({ closeButton: false, maxWidth: '260px', offset: 8 });
    const onClick = (e: MapLayerMouseEvent) => {
      const p = e.features?.[0]?.properties as
        { street: string; speed_kmh: number; free_kmh: number; level: TrafficLevel } | undefined;
      if (!p) return;
      popup
        .setLngLat(e.lngLat)
        .setHTML(
          `<div style="font:600 13px/1.35 inherit">${esc(p.street)}</div>` +
            `<div style="font-size:12px;color:#475569;margin-top:2px">` +
            `<span style="display:inline-block;width:8px;height:8px;border-radius:9px;background:${TRAFFIC_COLOR[p.level]};margin-right:6px"></span>` +
            `${TRAFFIC_LABEL[p.level]} · ${p.speed_kmh} km/h (libre ${p.free_kmh})</div>`,
        )
        .addTo(map);
    };
    const enter = () => (map.getCanvas().style.cursor = 'pointer');
    const leave = () => (map.getCanvas().style.cursor = '');
    map.on('click', 'cx-traffic', onClick);
    map.on('mouseenter', 'cx-traffic', enter);
    map.on('mouseleave', 'cx-traffic', leave);
    return () => {
      popup.remove();
      map.off('click', 'cx-traffic', onClick);
      map.off('mouseenter', 'cx-traffic', enter);
      map.off('mouseleave', 'cx-traffic', leave);
    };
  }, [map]);

  useEffect(() => {
    (map.getSource(SOURCE) as GeoJSONSource | undefined)?.setData(live);
  }, [map, live]);

  useEffect(() => {
    for (const id of LAYERS) {
      if (map.getLayer(id)) map.setLayoutProperty(id, 'visibility', visible ? 'visible' : 'none');
    }
  }, [map, visible]);

  if (!legend || !visible) return null;
  const mins = snapshot ? Math.round(snapshot.hour_cdmx * 60) : null;
  const hh = mins === null ? null : Math.floor(mins / 60) % 24;
  const mm = mins === null ? null : mins % 60;
  return (
    <div className="pointer-events-none absolute bottom-3 left-1/2 z-[2] -translate-x-1/2 whitespace-nowrap rounded-full border border-white/70 bg-white/95 px-3.5 py-1.5 text-[11.5px] font-semibold text-cx-ink2 shadow-cx backdrop-blur">
      <span className="mr-2 text-cx-ink">
        Tráfico en vivo
        {hh !== null && (
          <span className="ml-1 font-medium text-cx-ink3">
            · {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')} CDMX
          </span>
        )}
      </span>
      {offline ? (
        <span className="text-[#b45309]">simulador sin respuesta</span>
      ) : (
        (Object.keys(TRAFFIC_COLOR) as TrafficLevel[]).map((l) => (
          <span key={l} className="ml-2 inline-flex items-center gap-1">
            <span className="h-[4px] w-4 rounded-full" style={{ background: TRAFFIC_COLOR[l] }} />
            {TRAFFIC_LABEL[l]}
          </span>
        ))
      )}
    </div>
  );
}
