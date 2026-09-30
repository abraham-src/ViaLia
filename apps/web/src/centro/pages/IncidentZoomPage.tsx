import type { IncidentDto } from '@simu/shared-types';
import type { Feature } from 'geojson';
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  Droplets,
  Expand,
  Layers,
  MapPin,
  ScanSearch,
  Video,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { formatAge } from '../../lib/format';
import { useMapFocus } from '../components/focus';
import { TrafficLightIcon, type IconType } from '../components/icons';
import { TopActions } from '../components/TopActions';
import {
  Breadcrumb,
  ButtonLink,
  Card,
  Empty,
  InfoRow,
  PageHeader,
  PriorityPill,
  StatusPill,
} from '../components/ui';
import { cameraHeading, lngLatOf, type CxData } from '../data/useCxData';
import { useIncidentContext } from '../data/useIncidentContext';
import { bearingDeg, circle, cone, distanceM, fc, formatDistance, pointInRing } from '../lib/geo';
import { BRAND } from '../brand';
import { INCIDENT_VISUAL, PRIORITY_COLOR, PRIORITY_TEXT, formatWhen } from '../lib/visuals';
import { CxMap, MapMarker, type CxView } from '../map/CxMap';
import { FallbackNotice, MapControls, MapPanel } from '../map/controls';
import { LocationMiniMap } from '../map/LocationMiniMap';
import {
  CameraPin,
  Callout,
  DrainGauge,
  IncidentBeacon,
  IncidentPin,
  TrafficLightPin,
} from '../map/markers';
import { lampFor, fixedLampAt, usesFixedPlan } from '../sim/intersection';
import { MAIN_LIGHT, useSignal } from '../sim/store';

const NEAR_M = 420;
const CORRELATION_M = 250;

export function IncidentSwitcher({
  data,
  current,
  suffix = '',
}: {
  data: CxData;
  current: IncidentDto;
  suffix?: string;
}) {
  const navigate = useNavigate();
  const list = data.incidents;
  const idx = list.findIndex((i) => i.id === current.id);
  const go = (d: number) => {
    if (!list.length) return;
    const next = list[(Math.max(0, idx) + d + list.length) % list.length];
    if (next) navigate(`/centro/incidencias/${next.id}${suffix}`);
  };
  return (
    <div className="flex h-11 items-center gap-1 rounded-[14px] border border-cx-line bg-white px-1.5 shadow-cx">
      <button
        type="button"
        onClick={() => go(-1)}
        className="grid size-8 place-items-center rounded-[10px] text-cx-ink2 hover:bg-cx-line2"
        aria-label="Incidencia anterior"
      >
        <ChevronLeft size={17} strokeWidth={2.3} />
      </button>
      <span className="cx-tabular px-1 text-[13px] font-semibold text-cx-ink2">
        {idx >= 0 ? `${idx + 1} de ${list.length}` : 'Resuelta'}
      </span>
      <button
        type="button"
        onClick={() => go(1)}
        className="grid size-8 place-items-center rounded-[10px] text-cx-ink2 hover:bg-cx-line2"
        aria-label="Incidencia siguiente"
      >
        <ChevronRight size={17} strokeWidth={2.3} />
      </button>
    </div>
  );
}

type Toggles = { cameras: boolean; infra: boolean; radius: boolean };

function ZoomPanel({ toggles, set }: { toggles: Toggles; set: (t: Toggles) => void }) {
  const items: Array<{ key: keyof Toggles; label: string; icon: IconType }> = [
    { key: 'cameras', label: 'Cámaras cercanas', icon: Video },
    { key: 'infra', label: 'Infraestructura', icon: Droplets },
    { key: 'radius', label: 'Radio de la regla', icon: Layers },
  ];
  return (
    <MapPanel className="w-[214px] !p-2">
      <div className="px-2 pb-1.5 pt-1 text-[14px] font-bold text-cx-ink">Mapa</div>
      <Link
        to="/centro"
        className="flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium text-cx-ink hover:bg-cx-line2"
      >
        <MapPin size={16} strokeWidth={2.1} /> Vista general
      </Link>
      <div className="mt-0.5 flex items-center gap-2.5 rounded-[10px] bg-cx-bluesoft px-2.5 py-2 text-[13px] font-semibold text-cx-blue">
        <ScanSearch size={16} strokeWidth={2.2} /> Zoom de incidencia
      </div>
      {items.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          aria-pressed={toggles[key]}
          onClick={() => set({ ...toggles, [key]: !toggles[key] })}
          className={`mt-0.5 flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-[13px] font-medium hover:bg-cx-line2 ${
            toggles[key] ? 'text-cx-ink' : 'text-cx-ink3'
          }`}
        >
          <Icon size={16} strokeWidth={2.1} />
          <span className="flex-1 text-left">{label}</span>
          <span className={`size-2 rounded-full ${toggles[key] ? 'bg-cx-blue' : 'bg-[#cfd7e3]'}`} />
        </button>
      ))}
    </MapPanel>
  );
}

export function IncidentZoomPage() {
  const { id } = useParams();
  const { data, incident, ctx, loading, notFound } = useIncidentContext(id);
  const sim = useSignal((s) => s.sim);
  useSignal((s) => s.v);
  const navigate = useNavigate();
  const focus = useMapFocus((s) => s.focus);
  const [toggles, setToggles] = useState<Toggles>({ cameras: true, infra: true, radius: true });

  const view: CxView | null = useMemo(
    () =>
      incident
        ? {
            center: [incident.longitude, incident.latitude],
            zoom: 17.4,
            pitch: 56,
            bearing: -22,
          }
        : null,
    [incident],
  );

  const near = useMemo(() => {
    if (!ctx) return { cameras: [], drains: [], lights: [] };
    const within = (d: { longitude: number; latitude: number }) =>
      distanceM(ctx.point, lngLatOf(d)) <= NEAR_M;
    return {
      cameras: data.cameras.filter(within),
      drains: data.drains.filter(within),
      lights: data.lights.filter(within),
    };
  }, [ctx, data]);

  const overlays = useMemo(() => {
    if (!incident || !ctx) return {};
    const color = PRIORITY_COLOR[incident.priority];
    const rings: Feature[] = [circle(ctx.point, 22, { color, fillOpacity: 0.12, lineWidth: 2 })];
    if (toggles.radius) {
      rings.push(
        circle(ctx.point, CORRELATION_M, { color: '#1f5fa6', fillOpacity: 0.035, lineWidth: 1.6 }),
      );
    }
    const cones = toggles.cameras
      ? near.cameras.map((c) => {
          const heading =
            distanceM(lngLatOf(c), ctx.point) > 4
              ? bearingDeg(lngLatOf(c), ctx.point)
              : cameraHeading(c, data.devices, data.incidents);
          return cone(lngLatOf(c), heading, 56, 90, { color: '#1f5fa6', fillOpacity: 0.2 });
        })
      : [];
    const areas: Feature[] = (data.flood?.features ?? [])
      .filter(
        (f) =>
          f.geometry.type === 'Polygon' && pointInRing(ctx.point, f.geometry.coordinates[0] ?? []),
      )
      .map((f) => ({
        ...f,
        properties: {
          fill: '#e5484d',
          fillOpacity: 0.045,
          line: '#e5484d',
          lineWidth: 1.2,
          dashed: true,
        },
      }));
    return { rings: fc(rings), cones: fc(cones), areas: fc(areas) };
  }, [incident, ctx, toggles, near.cameras, data]);

  if (!incident || !ctx || !view) {
    return (
      <div className="flex h-full flex-col">
        <PageHeader
          title="Zoom de incidencia"
          subtitle="Vista detallada del área con la incidencia"
        >
          <TopActions />
        </PageHeader>
        <div className="px-4 sm:px-7">
          <Card>
            <Empty>
              {loading
                ? 'Cargando incidencias…'
                : notFound
                  ? 'Esa incidencia ya no existe o fue resuelta.'
                  : 'No hay incidencias activas. Corre un escenario en el simulador para ver una.'}
            </Empty>
          </Card>
        </div>
      </div>
    );
  }

  const visual = INCIDENT_VISUAL[incident.type];
  const color = PRIORITY_COLOR[incident.priority];
  const zoneName = ctx.zone?.name ?? BRAND.city;
  const now = Date.now() / 1000;

  return (
    <div className="flex min-h-full flex-col xl:h-full xl:min-h-[720px]">
      <PageHeader title="Zoom de incidencia" subtitle="Vista detallada del área con la incidencia">
        <Breadcrumb
          items={[
            { label: 'Ciudad', to: '/centro' },
            { label: zoneName },
            { label: ctx.names[0] ?? ctx.address ?? visual.title },
          ]}
        />
        <IncidentSwitcher data={data} current={incident} />
        <TopActions search={false} />
      </PageHeader>
      <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_340px] px-4 sm:px-7 pb-6">
        <CxMap
          view={view}
          viewKey={incident.id}
          overlays={overlays}
          className="h-[62vh] min-h-[380px] rounded-[22px] xl:h-full xl:min-h-[560px] border border-cx-line shadow-cx"
          chrome={
            <>
              <div className="absolute left-4 top-4 hidden sm:block">
                <ZoomPanel toggles={toggles} set={setToggles} />
              </div>
              <div className="absolute bottom-4 left-4">
                <MapControls home={view} />
              </div>
              <div className="absolute right-4 top-4 hidden rounded-[14px] border sm:block border-white/70 bg-white/95 px-3.5 py-2.5 shadow-cx-lg backdrop-blur">
                <div className="text-[11px] font-bold uppercase tracking-[0.12em] text-cx-ink3">
                  Radio de la regla
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[13px] font-semibold text-cx-ink">
                  <span className="h-0 w-6 border-t-2 border-dashed border-cx-blue" />{' '}
                  {CORRELATION_M} m cámara ↔ coladera
                </div>
                <div className="mt-1 flex items-center gap-2 text-[13px] font-semibold text-cx-ink">
                  <span
                    className="size-3 rounded-full border-2"
                    style={{ borderColor: color, background: `${color}22` }}
                  />{' '}
                  Precisión del evento
                </div>
              </div>
              <FallbackNotice />
            </>
          }
        >
          {toggles.infra &&
            near.drains.map((d) =>
              d.drain ? (
                <MapMarker key={d.device_code} lngLat={lngLatOf(d)} offset={[0, 52]} z={10}>
                  <DrainGauge
                    level={d.drain.obstruction_level}
                    status={d.drain.status}
                    deviceStatus={d.status}
                    title={d.device_code}
                  />
                </MapMarker>
              ) : null,
            )}
          {toggles.infra &&
            near.lights.map((l) => (
              <MapMarker key={l.device_code} lngLat={lngLatOf(l)} anchor="bottom" z={11}>
                <TrafficLightPin
                  lamp={l.device_code === MAIN_LIGHT ? lampFor(sim, 'E') : fixedLampAt(now, 17)}
                  adaptive={l.device_code === MAIN_LIGHT && !usesFixedPlan(sim)}
                  title={l.device_code}
                />
              </MapMarker>
            ))}
          {toggles.cameras &&
            near.cameras.map((c) => (
              <MapMarker key={c.device_code} lngLat={lngLatOf(c)} offset={[-78, -4]} z={20}>
                <CameraPin status={c.status} title={`${c.device_code} · ${c.name}`} />
              </MapMarker>
            ))}
          {ctx.others
            .filter((o) => o.distance <= NEAR_M)
            .map(({ incident: o }) => (
              <MapMarker key={o.id} lngLat={lngLatOf(o)} anchor="bottom" z={25}>
                <IncidentPin
                  priority={o.priority}
                  size={28}
                  title={INCIDENT_VISUAL[o.type].title}
                  onClick={() => navigate(`/centro/incidencias/${o.id}`)}
                />
              </MapMarker>
            ))}
          <MapMarker lngLat={ctx.point} z={60}>
            <div className="relative">
              <IncidentBeacon
                priority={incident.priority}
                onClick={() => navigate(`/centro/incidencias/${incident.id}/detalle`)}
              />
              <div className="absolute bottom-[calc(100%+16px)] left-1/2 -translate-x-1/2">
                <Callout
                  tone={
                    incident.priority === 'critical' || incident.priority === 'high'
                      ? 'red'
                      : 'amber'
                  }
                  title="Indicador preciso"
                  subtitle={`${visual.title}${incident.device_code ? ` · ${incident.device_code}` : ''}`}
                />
              </div>
            </div>
          </MapMarker>
        </CxMap>

        <aside className="cx-scroll-hidden flex min-h-0 flex-col gap-4 overflow-y-auto pb-1">
          <Card title="Detalles de la ubicación" bodyClassName="!pt-3">
            <div className="relative overflow-hidden rounded-[14px] border border-cx-line">
              <LocationMiniMap
                center={ctx.point}
                color={color}
                marks={
                  ctx.camera && ctx.camera.distance < 200
                    ? [{ at: lngLatOf(ctx.camera.item), color: '#1f5fa6' }]
                    : []
                }
                className="block aspect-[320/190] w-full"
              />
              <button
                type="button"
                onClick={() => {
                  focus({ center: ctx.point, zoom: 16.5, label: incident.id });
                  navigate('/centro');
                }}
                className="absolute right-2 top-2 grid size-8 place-items-center rounded-[10px] bg-white text-cx-ink2 shadow-cx hover:text-cx-blue"
                aria-label="Ver en el mapa general"
                title="Ver en el mapa general"
              >
                <Expand size={15} strokeWidth={2.2} />
              </button>
            </div>
            <div className="mt-2 divide-y divide-cx-line2">
              <InfoRow icon={MapPin}>
                {ctx.address ?? 'Sin calle cercana en la red local'}
                <div className="text-[12.5px] font-normal text-cx-ink3">
                  {ctx.zone
                    ? `${ctx.zone.name}${ctx.zone.alcaldia ? `, ${ctx.zone.alcaldia}` : ''}`
                    : BRAND.city}
                </div>
              </InfoRow>
              <InfoRow icon={Crosshair}>
                <span className="cx-tabular">
                  {incident.latitude.toFixed(5)}, {incident.longitude.toFixed(5)}
                </span>
              </InfoRow>
              {ctx.camera && (
                <InfoRow icon={Video} label="Cámara más cercana">
                  {ctx.camera.item.device_code}{' '}
                  <span className="font-normal text-cx-ink3">
                    ({formatDistance(ctx.camera.distance)})
                  </span>
                </InfoRow>
              )}
              {ctx.drain && ctx.drain.distance < 600 && ctx.drain.item.drain && (
                <InfoRow icon={Droplets} label="Coladera más cercana">
                  {ctx.drain.item.device_code} · {ctx.drain.item.drain.obstruction_level} %{' '}
                  <span className="font-normal text-cx-ink3">
                    ({formatDistance(ctx.drain.distance)})
                  </span>
                </InfoRow>
              )}
              {ctx.light && (
                <InfoRow icon={TrafficLightIcon} label="Semáforo más cercano">
                  {ctx.light.item.device_code}{' '}
                  <span className="font-normal text-cx-ink3">
                    ({formatDistance(ctx.light.distance)})
                  </span>
                </InfoRow>
              )}
              <InfoRow icon={Clock} label="Hora de detección">
                {formatWhen(incident.created_at)}{' '}
                <span className="font-normal text-cx-ink3">· {formatAge(incident.created_at)}</span>
              </InfoRow>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <PriorityPill priority={incident.priority} />
              <StatusPill status={incident.status} />
            </div>
            <ButtonLink
              to={`/centro/incidencias/${incident.id}/detalle`}
              className="mt-4 w-full !py-3"
            >
              Ver detalle de la incidencia <ArrowRight size={16} strokeWidth={2.3} />
            </ButtonLink>
          </Card>

          <Card title="Incidencias cercanas">
            {ctx.others.length === 0 ? (
              <Empty>No hay otras incidencias activas.</Empty>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {ctx.others.slice(0, 4).map(({ incident: o, distance }) => (
                  <li key={o.id}>
                    <Link
                      to={`/centro/incidencias/${o.id}`}
                      className="flex items-center gap-3 rounded-[12px] px-2 py-2 hover:bg-cx-line2"
                    >
                      <span
                        className="grid size-8 shrink-0 place-items-center rounded-full text-[13px] font-extrabold text-white"
                        style={{ background: PRIORITY_COLOR[o.priority] }}
                      >
                        !
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13.5px] font-semibold text-cx-ink">
                          {INCIDENT_VISUAL[o.type].title}
                        </span>
                        <span className="block text-[12px] text-cx-ink3">
                          {PRIORITY_TEXT[o.priority]} · {formatDistance(distance)} ·{' '}
                          {formatAge(o.created_at)}
                        </span>
                      </span>
                      <ChevronRight size={16} className="text-cx-ink3" />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </aside>
      </div>
    </div>
  );
}
