import type { Feature, Polygon } from 'geojson';
import { useMemo } from 'react';
import { create } from 'zustand';
import { useCxData, useDrainHistory, trendPerHour, type CxData } from '../data/useCxData';
import { pointInRing, ringCenter } from '../lib/geo';
import { INCIDENT_VISUAL } from '../lib/visuals';
import {
  NO_SCENARIO,
  assessZone,
  type FloodLevel,
  type ScenarioInput,
  type WeatherInput,
  type ZoneInput,
  type ZoneRisk,
} from './model';

export type Horizon = 30 | 60 | 90;

interface ScenarioStore {
  horizon: Horizon;
  scenario: ScenarioInput;
  setHorizon(h: Horizon): void;
  setRain(peak: number): void;
  setRainAt(minutes: number): void;
  setDrain(code: string, level: number | null): void;
  setAccident(zone: string | null): void;
  setClosure(zone: string | null): void;
  reset(): void;
}

/** Escenario "qué pasaría si" compartido entre Predicción y el mapa general. */
export const useScenario = create<ScenarioStore>((set) => ({
  horizon: 30,
  scenario: NO_SCENARIO,
  setHorizon: (horizon) => set({ horizon }),
  setRain: (rainPeak) => set((s) => ({ scenario: { ...s.scenario, rainPeak } })),
  setRainAt: (rainPeakAt) => set((s) => ({ scenario: { ...s.scenario, rainPeakAt } })),
  setDrain: (code, level) =>
    set((s) => {
      const drainOverride = { ...s.scenario.drainOverride };
      if (level === null) delete drainOverride[code];
      else drainOverride[code] = level;
      return { scenario: { ...s.scenario, drainOverride } };
    }),
  setAccident: (accidentZone) => set((s) => ({ scenario: { ...s.scenario, accidentZone } })),
  setClosure: (closureZone) => set((s) => ({ scenario: { ...s.scenario, closureZone } })),
  reset: () => set({ scenario: NO_SCENARIO }),
}));

export const isScenarioActive = (s: ScenarioInput): boolean =>
  s.rainPeak > 0 ||
  Object.keys(s.drainOverride).length > 0 ||
  s.accidentZone !== null ||
  s.closureZone !== null;

const minutesSince = (iso: string | null | undefined): number | null =>
  iso ? Math.max(0, (Date.now() - new Date(iso).getTime()) / 60_000) : null;

/** Arma la entrada del modelo desde los datos reales de la API. */
export function buildZoneInputs(
  data: CxData,
  samples: ReturnType<typeof useDrainHistory.getState>['samples'],
): ZoneInput[] {
  const floods = (data.flood?.features ?? []).filter(
    (f): f is Feature<Polygon> => f.geometry?.type === 'Polygon',
  );
  return data.zoneList.map((z) => {
    const inZone = <
      T extends { longitude: number; latitude: number; metadata: Record<string, unknown> },
    >(
      x: T,
    ) => data.zoneOfItem(x)?.code === z.code;
    const flood = floods.find((f) =>
      pointInRing(ringCenter(f.geometry.coordinates[0] ?? []), z.ring),
    );
    const incidents = data.incidents.filter(inZone);
    return {
      code: z.code,
      name: z.name,
      flood: flood
        ? {
            level: (String(flood.properties?.risk_level ?? 'medium') as FloodLevel) ?? 'medium',
            name: String(flood.properties?.name ?? 'Zona con historial de encharcamiento'),
          }
        : null,
      drains: data.drains.filter(inZone).map((d) => ({
        code: d.device_code,
        level: d.drain?.obstruction_level ?? 0,
        online: d.status === 'online' || d.status === 'degraded',
        ageMin: minutesSince(d.drain?.last_reading_at),
        trendPerHour: trendPerHour(samples[d.device_code]),
      })),
      hydricIncidents: incidents.filter((i) => INCIDENT_VISUAL[i.type].hydric).length,
      cameraWater: incidents.some(
        (i) =>
          (i.type === 'water_accumulation' || i.type === 'flood_risk') &&
          (i.metadata.source === 'camera' || i.metadata.facts !== undefined),
      ),
      trafficIncidents: incidents.filter((i) => i.type === 'accident' || i.type === 'obstacle')
        .length,
      trafficLights: data.lights.filter(inZone).map((l) => l.device_code),
    };
  });
}

export function usePrediction(): {
  data: CxData;
  risks: ZoneRisk[];
  baseline: ZoneRisk[];
  horizon: Horizon;
  scenario: ScenarioInput;
} {
  const data = useCxData();
  const samples = useDrainHistory((s) => s.samples);
  const horizon = useScenario((s) => s.horizon);
  const scenario = useScenario((s) => s.scenario);

  const inputs = useMemo(() => buildZoneInputs(data, samples), [data, samples]);
  // El reporte de clima puede ser de una zona (ZONE-001) o de toda la ciudad (sin zona).
  const weatherFor = useMemo(() => {
    const w = data.weather;
    const ageMin = minutesSince(w?.recorded_at);
    return (zone: string): WeatherInput => {
      const applies = w?.raining && (w.zone === null || w.zone === zone);
      return { intensityNow: applies ? (w?.intensity_mm_h ?? 10) : 0, ageMin };
    };
  }, [data.weather]);

  const risks = useMemo(
    () =>
      inputs
        .map((z) => assessZone(z, weatherFor(z.code), scenario, horizon))
        .sort((a, b) => b.probability - a.probability),
    [inputs, weatherFor, scenario, horizon],
  );
  const baseline = useMemo(
    () =>
      inputs
        .map((z) => assessZone(z, weatherFor(z.code), NO_SCENARIO, horizon))
        .sort((a, b) => b.probability - a.probability),
    [inputs, weatherFor, horizon],
  );
  return { data, risks, baseline, horizon, scenario };
}
