import type { Feature, FeatureCollection, Point, Polygon, Position } from 'geojson';
import { Hand, PersonStanding } from 'lucide-react';
import type { GeoJSONSource } from 'maplibre-gl';
import { useEffect, useMemo, useRef } from 'react';
import { cone, destination, fc, type LngLat } from '../lib/geo';
import { ARM_BEARING, armPoint } from '../sim/geometry';
import {
  APPROACHES,
  APPROACH_LABEL,
  AXIS_OF,
  lampFor,
  pedSignal,
  queueLen,
  type Approach,
  type SimState,
} from '../sim/intersection';
import { useSignal } from '../sim/store';
import { CxMap, MapMarker, useCxMap, type CxView } from './CxMap';
import { FallbackNotice, MapControls } from './controls';

/**
 * Cruce Insurgentes × Álvaro Obregón sobre el mapa real (2D y 3D). Los autos salen del
 * mismo modelo de colas que el semáforo: la cola de cada acceso, las salidas y las fases
 * vienen de la simulación; aquí solo se interpolan posiciones sobre la geometría real
 * de cada brazo. En 3D los autos son volúmenes extruidos.
 */

// Medidas en metros, tomadas de las calzadas OSM: en Insurgentes cada sentido va a ~8.4 m
// del eje (carriles centrales del Metrobús); en Álvaro Obregón a ~12.4 m (camellón ancho).
/** Centro de la calzada de entrada de cada acceso, a la derecha del eje. */
const LANE: Record<Approach, number> = { N: 8.4, S: 8.4, E: 12.4, W: 12.4 };
/** Media anchura de cada calle, de eje a banqueta (NS = Insurgentes, EW = Álvaro Obregón). */
const HALF = { NS: 13, EW: 17 } as const;
const cross = (a: Approach) => (AXIS_OF[a] === 'NS' ? 'EW' : 'NS');
/** Línea de alto: justo antes de la calle transversal. */
const STOP: Record<Approach, number> = {
  N: HALF.EW + 1,
  S: HALF.EW + 1,
  E: HALF.NS + 1,
  W: HALF.NS + 1,
};
const CAR_L = 4.4;
const CAR_W = 1.9;
const GAP = 6.6;
const MAX_VISIBLE = 8;
const SPAWN = 70;
const DETECT = 42; // largo de la zona de conteo
const COLORS = [
  '#f8fafc',
  '#1f2937',
  '#ef4444',
  '#3b82f6',
  '#94a3b8',
  '#f59e0b',
  '#10b981',
  '#6366f1',
];

interface VCar {
  id: number;
  a: Approach;
  /** Distancia recorrida respecto a la línea de alto (negativa = antes de llegar). */
  s: number;
  v: number;
  go: boolean;
  color: string;
}

function carPolygon(center: LngLat, car: VCar): Feature<Polygon> {
  // Frente del auto: a (STOP - s) m del centro sobre su brazo, en su calzada.
  const along = STOP[car.a] - car.s;
  const heading = ARM_BEARING[car.a] + 180;
  const front = armPoint(center, car.a, along, LANE[car.a]);
  const back = destination(front, heading + 180, CAR_L);
  const half = CAR_W / 2;
  const ring: Position[] = [
    destination(front, heading - 90, half),
    destination(front, heading + 90, half),
    destination(back, heading + 90, half),
    destination(back, heading - 90, half),
  ];
  ring.push(ring[0]!);
  return {
    type: 'Feature',
    properties: { color: car.color },
    geometry: { type: 'Polygon', coordinates: [ring] },
  };
}

/** Esquina entre el brazo `a` y el brazo `b` (sobre las banquetas). */
function corner(center: LngLat, a: Approach, b: Approach, extra = 1.5): LngLat {
  return destination(
    destination(center, ARM_BEARING[a], HALF[cross(a)] + extra),
    ARM_BEARING[b],
    HALF[cross(b)] + extra,
  );
}

/** Esquinas del cruce, en orden: N-O, N-E, S-E, S-O. */
function corners(center: LngLat): LngLat[] {
  return [
    corner(center, 'N', 'W'),
    corner(center, 'N', 'E'),
    corner(center, 'S', 'E'),
    corner(center, 'S', 'W'),
  ];
}

function pedestrians(center: LngLat, sim: SimState): Array<Feature<Point>> {
  const sig = pedSignal(sim);
  const cs = corners(center);
  const out: Array<Feature<Point>> = [];
  const pt = (p: LngLat, color: string): Feature<Point> => ({
    type: 'Feature',
    properties: { color },
    geometry: { type: 'Point', coordinates: p },
  });
  if (sig === 'walk' || sig === 'flash') {
    const p = Math.min(1, sim.phase.elapsed / (sig === 'walk' ? 9 : 5));
    const t = sig === 'walk' ? p * 0.8 : 0.8 + p * 0.2;
    cs.forEach((c, i) => {
      const n = cs[(i + 1) % 4] ?? c;
      for (const k of [0, 1]) {
        const f = Math.max(0, t - k * 0.12);
        out.push(
          pt([c[0] + (n[0] - c[0]) * f, c[1] + (n[1] - c[1]) * f], k ? '#a855f7' : '#f97316'),
        );
      }
    });
    return out;
  }
  const waiting = sim.peds.length;
  cs.forEach((c, i) => {
    const n = Math.min(3, Math.floor(waiting / 4) + (i < waiting % 4 ? 1 : 0));
    for (let k = 0; k < n; k++) {
      out.push(
        pt(destination(c, 90, (k - 1) * 1.6), ['#f97316', '#a855f7', '#0ea5e9'][k] ?? '#f97316'),
      );
    }
  });
  return out;
}

/** Esquina N-E, donde está la cámara de conteo. */
const cameraPoint = (center: LngLat): LngLat => corner(center, 'N', 'E', 4);

/** Autos y peatones animados: capas propias, actualizadas en cada cuadro. */
function MovingLayer({ center }: { center: LngLat }) {
  const { map } = useCxMap();
  const centerRef = useRef(center);
  centerRef.current = center;

  useEffect(() => {
    const EMPTY: FeatureCollection = { type: 'FeatureCollection', features: [] };
    if (!map.getSource('ix-cars')) {
      map.addSource('ix-cars', { type: 'geojson', data: EMPTY });
      map.addSource('ix-peds', { type: 'geojson', data: EMPTY });
      map.addLayer({
        id: 'ix-cars',
        type: 'fill-extrusion',
        source: 'ix-cars',
        paint: {
          'fill-extrusion-color': ['get', 'color'],
          'fill-extrusion-height': 1.5,
          'fill-extrusion-base': 0.15,
          'fill-extrusion-opacity': 0.95,
        },
      });
      map.addLayer({
        id: 'ix-peds',
        type: 'circle',
        source: 'ix-peds',
        paint: {
          'circle-color': ['get', 'color'],
          'circle-radius': ['interpolate', ['linear'], ['zoom'], 16, 2.5, 19, 6],
          'circle-stroke-color': '#ffffff',
          'circle-stroke-width': 1.5,
          'circle-pitch-alignment': 'map',
        },
      });
    }

    let cars: VCar[] = [];
    let sim = useSignal.getState().sim;
    let seen = { ...sim.served };
    let nextId = 1;
    let last = performance.now();
    let raf = 0;

    const loop = (now: number) => {
      const state = useSignal.getState();
      const dt = Math.min(0.05, (now - last) / 1000) * state.speed;
      last = now;
      // Si la simulación se reinicia, se reinician también los autos dibujados.
      if (state.sim !== sim) {
        sim = state.sim;
        cars = [];
        seen = { ...sim.served };
      }
      for (const a of APPROACHES) {
        // Salidas del modelo → la cabeza de la fila arranca.
        while (seen[a] < sim.served[a]) {
          seen[a]++;
          const head = cars.filter((c) => c.a === a && !c.go).sort((x, y) => y.s - x.s)[0];
          if (head) head.go = true;
        }
        const queued = cars.filter((c) => c.a === a && !c.go);
        const want = Math.min(MAX_VISIBLE, queueLen(sim, a));
        for (let i = queued.length; i < want; i++) {
          cars.push({
            id: nextId++,
            a,
            s: -SPAWN - i * GAP,
            v: 10,
            go: false,
            color: COLORS[nextId % COLORS.length] ?? '#fff',
          });
        }
        if (queued.length > want) {
          const extra = queued.sort((x, y) => x.s - y.s).slice(0, queued.length - want);
          cars = cars.filter((c) => !extra.includes(c));
        }
      }
      // Los de la fila avanzan hasta su lugar; los que salen aceleran y cruzan.
      for (const a of APPROACHES) {
        cars
          .filter((c) => c.a === a && !c.go)
          .sort((x, y) => y.s - x.s)
          .forEach((c, k) => {
            const target = -0.8 - k * GAP;
            const speed = Math.min(12, Math.max(2, (target - c.s) * 1.6));
            c.s = Math.min(target, c.s + speed * dt);
          });
      }
      for (const c of cars) {
        if (!c.go) continue;
        c.v = Math.min(13, c.v + 3.5 * dt);
        c.s += c.v * dt;
      }
      cars = cars.filter((c) => c.s < STOP[c.a] * 2 + 80);

      const ctr = centerRef.current;
      (map.getSource('ix-cars') as GeoJSONSource | undefined)?.setData(
        fc(cars.map((c) => carPolygon(ctr, c))),
      );
      (map.getSource('ix-peds') as GeoJSONSource | undefined)?.setData(fc(pedestrians(ctr, sim)));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [map]);

  return null;
}

const LAMP: Record<'red' | 'yellow' | 'green', string> = {
  red: '#ff4d4f',
  yellow: '#ffc53d',
  green: '#2ee37a',
};

function SignalHead({ lamp, label }: { lamp: 'red' | 'yellow' | 'green'; label: string }) {
  return (
    <div className="flex flex-col items-center gap-0.5" title={`Semáforo acceso ${label}`}>
      <div className="flex flex-col gap-[3px] rounded-[7px] border-2 border-white bg-[#0e1c33] px-[4px] py-[4px] shadow-cx">
        {(['red', 'yellow', 'green'] as const).map((l) => (
          <span
            key={l}
            className="block size-[9px] rounded-full"
            style={{
              background: l === lamp ? LAMP[l] : '#2a3a55',
              boxShadow: l === lamp ? `0 0 7px ${LAMP[l]}` : undefined,
            }}
          />
        ))}
      </div>
    </div>
  );
}

function PedSignal({ sig }: { sig: 'walk' | 'flash' | 'dont' }) {
  const color = sig === 'walk' ? '#22c55e' : '#ef4444';
  return (
    <span
      className={`grid size-6 place-items-center rounded-[6px] border-[1.5px] border-white bg-[#0e1c33] text-[12px] shadow-cx ${sig === 'flash' ? 'cx-blink' : ''}`}
      style={{ color }}
      title={
        sig === 'walk'
          ? 'Peatones: cruzar'
          : sig === 'flash'
            ? 'Peatones: despejar'
            : 'Peatones: esperar'
      }
    >
      {sig === 'walk' ? (
        <PersonStanding size={15} strokeWidth={2.6} />
      ) : (
        <Hand size={13} strokeWidth={2.6} />
      )}
    </span>
  );
}

export function IntersectionMap({
  center: rawCenter,
  className = '',
}: {
  center: LngLat;
  className?: string;
}) {
  const [lng, lat] = rawCenter;
  const center = useMemo<LngLat>(() => [lng, lat], [lng, lat]);
  const sim = useSignal((s) => s.sim);
  useSignal((s) => s.v);
  const sig = pedSignal(sim);

  const view: CxView = useMemo(
    () => ({ center, zoom: 19, pitch: 0, bearing: ARM_BEARING.N }),
    [center],
  );

  // Zonas de conteo, líneas de alto y cono de la cámara (capas vectoriales del mapa).
  const flagKey = APPROACHES.map((a) => (sim.flags[a] ? a : '')).join('');
  const overlays = useMemo(() => {
    const areas: Array<Feature<Polygon>> = APPROACHES.map((a) => {
      const flagged = flagKey.includes(a);
      const ring: Position[] = [
        armPoint(center, a, STOP[a] + 1, LANE[a] - 1.8),
        armPoint(center, a, STOP[a] + 1, LANE[a] + 1.8),
        armPoint(center, a, STOP[a] + 1 + DETECT, LANE[a] + 1.8),
        armPoint(center, a, STOP[a] + 1 + DETECT, LANE[a] - 1.8),
      ];
      ring.push(ring[0]!);
      return {
        type: 'Feature',
        properties: {
          fill: flagged ? '#f5812a' : '#22d3ee',
          fillOpacity: flagged ? 0.22 : 0.1,
          line: flagged ? '#f5812a' : '#0891b2',
          lineWidth: 1.6,
          dashed: true,
        },
        geometry: { type: 'Polygon', coordinates: [ring] },
      };
    });
    const lines = APPROACHES.map((a) => ({
      type: 'Feature' as const,
      properties: { color: '#ffffff', width: 4 },
      geometry: {
        type: 'LineString' as const,
        coordinates: [
          armPoint(center, a, STOP[a], LANE[a] - 4),
          armPoint(center, a, STOP[a], HALF[AXIS_OF[a]] - 0.5),
        ],
      },
    }));
    const cones = [
      cone(cameraPoint(center), ARM_BEARING.S + 20, 80, 34, {
        color: '#2563eb',
        fillOpacity: 0.12,
      }),
    ];
    return { areas: fc(areas), lines: fc(lines), cones: fc(cones) };
  }, [center, flagKey]);

  const cs = corners(center);
  const camAt = cameraPoint(center);

  return (
    <CxMap
      view={view}
      overlays={overlays}
      className={className}
      ariaLabel="Cruce de Insurgentes y Álvaro Obregón con semáforo adaptativo"
      chrome={
        <>
          <div className="absolute right-4 top-4">
            <MapControls home={view} pitch3d={60} bearing3d={ARM_BEARING.N - 35} />
          </div>
          <FallbackNotice />
        </>
      }
    >
      <MovingLayer center={center} />
      {APPROACHES.map((a) => (
        <MapMarker
          key={`sig-${a}`}
          lngLat={armPoint(center, a, STOP[a] + 2, HALF[AXIS_OF[a]] + 1.5)}
          z={20}
        >
          <SignalHead lamp={lampFor(sim, a)} label={APPROACH_LABEL[a]} />
        </MapMarker>
      ))}
      {APPROACHES.map((a) => {
        const flagged = !!sim.flags[a];
        return (
          <MapMarker
            key={`cnt-${a}`}
            lngLat={armPoint(center, a, STOP[a] + DETECT / 2, HALF[AXIS_OF[a]] + 4)}
            z={15}
          >
            <span
              className="whitespace-nowrap rounded-full px-2.5 py-0.5 text-[12px] font-extrabold text-white shadow-cx"
              style={{ background: flagged ? '#f5812a' : '#0e1c33' }}
              title={flagged ? `${APPROACH_LABEL[a]}: flujo limitado` : APPROACH_LABEL[a]}
            >
              {a === 'E' ? 'O' : a === 'W' ? 'P' : a} · {queueLen(sim, a)}
              {flagged && ' · flujo limitado'}
            </span>
          </MapMarker>
        );
      })}
      {[cs[0], cs[2]].map((c, i) =>
        c ? (
          <MapMarker key={`ped-${i}`} lngLat={c} offset={[i ? 18 : -18, 0]} z={18}>
            <PedSignal sig={sig} />
          </MapMarker>
        ) : null,
      )}
      <MapMarker lngLat={camAt} z={19}>
        <span
          className="grid size-8 place-items-center rounded-full border-[3px] border-white bg-[#2563eb] text-white shadow-cx"
          title="Cámara IA de conteo"
        >
          <svg width="14" height="14" viewBox="-8 -6 16 12" aria-hidden>
            <path
              d="M-7-4h9a2 2 0 0 1 2 2v1l4-2.5v7L4 1v1a2 2 0 0 1-2 2h-9a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2z"
              fill="#fff"
            />
          </svg>
        </span>
      </MapMarker>
    </CxMap>
  );
}
