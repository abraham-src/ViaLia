/**
 * ViaLia · índice de riesgo de afectación por zona (memoria, sección 8).
 *
 * No es un modelo entrenado: es una puntuación explicable que combina el estado real de
 * las coladeras, el clima, el historial de incidencias, las detecciones de cámara y un
 * pronóstico de lluvia (escenario manual hasta conectar un servicio meteorológico).
 * Devuelve probabilidad, nivel, confianza, horizonte y los factores que la explican,
 * como pide la memoria: "riesgo, no certeza".
 */

export type FloodLevel = 'high' | 'medium' | 'low';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

export interface DrainInput {
  code: string;
  level: number;
  online: boolean;
  /** Minutos desde la última lectura (null = sin lecturas). */
  ageMin: number | null;
  /** Puntos porcentuales por hora (positivo = se está tapando). */
  trendPerHour: number;
}

export interface ZoneInput {
  code: string;
  name: string;
  flood: { level: FloodLevel; name: string } | null;
  drains: DrainInput[];
  hydricIncidents: number;
  cameraWater: boolean;
  trafficIncidents: number;
  trafficLights: string[];
}

export interface WeatherInput {
  intensityNow: number;
  /** Minutos desde el último reporte; null si no hay. */
  ageMin: number | null;
}

export interface ScenarioInput {
  /** Lluvia pronosticada en el pico (mm/h). */
  rainPeak: number;
  /** Minutos hasta el pico. */
  rainPeakAt: number;
  /** Nivel forzado de coladeras (simulación de "coladera obstruida"). */
  drainOverride: Record<string, number>;
  accidentZone: string | null;
  closureZone: string | null;
}

export const NO_SCENARIO: ScenarioInput = {
  rainPeak: 0,
  rainPeakAt: 30,
  drainOverride: {},
  accidentZone: null,
  closureZone: null,
};

export interface Factor {
  key: 'flood' | 'drain' | 'rain' | 'combo' | 'history' | 'camera' | 'trend' | 'mobility';
  label: string;
  detail: string;
  /** Aporte a la puntuación (0–0.3 aprox.). */
  weight: number;
}

export interface ZoneRisk {
  code: string;
  name: string;
  horizon: number;
  probability: number;
  level: RiskLevel;
  confidence: number;
  curve: Array<{ t: number; p: number; rain: number }>;
  factors: Factor[];
  actions: string[];
  maxDrain: DrainInput | null;
}

export const LEVEL_LABEL: Record<RiskLevel, string> = {
  low: 'Bajo',
  medium: 'Medio',
  high: 'Alto',
  critical: 'Crítico',
};

export const LEVEL_COLOR: Record<RiskLevel, string> = {
  low: '#1fa464',
  medium: '#eeb000',
  high: '#f5812a',
  critical: '#e5484d',
};

const clamp = (v: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, v));

export function levelOf(p: number): RiskLevel {
  if (p >= 0.8) return 'critical';
  if (p >= 0.55) return 'high';
  if (p >= 0.3) return 'medium';
  return 'low';
}

const FLOOD_BASE: Record<FloodLevel, number> = { high: 0.2, medium: 0.12, low: 0.06 };

/** Lluvia esperada (mm/h) en t minutos: la actual se disipa y el pico pronosticado llega. */
export function rainAt(t: number, weather: WeatherInput, sc: ScenarioInput): number {
  const now = weather.intensityNow * Math.exp(-t / 75);
  const peak = sc.rainPeak * Math.exp(-((t - sc.rainPeakAt) ** 2) / (2 * 18 ** 2));
  return Math.max(now, peak);
}

function effectiveDrains(zone: ZoneInput, sc: ScenarioInput): DrainInput[] {
  return zone.drains.map((d) =>
    sc.drainOverride[d.code] !== undefined
      ? { ...d, level: sc.drainOverride[d.code] ?? d.level }
      : d,
  );
}

function score(zone: ZoneInput, weather: WeatherInput, sc: ScenarioInput, t: number) {
  const drains = effectiveDrains(zone, sc);
  const maxDrain = drains.reduce<DrainInput | null>(
    (m, d) => (!m || d.level > m.level ? d : m),
    null,
  );
  const drainTerm = clamp(((maxDrain?.level ?? 0) - 40) / 50);
  const rain = rainAt(t, weather, sc);
  const rainTerm = clamp(rain / 35);
  const trend = drains.reduce((m, d) => Math.max(m, d.trendPerHour), 0);
  const mobility =
    zone.trafficIncidents +
    (sc.accidentZone === zone.code ? 1 : 0) +
    (sc.closureZone === zone.code ? 1 : 0);

  const parts: Record<Factor['key'], number> = {
    flood: zone.flood ? FLOOD_BASE[zone.flood.level] : 0.02,
    drain: 0.3 * drainTerm,
    rain: 0.3 * rainTerm,
    combo: 0.15 * drainTerm * rainTerm,
    history: 0.12 * clamp(zone.hydricIncidents / 2),
    camera: zone.cameraWater ? 0.12 : 0,
    trend: 0.06 * clamp(trend / 15),
    mobility: 0.1 * clamp(mobility / 2),
  };
  const total = Object.values(parts).reduce((a, b) => a + b, 0);
  return { total, parts, maxDrain, rain, trend, mobility };
}

export const probabilityOf = (s: number): number => 1 / (1 + Math.exp(-6 * (s - 0.5)));

export function assessZone(
  zone: ZoneInput,
  weather: WeatherInput,
  sc: ScenarioInput,
  horizon: number,
): ZoneRisk {
  const curve: ZoneRisk['curve'] = [];
  for (let t = 0; t <= 90; t += 5) {
    const s = score(zone, weather, sc, t);
    curve.push({ t, p: probabilityOf(s.total), rain: s.rain });
  }
  const at = score(zone, weather, sc, horizon);
  const probability = probabilityOf(at.total);
  const level = levelOf(probability);

  // Confianza: frescura de sensores y clima, y castigo por horizonte largo.
  const drains = zone.drains;
  const fresh = drains.length
    ? drains.filter((d) => d.online && d.ageMin !== null && d.ageMin <= 10).length / drains.length
    : 0.3;
  const weatherFresh = weather.ageMin !== null && weather.ageMin <= 30 ? 1 : 0.5;
  const manualForecast = sc.rainPeak > 0 ? 0.9 : 1;
  const confidence = clamp(
    (0.45 + 0.35 * fresh + 0.2 * weatherFresh) * manualForecast * (1 - horizon / 400),
    0.2,
    0.97,
  );

  const md = at.maxDrain;
  const factors: Factor[] = [];
  const add = (key: Factor['key'], label: string, detail: string) => {
    const weight = at.parts[key];
    if (weight >= 0.015) factors.push({ key, label, detail, weight });
  };
  if (zone.flood) add('flood', 'Zona baja con historial', zone.flood.name);
  if (md)
    add('drain', `${md.code} al ${Math.round(md.level)} %`, 'Obstrucción medida por DrenaGuard');
  add(
    'rain',
    `Lluvia ${Math.round(at.rain)} mm/h en ${horizon} min`,
    sc.rainPeak > 0
      ? `Pronóstico de escenario: pico de ${sc.rainPeak} mm/h`
      : 'Reporte de clima vigente',
  );
  add('combo', 'Coladera tapada + lluvia', 'La combinación pesa más que cada factor por separado');
  add(
    'history',
    `${zone.hydricIncidents} ${zone.hydricIncidents === 1 ? 'incidencia hídrica activa' : 'incidencias hídricas activas'}`,
    'Historial reciente de la zona',
  );
  add('camera', 'Agua detectada por cámara', 'Detección de visión artificial vigente');
  add('trend', `Nivel subiendo ${Math.round(at.trend)} pts/h`, 'Tendencia de las últimas lecturas');
  add(
    'mobility',
    `${at.mobility} ${at.mobility === 1 ? 'afectación vial' : 'afectaciones viales'}`,
    'Accidente, obstáculo o cierre en la zona',
  );
  factors.sort((a, b) => b.weight - a.weight);

  const actions: string[] = [];
  if (md && md.level >= 70)
    actions.push(`Revisar ${md.code} antes de la lluvia (${Math.round(md.level)} %)`);
  if ((level === 'high' || level === 'critical') && zone.trafficLights.length) {
    actions.push(`Limitar flujo hacia la zona con ${zone.trafficLights.join(', ')}`);
  }
  if (level === 'critical') actions.push('Pre-asignar cuadrilla de mantenimiento');
  if (at.mobility > 0) actions.push('Publicar aviso de afectación vial (API externa)');
  if (!actions.length) actions.push('Sin acción: seguir monitoreando');

  return {
    code: zone.code,
    name: zone.name,
    horizon,
    probability,
    level,
    confidence,
    curve,
    factors,
    actions,
    maxDrain: md,
  };
}

export function assessAll(
  zones: ZoneInput[],
  weather: WeatherInput,
  sc: ScenarioInput,
  horizon: number,
): ZoneRisk[] {
  return zones
    .map((z) => assessZone(z, weather, sc, horizon))
    .sort((a, b) => b.probability - a.probability);
}

export function confidenceLabel(c: number): string {
  if (c >= 0.75) return 'alta';
  if (c >= 0.55) return 'media';
  return 'baja';
}
