import type { Prisma } from '@prisma/client';

export interface RuleSeed {
  key: string;
  name: string;
  description: string;
  sortOrder: number;
  conditions: Prisma.InputJsonObject;
  action: Prisma.InputJsonObject;
}

const DRAIN_OVER_80 = { fact: 'drain.obstruction_level', op: 'gt', value: 80 } as const;
const RAINING = { fact: 'weather.raining', op: 'eq', value: true } as const;
const CAMERA_WATER = {
  fact: 'camera.water_detected',
  op: 'eq',
  value: true,
  /** A camera WATER_ACCUMULATION event within this radius and time window of the drain. */
  window: { radius_m: 250, seconds: 900 },
} as const;

/**
 * The three rules from the project document. The engine (Phase 3) evaluates every
 * enabled rule in sort_order and applies the highest-priority action that matches.
 */
export const RULES: readonly RuleSeed[] = [
  {
    key: 'drain-over-80',
    name: 'Coladera sobre 80 %',
    description: 'SI coladera > 80% ENTONCES ALERTA',
    sortOrder: 10,
    conditions: { all: [DRAIN_OVER_80] },
    action: {
      incident_type: 'drain_obstruction',
      set_priority: 'medium',
      emit_alert: true,
      label: 'ALERTA',
    },
  },
  {
    key: 'drain-over-80-rain',
    name: 'Coladera sobre 80 % con lluvia',
    description: 'SI coladera > 80% Y lluvia = true ENTONCES RIESGO ALTO',
    sortOrder: 20,
    conditions: { all: [DRAIN_OVER_80, RAINING] },
    action: {
      incident_type: 'flood_risk',
      set_priority: 'high',
      emit_alert: true,
      label: 'RIESGO ALTO',
    },
  },
  {
    key: 'drain-over-80-rain-camera-water',
    name: 'Coladera sobre 80 %, lluvia y agua detectada',
    description: 'SI coladera > 80% Y lluvia = true Y cámara detecta agua ENTONCES RIESGO CRÍTICO',
    sortOrder: 30,
    conditions: { all: [DRAIN_OVER_80, RAINING, CAMERA_WATER] },
    action: {
      incident_type: 'flood_risk',
      set_priority: 'critical',
      emit_alert: true,
      label: 'RIESGO CRÍTICO',
    },
  },
];
