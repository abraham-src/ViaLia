import type { DrainStatus } from '@simu/shared-types';

/**
 * Obstruction thresholds (percent). A level strictly greater than `alert`
 * matches the rules-engine condition "coladera > 80%".
 */
export const DRAIN_THRESHOLDS = {
  caution: 50,
  alert: 80,
  critical: 90,
} as const;

export function drainStatusFromLevel(level: number): DrainStatus {
  if (!Number.isFinite(level) || level < 0 || level > 100) {
    throw new RangeError(`Nivel de obstrucción fuera de rango: ${level}`);
  }
  if (level > DRAIN_THRESHOLDS.critical) return 'critical';
  if (level > DRAIN_THRESHOLDS.alert) return 'alert';
  if (level >= DRAIN_THRESHOLDS.caution) return 'caution';
  return 'normal';
}
