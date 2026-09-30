import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Sparkline, type SparkPoint } from './Sparkline';

/** Compact KPI tile: label · value · detail line · optional 12-point trend. */
export function StatTile({
  icon: Icon,
  label,
  value,
  detail,
  trend,
  trendLabel,
  tone = 'default',
  loading = false,
}: {
  icon: LucideIcon;
  label: string;
  value: ReactNode;
  detail?: ReactNode;
  trend?: readonly SparkPoint[];
  trendLabel?: string;
  tone?: 'default' | 'alert';
  loading?: boolean;
}) {
  return (
    <div
      className={`flex min-w-0 items-stretch gap-3 border bg-surface px-3 py-2 ${
        tone === 'alert' ? 'border-critical/60' : 'border-line'
      }`}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-fg-muted">
          <Icon size={13} strokeWidth={1.5} aria-hidden />
          <span className="truncate">{label}</span>
        </div>
        {loading ? (
          <div className="mt-1.5 h-6 w-16 animate-pulse bg-surface-2" />
        ) : (
          <div
            className={`mt-0.5 font-mono text-[22px] font-medium leading-7 ${tone === 'alert' ? 'text-critical' : 'text-fg'}`}
          >
            {value}
          </div>
        )}
        {detail && <div className="truncate text-[11px] text-fg-muted">{detail}</div>}
      </div>
      {trend && (
        <div className="flex flex-col items-end justify-end gap-0.5">
          <Sparkline points={trend} />
          {trendLabel && <span className="font-mono text-[10px] text-fg-muted">{trendLabel}</span>}
        </div>
      )}
    </div>
  );
}
