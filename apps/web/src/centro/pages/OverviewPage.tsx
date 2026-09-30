import type { DeviceDto, DeviceEventDto, IncidentDto, PaginatedResponse } from '@simu/shared-types';
import { useQuery } from '@tanstack/react-query';
import type { Feature } from 'geojson';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Droplets,
  Layers,
  MapPin,
  TriangleAlert,
  Video,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, qs } from '../../lib/api';
import { formatAge } from '../../lib/format';
import { TrafficLightIcon, type IconType } from '../components/icons';
import { Card, DeviceStatusPill, Note, PageHeader, Pill } from '../components/ui';
import { TopActions } from '../components/TopActions';
import { useMapFocus } from '../components/focus';
import { cameraHeading, lngLatOf, useCxData, type CxData } from '../data/useCxData';
import { CameraScene } from '../illustrations/CameraScene';
import { clusterScreen, cone, fc, ringCenter, type LngLat } from '../lib/geo';
import { CxMap, MapMarker, flyToView, useCxMap, type CxView } from '../map/CxMap';
import { FallbackNotice, MapControls, MapPanel } from '../map/controls';
import {
  CameraPin,
  Callout,
  ClusterBubble,
  DrainGauge,
  IncidentPin,
  TrafficLightPin,
  ZoneLabel,
} from '../map/markers';
import { LEVEL_COLOR, LEVEL_LABEL, confidenceLabel } from '../risk/model';
import { usePrediction } from '../risk/usePrediction';
import { AXIS_LABEL, fixedLampAt, lampFor, usesFixedPlan } from '../sim/intersection';
import { MAIN_LIGHT, useSignal } from '../sim/store';
import {
  CAMERA_EVENT_LABEL,
  INCIDENT_VISUAL,
  PRIORITIES,
  PRIORITY_COLOR,
  PRIORITY_RANK,
  PRIORITY_TEXT,
} from '../lib/visuals';

/** Roma Norte y Condesa (donde ocurre la historia de la demo); las demás zonas quedan a un clic. */
export const HOME_VIEW: CxView = {
  center: [-99.1532, 19.4222],
  zoom: 13.55,
  pitch: 0,
  bearing: 0,
  bounds: [
    [-99.1716, 19.4078],
    [-99.1552, 19.4214],
  ],
  padding: { top: 60, bottom: 40, left: 228, right: 72 },
};

type LayerKey = 'incidents' | 'cameras' | 'drains' | 'lights' | 'risk';

const LAYER_ITEMS: ReadonlyArray<{ key: LayerKey; label: string; icon: IconType }> = [
  { key: 'incidents', label: 'Incidencias', icon: TriangleAlert },
  { key: 'cameras', label: 'Cámaras IA', icon: Video },
  { key: 'drains', label: 'Sensores', icon: Droplets },
  { key: 'lights', label: 'Semáforos', icon: TrafficLightIcon },
  { key: 'risk', label: 'Zonas de riesgo', icon: Layers },
];

function IncidentLayer({ incidents }: { incidents: IncidentDto[] }) {
  const { map, moveTick } = useCxMap();
  const navigate = useNavigate();
  const clusters = useMemo(() => {
    void moveTick;
    const pts = incidents.map((i) => {
      const p = map.project([i.longitude, i.latitude]);
      return { x: p.x, y: p.y, item: i };
    });
    return clusterScreen(pts, 44);
  }, [map, moveTick, incidents]);

  return (
    <>
      {clusters.map((c) => {
        const top = [...c.items].sort(
          (a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority],
        )[0];
        if (!top) return null;
        if (c.items.length === 1) {
          return (
            <MapMarker
              key={top.id}
              lngLat={lngLatOf(top)}
              anchor="bottom"
              z={30 + PRIORITY_RANK[top.priority]}
            >
              <IncidentPin
                priority={top.priority}
                title={`${INCIDENT_VISUAL[top.type].title} · ${PRIORITY_TEXT[top.priority]}`}
                onClick={() => navigate(`/centro/incidencias/${top.id}`)}
              />
            </MapMarker>
          );
        }
        const ll = map.unproject([c.x, c.y]);
        return (
          <MapMarker
            key={c.items
              .map((i) => i.id)
              .sort()
              .join('|')}
            lngLat={[ll.lng, ll.lat]}
            z={40}
          >
            <ClusterBubble
              count={c.items.length}
              priority={top.priority}
              onClick={() =>
                map.flyTo({
                  center: [ll.lng, ll.lat],
                  zoom: Math.min(18, map.getZoom() + 2),
                  duration: 700,
                })
              }
            />
          </MapMarker>
        );
      })}
    </>
  );
}

/**
 * Separa los dispositivos que caen encima de una incidencia (misma esquina): los mueve unos
 * píxeles en una dirección fija por tipo, como satélites alrededor del grupo.
 */
function useDeclutter(devices: DeviceDto[], incidents: IncidentDto[]) {
  const { map, moveTick } = useCxMap();
  return useMemo(() => {
    void moveTick;
    const dir: Record<string, [number, number]> = {
      camera: [-30, -26],
      drain: [30, 22],
      traffic_light: [30, -26],
    };
    const pts = incidents.map((i) => map.project([i.longitude, i.latitude]));
    const out: Record<string, [number, number]> = {};
    for (const d of devices) {
      const p = map.project([d.longitude, d.latitude]);
      const near = pts.some((q) => Math.hypot(q.x - p.x, q.y - p.y) < 34);
      out[d.device_code] = near ? (dir[d.type] ?? [0, 0]) : [0, 0];
    }
    return out;
  }, [map, moveTick, devices, incidents]);
}

function DeviceLayer({
  data,
  layers,
  cameraCode,
  onCamera,
}: {
  data: CxData;
  layers: Record<LayerKey, boolean>;
  cameraCode: string | null;
  onCamera: (code: string) => void;
}) {
  const sim = useSignal((s) => s.sim);
  useSignal((s) => s.v);
  const offsets = useDeclutter(data.devices, layers.incidents ? data.incidents : []);
  const now = Date.now() / 1000;
  return (
    <>
      {layers.drains &&
        data.drains.map((d) =>
          d.drain ? (
            <MapMarker
              key={d.device_code}
              lngLat={lngLatOf(d)}
              offset={offsets[d.device_code]}
              z={10}
            >
              <DrainGauge
                level={d.drain.obstruction_level}
                status={d.drain.status}
                deviceStatus={d.status}
                title={`${d.device_code} · ${d.name}`}
              />
            </MapMarker>
          ) : null,
        )}
      {layers.lights &&
        data.lights.map((l) => (
          <MapMarker
            key={l.device_code}
            lngLat={lngLatOf(l)}
            anchor="bottom"
            offset={offsets[l.device_code]}
            z={12}
          >
            <TrafficLightPin
              lamp={l.device_code === MAIN_LIGHT ? lampFor(sim, 'N') : fixedLampAt(now, 17)}
              adaptive={l.device_code === MAIN_LIGHT && !usesFixedPlan(sim)}
              title={`${l.device_code} · ${l.name}`}
            />
          </MapMarker>
        ))}
      {layers.cameras &&
        data.cameras.map((c) => {
          const active = c.device_code === cameraCode;
          return (
            <MapMarker
              key={c.device_code}
              lngLat={lngLatOf(c)}
              offset={offsets[c.device_code]}
              z={active ? 50 : 15}
            >
              <div className="relative">
                <CameraPin
                  status={c.status}
                  active={active}
                  onClick={() => onCamera(c.device_code)}
                  title={`${c.device_code} · ${c.name}`}
                />
                {active && (
                  <div className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2">
                    <Callout title="Cámara IA" subtitle={`${c.device_code} · monitoreando zona`} />
                  </div>
                )}
              </div>
            </MapMarker>
          );
        })}
    </>
  );
}

function ZoneJumps({ data }: { data: CxData }) {
  const { map } = useCxMap();
  return (
    <div className="mt-2 border-t border-cx-line2 px-1 pt-2">
      <div className="px-1.5 pb-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-cx-ink3">
        Ir a zona
      </div>
      <div className="flex flex-wrap gap-1.5">
        {data.zoneList.map((z) => {
          const n = data.incidents.filter((i) => data.zoneOfItem(i)?.code === z.code).length;
          const lngs = z.ring.map((p) => p[0] ?? 0);
          const lats = z.ring.map((p) => p[1] ?? 0);
          return (
            <button
              key={z.code}
              type="button"
              onClick={() =>
                map.fitBounds(
                  [
                    [Math.min(...lngs), Math.min(...lats)],
                    [Math.max(...lngs), Math.max(...lats)],
                  ],
                  { padding: { top: 40, bottom: 40, left: 230, right: 70 }, duration: 900 },
                )
              }
              className="inline-flex items-center gap-1 rounded-full bg-cx-line2 px-2 py-1 text-[11.5px] font-semibold text-cx-ink2 hover:bg-cx-bluesoft hover:text-cx-blue"
            >
              {z.name}
              {n > 0 && (
                <span className="cx-tabular grid h-4 min-w-4 place-items-center rounded-full bg-cx-critical px-1 text-[10px] font-bold text-white">
                  {n}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function FocusListener() {
  const { map } = useCxMap();
  const request = useMapFocus((s) => s.request);
  const clear = useMapFocus((s) => s.clear);
  useEffect(() => {
    if (!request) return;
    map.flyTo({ center: request.center, zoom: request.zoom, duration: 1000 });
    // Atendida: que no vuelva a volar la próxima vez que se abra el mapa general.
    clear();
  }, [map, request, clear]);
  return null;
}

function useLastDetection(code: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['cx', 'last-detection', code],
    enabled: enabled && !!code,
    refetchInterval: 20_000,
    queryFn: ({ signal }) =>
      api
        .get<PaginatedResponse<DeviceEventDto>>(
          `/events${qs({ device_id: code ?? '', page_size: 5 })}`,
          signal,
        )
        .then((r) => r.data.find((e) => e.event_type !== 'WEATHER') ?? null),
  });
}

function CameraCard({
  data,
  camera,
  onPick,
}: {
  data: CxData;
  camera: DeviceDto | null;
  onPick: (code: string) => void;
}) {
  const last = useLastDetection(camera?.device_code ?? null, data.staff);
  const stream = camera?.camera?.stream_url ?? null;
  const idx = data.cameras.findIndex((c) => c.device_code === camera?.device_code);
  const cycle = (d: number) => {
    const n = data.cameras.length;
    const next = data.cameras[(idx + d + n) % n];
    if (next) onPick(next.device_code);
  };
  return (
    <Card
      title="Cámara inteligente"
      action={camera ? <DeviceStatusPill status={camera.status} /> : null}
      bodyClassName="!pt-3"
    >
      <div className="relative overflow-hidden rounded-[14px] bg-[#143254]">
        {stream ? (
          <img
            src={stream}
            alt={`Video de ${camera?.device_code}`}
            className="aspect-[16/9] w-full object-cover"
          />
        ) : (
          <CameraScene className="block aspect-[16/9] w-full" />
        )}
        <span className="absolute left-2.5 top-2.5 flex items-center gap-1 rounded-full bg-black/55 py-0.5 pl-1 pr-1 text-[11px] font-bold text-white backdrop-blur">
          <button
            type="button"
            onClick={() => cycle(-1)}
            className="grid size-5 place-items-center rounded-full hover:bg-white/20"
            aria-label="Cámara anterior"
          >
            <ChevronLeft size={13} strokeWidth={2.6} />
          </button>
          {camera?.device_code ?? 'CAM'}
          <button
            type="button"
            onClick={() => cycle(1)}
            className="grid size-5 place-items-center rounded-full hover:bg-white/20"
            aria-label="Cámara siguiente"
          >
            <ChevronRight size={13} strokeWidth={2.6} />
          </button>
        </span>
        <span
          className={`absolute right-2.5 top-2.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10.5px] font-extrabold uppercase tracking-wide text-white ${
            stream ? 'bg-[#e5484d]' : 'bg-[#0f766e]'
          }`}
        >
          <span className="cx-blink size-1.5 rounded-full bg-white" />
          {stream ? 'En vivo' : 'IA activa'}
        </span>
        {!stream && (
          <span className="absolute bottom-2 left-2.5 rounded-full bg-black/45 px-2 py-0.5 text-[10.5px] font-medium text-white/90">
            Vista ilustrativa · {camera?.name.replace(/^Cámara\s+/, '') ?? ''}
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-cx-bluesoft text-cx-blue">
          <span className="cx-wave flex h-4 items-center gap-[3px]">
            <span style={{ height: 8, animationDelay: '0s' }} />
            <span style={{ height: 14, animationDelay: '-0.3s' }} />
            <span style={{ height: 10, animationDelay: '-0.6s' }} />
            <span style={{ height: 16, animationDelay: '-0.15s' }} />
          </span>
        </span>
        <div className="min-w-0 leading-tight">
          <div className="text-[13.5px] font-bold text-cx-ink">IA analizando la zona…</div>
          <div className="truncate text-[12px] text-cx-ink3">
            {last.data
              ? `Última: ${CAMERA_EVENT_LABEL[last.data.event_type] ?? last.data.event_type} · ${Math.round((last.data.confidence ?? 0) * 100)} % · ${formatAge(last.data.recorded_at)}`
              : 'Busca agua, obstáculos, accidentes y aforo'}
          </div>
        </div>
      </div>
    </Card>
  );
}

function IncidentsCard({ data }: { data: CxData }) {
  const online = data.cameras.filter((c) => c.status === 'online').length;
  return (
    <Card
      title="Incidencias en la ciudad"
      action={
        <Link
          to="/centro/incidencias"
          className="text-[12.5px] font-semibold text-cx-blue hover:underline"
        >
          Ver
        </Link>
      }
    >
      <ul className="flex flex-col gap-1">
        {PRIORITIES.map((p) => (
          <li key={p} className="flex items-center gap-3 py-1">
            <span
              className="grid size-7 place-items-center rounded-full text-[14px] font-extrabold text-white"
              style={{ background: PRIORITY_COLOR[p] }}
            >
              !
            </span>
            <span className="cx-tabular w-8 text-[22px] font-extrabold tracking-tight text-cx-ink">
              {data.counts[p]}
            </span>
            <span className="text-[13px] text-cx-ink2">
              Prioridad {PRIORITY_TEXT[p].toLowerCase()}
            </span>
          </li>
        ))}
        <li className="mt-1 flex items-center gap-3 border-t border-cx-line2 pt-2.5">
          <span className="grid size-7 place-items-center rounded-full bg-cx-line2 text-cx-ink2">
            <Video size={14} strokeWidth={2.4} />
          </span>
          <span className="cx-tabular w-8 text-[22px] font-extrabold tracking-tight text-cx-ink">
            {online}
          </span>
          <span className="text-[13px] text-cx-ink2">
            Cámaras en línea{data.cameras.length ? ` de ${data.cameras.length}` : ''}
          </span>
        </li>
      </ul>
    </Card>
  );
}

function PredictiveCard() {
  const { risks, horizon } = usePrediction();
  const top = risks[0];
  if (!top) return null;
  const color = LEVEL_COLOR[top.level];
  return (
    <Card
      title="Alerta predictiva"
      icon={CloudRain}
      action={<Pill color={color}>{LEVEL_LABEL[top.level]}</Pill>}
    >
      <div className="text-[16px] font-bold text-cx-ink">{top.name}</div>
      <div className="cx-tabular mt-0.5 text-[12.5px] text-cx-ink3">
        Horizonte {horizon} min · probabilidad {Math.round(top.probability * 100)} % · confianza{' '}
        {confidenceLabel(top.confidence)}
      </div>
      <ul className="mt-2.5 flex flex-col gap-1">
        {top.factors.slice(0, 2).map((f) => (
          <li key={f.key} className="flex items-center gap-2 text-[12.5px] text-cx-ink2">
            <span className="size-1.5 rounded-full" style={{ background: color }} />
            {f.label}
          </li>
        ))}
      </ul>
      <Link
        to="/centro/prediccion"
        className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-cx-blue hover:underline"
      >
        Abrir predicción <ArrowRight size={14} />
      </Link>
    </Card>
  );
}

function SignalCard() {
  const sim = useSignal((s) => s.sim);
  useSignal((s) => s.v);
  const { phase } = sim;
  const fixed = usesFixedPlan(sim);
  const last = sim.decisions[0];
  const lampColor = { green: '#22c55e', yellow: '#f5b400', red: '#ef4444' } as const;
  return (
    <Card
      title={`Semáforo ${MAIN_LIGHT}`}
      icon={TrafficLightIcon}
      action={
        <Pill color={fixed ? '#64748b' : '#1f5fa6'}>{fixed ? 'Plan fijo' : 'Adaptativo'}</Pill>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {(['N', 'E'] as const).map((a) => {
          const lamp = lampFor(sim, a);
          return (
            <div key={a} className="rounded-[12px] bg-cx-line2 px-3 py-2">
              <div className="text-[11.5px] font-semibold text-cx-ink3">
                {AXIS_LABEL[a === 'N' ? 'NS' : 'EW']}
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[14px] font-bold text-cx-ink">
                <span
                  className="size-2.5 rounded-full"
                  style={{ background: lampColor[lamp], boxShadow: `0 0 8px ${lampColor[lamp]}` }}
                />
                {lamp === 'green' ? 'Verde' : lamp === 'yellow' ? 'Amarillo' : 'Rojo'}
                {lamp === 'green' && (
                  <span className="cx-tabular text-[12px] font-semibold text-cx-ink3">
                    {Math.floor(phase.elapsed)} s
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {last && <p className="mt-2.5 line-clamp-2 text-[12.5px] text-cx-ink2">{last.text}</p>}
      <Link
        to="/centro/interseccion"
        className="mt-2.5 inline-flex items-center gap-1.5 text-[13px] font-semibold text-cx-blue hover:underline"
      >
        Ver intersección <ArrowRight size={14} />
      </Link>
    </Card>
  );
}

function Legend() {
  return (
    <MapPanel className="w-[170px]">
      <div className="mb-1.5 text-[12.5px] font-bold text-cx-ink">Nivel de incidencia</div>
      <ul className="flex flex-col gap-1">
        {PRIORITIES.map((p) => (
          <li key={p} className="flex items-center gap-2 text-[12.5px] text-cx-ink2">
            <span className="size-3 rounded-full" style={{ background: PRIORITY_COLOR[p] }} />
            {PRIORITY_TEXT[p]}
          </li>
        ))}
        <li className="flex items-center gap-2 text-[12.5px] text-cx-ink2">
          <span className="size-3 rounded-full bg-cx-ok" />
          Sensor normal
        </li>
      </ul>
    </MapPanel>
  );
}

function LayerPanel({
  layers,
  toggle,
  data,
}: {
  layers: Record<LayerKey, boolean>;
  toggle: (k: LayerKey) => void;
  data: CxData;
}) {
  const { map } = useCxMap();
  return (
    <MapPanel className="w-[204px] !p-2">
      <div className="px-2 pb-1.5 pt-1 text-[14px] font-bold text-cx-ink">Mapa</div>
      <button
        type="button"
        onClick={() => flyToView(map, HOME_VIEW, 800)}
        className="flex w-full items-center gap-2.5 rounded-[10px] bg-cx-bluesoft px-2.5 py-2 text-[13px] font-semibold text-cx-blue"
      >
        <MapPin size={16} strokeWidth={2.2} /> Vista general
      </button>
      {LAYER_ITEMS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => toggle(key)}
          aria-pressed={layers[key]}
          className={`mt-0.5 flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium transition hover:bg-cx-line2 ${
            layers[key] ? 'text-cx-ink' : 'text-cx-ink3'
          }`}
        >
          <Icon size={16} strokeWidth={2.1} />
          <span className="flex-1 text-left">{label}</span>
          <span
            className={`size-2 rounded-full ${layers[key] ? 'bg-cx-blue' : 'bg-[#cfd7e3]'}`}
            aria-hidden
          />
        </button>
      ))}
      <ZoneJumps data={data} />
    </MapPanel>
  );
}

export function OverviewPage() {
  const data = useCxData();
  const [layers, setLayers] = useState<Record<LayerKey, boolean>>({
    incidents: true,
    cameras: true,
    drains: true,
    lights: true,
    risk: true,
  });
  const [camCode, setCamCode] = useState<string>('CAM-001');
  const camera = data.cameras.find((c) => c.device_code === camCode) ?? data.cameras[0] ?? null;
  const toggle = (k: LayerKey) => setLayers((l) => ({ ...l, [k]: !l[k] }));

  const overlays = useMemo(() => {
    const areas: Feature[] = [];
    if (layers.risk) {
      for (const z of data.zoneList) {
        areas.push({
          type: 'Feature',
          properties: {
            fill: '#1f5fa6',
            fillOpacity: 0.035,
            line: '#8ea3c4',
            lineWidth: 1.2,
            dashed: true,
          },
          geometry: { type: 'Polygon', coordinates: [z.ring] },
        });
      }
      for (const f of data.flood?.features ?? []) {
        const level = String(f.properties?.risk_level ?? 'medium');
        const color = level === 'high' ? '#e5484d' : level === 'medium' ? '#f5812a' : '#eeb000';
        areas.push({
          ...f,
          properties: {
            ...f.properties,
            fill: color,
            fillOpacity: 0.16,
            line: color,
            lineWidth: 1.6,
          },
        });
      }
    }
    const cones: Feature[] = layers.cameras
      ? data.cameras.map((c) =>
          cone(lngLatOf(c), cameraHeading(c, data.devices, data.incidents), 62, 230, {
            color: '#1f5fa6',
            fillOpacity: c.device_code === camera?.device_code ? 0.26 : 0.1,
          }),
        )
      : [];
    return { areas: fc(areas), cones: fc(cones) };
  }, [layers, data, camera?.device_code]);

  return (
    <div className="flex min-h-full flex-col xl:h-full xl:min-h-[720px]">
      <PageHeader title="Mapa general" subtitle="Monitoreo en tiempo real de la ciudad">
        <TopActions />
      </PageHeader>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] px-4 sm:px-7 pb-6">
        <CxMap
          view={HOME_VIEW}
          overlays={overlays}
          className="h-[62vh] min-h-[380px] rounded-[22px] xl:h-full xl:min-h-[560px] border border-cx-line shadow-cx"
          chrome={
            <>
              <div className="absolute left-4 top-4 hidden sm:block">
                <LayerPanel layers={layers} toggle={toggle} data={data} />
              </div>
              <div className="absolute bottom-4 left-4 hidden sm:block">
                <Legend />
              </div>
              <div className="absolute right-4 top-4">
                <MapControls home={HOME_VIEW} />
              </div>
              <FallbackNotice />
            </>
          }
        >
          <FocusListener />
          {data.zoneList.map((z) => {
            const c: LngLat = ringCenter(z.ring);
            return (
              <MapMarker
                key={z.code}
                lngLat={[c[0], z.ring.reduce((m, p) => Math.max(m, p[1] ?? 0), -90) - 0.0012]}
                z={0}
              >
                <ZoneLabel name={z.name} />
              </MapMarker>
            );
          })}
          <DeviceLayer
            data={data}
            layers={layers}
            cameraCode={camera?.device_code ?? null}
            onCamera={setCamCode}
          />
          {layers.incidents && <IncidentLayer incidents={data.incidents} />}
        </CxMap>
        <aside className="cx-scroll-hidden flex min-h-0 flex-col gap-4 overflow-y-auto pb-1">
          <CameraCard data={data} camera={camera} onPick={setCamCode} />
          <IncidentsCard data={data} />
          <PredictiveCard />
          <SignalCard />
          <Note className="px-1">
            Datos en vivo de la API y el simulador. La vista de cámara es ilustrativa hasta conectar
            un stream real; el semáforo y la predicción se calculan en el navegador.
          </Note>
        </aside>
      </div>
    </div>
  );
}
