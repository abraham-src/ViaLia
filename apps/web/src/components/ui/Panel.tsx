import type { ReactNode } from 'react';

/** Dense section: 1px border, compact uppercase header, no shadows or large radii. */
export function Panel({
  title,
  meta,
  actions,
  children,
  className = '',
  bodyClassName = '',
}: {
  title: string;
  meta?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col border border-line bg-surface ${className}`}>
      <header className="flex h-8 shrink-0 items-center gap-3 border-b border-line bg-surface-2 px-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">{title}</h2>
        {meta && <span className="font-mono text-[11px] text-fg-muted">{meta}</span>}
        <span className="flex-1" />
        {actions}
      </header>
      <div className={`min-h-0 flex-1 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
