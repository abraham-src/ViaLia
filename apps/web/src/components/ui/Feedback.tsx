import { AlertTriangle, RotateCw, WifiOff } from 'lucide-react';
import type { ReactNode } from 'react';

/** Dense skeleton rows (no big spinners). */
export function SkeletonRows({ rows = 4, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-line" aria-busy="true" aria-label="Cargando">
      {Array.from({ length: rows }, (_, r) => (
        <div key={r} className="flex gap-3 px-3 py-2">
          {Array.from({ length: cols }, (_, c) => (
            <span
              key={c}
              className="h-3 animate-pulse bg-surface-2"
              style={{ width: `${c === 0 ? 18 : 100 / cols}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="px-3 py-4 text-fg-muted">{children}</p>;
}

/** Discreet error line with retry (spec §7.3). */
export function ErrorLine({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex items-center gap-2 px-3 py-2 text-critical">
      <AlertTriangle size={14} strokeWidth={1.5} aria-hidden />
      <span>{message}</span>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="ml-auto inline-flex items-center gap-1 rounded-sm border border-line px-2 py-0.5 text-fg hover:border-accent"
        >
          <RotateCw size={12} strokeWidth={1.5} aria-hidden /> Reintentar
        </button>
      )}
    </div>
  );
}

export function TopBanner({ tone, children }: { tone: 'warn' | 'danger'; children: ReactNode }) {
  const cls =
    tone === 'warn'
      ? 'border-warn/40 bg-warn/10 text-warn'
      : 'border-danger/40 bg-danger/10 text-critical';
  return (
    <div role="status" className={`flex items-center gap-2 border-b px-4 py-1 text-[12px] ${cls}`}>
      <WifiOff size={13} strokeWidth={1.5} aria-hidden />
      {children}
    </div>
  );
}
