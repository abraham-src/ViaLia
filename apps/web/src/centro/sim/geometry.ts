import type { Feature, LineString } from 'geojson';
import { bearingDeg, destination, distanceM, type LngLat } from '../lib/geo';
import { avgCongestion, type LiveSegmentProps } from '../traffic/traffic';
import { APPROACHES, type Approach, type Demand } from './intersection';

/**
 * Geometría real del cruce TL-001 (Av. Insurgentes Sur × Av. Álvaro Obregón), medida sobre
 * las calles OSM del repo. Insurgentes corre a ~21° (NNE) y Álvaro Obregón a ~70° (ENE):
 * el cruce no es de 90°, y el mapa lo dibuja tal cual.
 */
export const LIGHT_FALLBACK: LngLat = [-99.16494, 19.41718];

/**
 * Centro geométrico del cruce: promedio de los cuatro nodos OSM donde se tocan las calzadas.
 * El dispositivo TL-001 está en una esquina (nodo sur-poniente), no en el centro.
 */
export const INTERSECTION_CENTER: LngLat = [-99.16483, 19.41731];

/** Rumbo de cada brazo, del centro hacia afuera (de ahí vienen los autos de ese acceso). */
export const ARM_BEARING: Record<Approach, number> = {
  N: 20.7,
  S: 200.7,
  E: 69.9,
  W: 249.9,
};

const OPPOSITE: Record<Approach, Approach> = { N: 'S', S: 'N', E: 'W', W: 'E' };

const angleDiff = (a: number, b: number): number => {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
};

/** Brazo del cruce más alineado con un rumbo. */
export function nearestArm(bearing: number): Approach {
  let best: Approach = 'N';
  for (const a of APPROACHES) {
    if (angleDiff(bearing, ARM_BEARING[a]) < angleDiff(bearing, ARM_BEARING[best])) best = a;
  }
  return best;
}

/** Acceso cuyo tráfico se dirige hacia un punto (el del brazo opuesto). */
export function approachHeadingTo(light: LngLat, p: LngLat): Approach {
  return OPPOSITE[nearestArm(bearingDeg(light, p))];
}

/** Punto a lo largo de un brazo (`along` m desde el centro) desplazado `side` m a la derecha del sentido de entrada. */
export function armPoint(center: LngLat, a: Approach, along: number, side = 0): LngLat {
  const p = destination(center, ARM_BEARING[a], along);
  // Sentido de entrada = rumbo del brazo + 180°; su derecha = +90°.
  return side ? destination(p, ARM_BEARING[a] + 270, side) : p;
}

/**
 * Demanda del cruce a partir del tráfico en vivo del simulador: la congestión de los tramos
 * de cada brazo (hasta `radiusM`) se traduce a vehículos por minuto.
 * Devuelve null si no hay tramos cerca (zona apagada o simulador sin respuesta).
 */
export function demandFromTraffic(
  light: LngLat,
  segments: ReadonlyArray<Feature<LineString, LiveSegmentProps>>,
  radiusM = 450,
): Demand | null {
  const byArm: Record<Approach, Array<Feature<LineString, LiveSegmentProps>>> = {
    N: [],
    S: [],
    E: [],
    W: [],
  };
  const near: Array<Feature<LineString, LiveSegmentProps>> = [];
  for (const f of segments) {
    const cs = f.geometry.coordinates;
    const mid = cs[Math.floor(cs.length / 2)];
    if (!mid) continue;
    const p: LngLat = [mid[0] ?? 0, mid[1] ?? 0];
    const d = distanceM(light, p);
    if (d > radiusM) continue;
    near.push(f);
    if (d < 20) continue;
    const b = bearingDeg(light, p);
    const arm = nearestArm(b);
    if (angleDiff(b, ARM_BEARING[arm]) <= 35) byArm[arm].push(f);
  }
  if (near.length === 0) return null;
  const all = avgCongestion(near);
  const rate = (a: Approach) => {
    const c = byArm[a].length ? avgCongestion(byArm[a]) : all;
    return Math.round((3 + 15 * c) * 10) / 10;
  };
  return {
    rates: { N: rate('N'), S: rate('S'), E: rate('E'), W: rate('W') },
    pedRate: Math.round((1.5 + 4 * all) * 10) / 10,
  };
}
