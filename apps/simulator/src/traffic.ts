import { TRAFFIC_SEGMENTS, TRAFFIC_ZONES } from './traffic-network.js';
import type { WeatherState } from './simulation.js';

/**
 * Tráfico en tiempo real simulado sobre tramos reales de la CDMX (traffic-network.ts).
 *
 * La congestión de cada tramo (0 = libre, 1 = detenido) combina:
 *   - la curva horaria de la ciudad (picos 8:00 y 19:00, hora del centro de México),
 *   - un sesgo fijo por calle (unas avenidas cargan más que otras),
 *   - una caminata aleatoria por tramo, suave, para que el mapa "respire",
 *   - la lluvia del simulador en esa zona,
 *   - y, si el operador lo fija desde el panel, un nivel forzado por zona.
 * Solo las zonas activadas reportan tráfico en vivo.
 */

export const TRAFFIC_MODES = ['auto', 'free', 'moderate', 'heavy', 'stopped'] as const;
export type TrafficMode = (typeof TRAFFIC_MODES)[number];
export type TrafficLevel = Exclude<TrafficMode, 'auto'>;

const FORCED: Record<TrafficLevel, number> = {
  free: 0.12,
  moderate: 0.48,
  heavy: 0.74,
  stopped: 0.94,
};

/** Zonas con tráfico en vivo al arrancar ("algunas zonas", no toda la ciudad). */
const ENABLED_AT_BOOT = new Set(['ZONE-001', 'ZONE-002', 'ZONE-003', 'COR']);

export interface ZoneTraffic {
  code: string;
  name: string;
  enabled: boolean;
  mode: TrafficMode;
}

interface SegmentState {
  noise: number;
  congestion: number;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

export function levelOf(c: number): TrafficLevel {
  return c < 0.35 ? 'free' : c < 0.6 ? 'moderate' : c < 0.82 ? 'heavy' : 'stopped';
}

/** Hora decimal en la Ciudad de México (UTC−6, sin horario de verano desde 2022). */
export function cdmxHour(now: Date): number {
  const h = (now.getUTCHours() + 24 - 6) % 24;
  return h + now.getUTCMinutes() / 60;
}

/** Demanda base por hora del día: 0.12 de madrugada, ~0.7 en las horas pico. */
export function dailyDemand(hour: number): number {
  const peak = (center: number, width: number, height: number) =>
    height * Math.exp(-((hour - center) ** 2) / (2 * width ** 2));
  return clamp(0.12 + peak(8.2, 1.3, 0.55) + peak(14.5, 1.6, 0.22) + peak(19, 1.6, 0.6), 0, 0.85);
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 1000) / 1000;
}

export class TrafficModel {
  readonly zones = new Map<string, ZoneTraffic>();
  private readonly state = new Map<string, SegmentState>();
  private readonly streetBias = new Map<string, number>();
  updatedAt = new Date();

  constructor(private readonly random: () => number = Math.random) {
    for (const s of TRAFFIC_SEGMENTS) {
      if (!this.streetBias.has(s.street))
        this.streetBias.set(s.street, (hash(s.street) - 0.5) * 0.3);
    }
    this.reset();
  }

  reset(): void {
    this.zones.clear();
    for (const z of TRAFFIC_ZONES) {
      this.zones.set(z.code, { ...z, enabled: ENABLED_AT_BOOT.has(z.code), mode: 'auto' });
    }
    this.state.clear();
    for (const s of TRAFFIC_SEGMENTS) {
      this.state.set(s.id, { noise: (this.random() - 0.5) * 0.2, congestion: 0 });
    }
    this.step(new Date(), { raining: false, zone: null, intensityMmH: null }, 1);
  }

  setZone(code: string, patch: { enabled?: boolean; mode?: TrafficMode }): ZoneTraffic {
    const z = this.zones.get(code);
    if (!z) throw new Error(`Zona de tráfico desconocida: ${code}`);
    if (patch.enabled !== undefined) z.enabled = patch.enabled;
    if (patch.mode !== undefined) z.mode = patch.mode;
    return z;
  }

  /**
   * Avanza el modelo. `blend` = qué tanto se acerca cada tramo a su objetivo en este paso
   * (1 = de golpe, 0.25 = transición suave de unos segundos).
   */
  step(now: Date, weather: WeatherState, blend = 0.25): void {
    const base = dailyDemand(cdmxHour(now));
    const rain = weather.raining ? clamp(0.1 + (weather.intensityMmH ?? 15) / 150, 0.1, 0.3) : 0;
    for (const seg of TRAFFIC_SEGMENTS) {
      const st = this.state.get(seg.id)!;
      st.noise = clamp(st.noise + (this.random() - 0.5) * 0.06, -0.22, 0.22);
      const zone = this.zones.get(seg.zone)!;
      let target: number;
      if (zone.mode === 'auto') {
        const wet =
          weather.raining && (weather.zone === null || weather.zone === seg.zone) ? rain : 0;
        target = base + (this.streetBias.get(seg.street) ?? 0) + st.noise + wet;
      } else {
        target = FORCED[zone.mode] + st.noise * 0.3;
      }
      st.congestion += (clamp(target, 0, 1) - st.congestion) * blend;
    }
    this.updatedAt = now;
  }

  /** Estado dinámico de los tramos de zonas activas (la geometría va aparte, en /traffic/network). */
  snapshot() {
    const segments = [];
    for (const seg of TRAFFIC_SEGMENTS) {
      if (!this.zones.get(seg.zone)?.enabled) continue;
      const c = this.state.get(seg.id)!.congestion;
      segments.push({
        id: seg.id,
        c: Math.round(c * 100) / 100,
        level: levelOf(c),
        speed_kmh: Math.round(seg.free_kmh * (1 - 0.88 * c ** 1.4)),
      });
    }
    return {
      updated_at: this.updatedAt.toISOString(),
      hour_cdmx: Math.round(cdmxHour(this.updatedAt) * 100) / 100,
      zones: [...this.zones.values()].map((z) => ({
        ...z,
        segments: TRAFFIC_SEGMENTS.filter((s) => s.zone === z.code).length,
      })),
      segments,
    };
  }
}

/** GeoJSON estático de la red (se pide una sola vez). */
export function trafficNetworkGeoJson() {
  return {
    type: 'FeatureCollection' as const,
    features: TRAFFIC_SEGMENTS.map((s) => ({
      type: 'Feature' as const,
      id: s.id,
      properties: {
        id: s.id,
        street: s.street,
        zone: s.zone,
        free_kmh: s.free_kmh,
        length_m: s.length_m,
      },
      geometry: { type: 'LineString' as const, coordinates: s.coords },
    })),
  };
}
