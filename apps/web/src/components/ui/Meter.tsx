import type { DrainStatus } from '@simu/shared-types';

/** Fill carries severity; the track is a quiet step so the state reads at a glance. */
const FILL: Record<DrainStatus, string> = {
  normal: 'bg-accent',
  caution: 'bg-warn',
  alert: 'bg-danger',
  critical: 'bg-critical',
};

export function Meter({
  value,
  status,
  width = 96,
}: {
  value: number;
  status: DrainStatus;
  width?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <span
      className="relative inline-block h-1.5 overflow-hidden bg-surface-2 align-middle"
      style={{ width }}
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-label={`Obstrucción ${pct} %`}
    >
      <span
        className={`absolute inset-y-0 left-0 transition-[width] duration-500 ${FILL[status]}`}
        style={{ width: `${pct}%` }}
      />
      {/* 80 % mark: the rules-engine threshold */}
      <span
        className="absolute inset-y-0 w-px bg-fg-muted/60"
        style={{ left: '80%' }}
        aria-hidden
      />
    </span>
  );
}
