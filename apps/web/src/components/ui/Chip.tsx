import type {
  DeviceStatus,
  DrainStatus,
  IncidentPriority,
  IncidentStatus,
} from '@simu/shared-types';
import {
  DEVICE_STATUS_LABEL,
  DRAIN_STATUS_LABEL,
  INCIDENT_STATUS_LABEL,
  PRIORITY_LABEL,
} from '../../lib/labels';

export type Tone = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger' | 'critical';

/** Full class names (Tailwind scans literal strings). Color never travels without a label. */
const TONE: Record<Tone, { chip: string; dot: string }> = {
  neutral: { chip: 'border-line text-fg-muted', dot: 'bg-fg-muted' },
  accent: { chip: 'border-accent/50 text-[#7fb0e6]', dot: 'bg-accent' },
  ok: { chip: 'border-ok/50 text-ok', dot: 'bg-ok' },
  warn: { chip: 'border-warn/50 text-warn', dot: 'bg-warn' },
  danger: { chip: 'border-danger/60 text-critical', dot: 'bg-danger' },
  critical: { chip: 'border-critical/70 bg-critical/10 text-critical', dot: 'bg-critical' },
};

export function Chip({ tone, label, title }: { tone: Tone; label: string; title?: string }) {
  const t = TONE[tone];
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-1.5 py-px font-mono text-[11px] uppercase leading-4 ${t.chip}`}
    >
      <span className={`size-1.5 shrink-0 ${t.dot}`} aria-hidden />
      {label}
    </span>
  );
}

export const DEVICE_TONE: Record<DeviceStatus, Tone> = {
  online: 'ok',
  degraded: 'warn',
  offline: 'danger',
  maintenance: 'neutral',
};

export const DRAIN_TONE: Record<DrainStatus, Tone> = {
  normal: 'ok',
  caution: 'warn',
  alert: 'danger',
  critical: 'critical',
};

export const PRIORITY_TONE: Record<IncidentPriority, Tone> = {
  low: 'neutral',
  medium: 'accent',
  high: 'warn',
  critical: 'critical',
};

export const INCIDENT_STATUS_TONE: Record<IncidentStatus, Tone> = {
  pending: 'warn',
  validated: 'accent',
  assigned: 'accent',
  in_progress: 'accent',
  resolved: 'ok',
  rejected: 'neutral',
};

export const DeviceStatusChip = ({ status }: { status: DeviceStatus }) => (
  <Chip tone={DEVICE_TONE[status]} label={DEVICE_STATUS_LABEL[status]} />
);

export const DrainStatusChip = ({ status }: { status: DrainStatus }) => (
  <Chip tone={DRAIN_TONE[status]} label={DRAIN_STATUS_LABEL[status]} />
);

export const PriorityBadge = ({ priority }: { priority: IncidentPriority }) => (
  <Chip tone={PRIORITY_TONE[priority]} label={PRIORITY_LABEL[priority]} />
);

export const IncidentStatusChip = ({ status }: { status: IncidentStatus }) => (
  <Chip tone={INCIDENT_STATUS_TONE[status]} label={INCIDENT_STATUS_LABEL[status]} />
);
