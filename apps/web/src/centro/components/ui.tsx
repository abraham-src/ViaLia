import type { DeviceStatus, IncidentPriority, IncidentStatus } from '@simu/shared-types';
import { ChevronRight, MapPin } from 'lucide-react';
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { DEVICE_STATUS_LABEL, INCIDENT_STATUS_LABEL } from '../../lib/labels';
import type { IconType } from './icons';
import { DEVICE_STATUS_COLOR, PRIORITY_COLOR, PRIORITY_SOFT, PRIORITY_TEXT } from '../lib/visuals';

export function Card({
  title,
  icon: Icon,
  action,
  children,
  className = '',
  bodyClassName = '',
}: {
  title?: ReactNode;
  icon?: IconType;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={`rounded-[20px] border border-cx-line bg-white shadow-cx ${className}`}>
      {(title || action) && (
        <header className="flex items-center gap-2 px-5 pt-4">
          {Icon && <Icon size={17} strokeWidth={2.2} className="text-cx-blue" aria-hidden />}
          <h2 className="text-[15.5px] font-bold tracking-[-0.01em] text-cx-ink">{title}</h2>
          <div className="ml-auto flex items-center gap-2">{action}</div>
        </header>
      )}
      <div className={title || action ? `px-5 pb-5 pt-3 ${bodyClassName}` : bodyClassName}>
        {children}
      </div>
    </section>
  );
}

export function Pill({
  children,
  color = '#2563eb',
  soft,
  className = '',
}: {
  children: ReactNode;
  color?: string;
  soft?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[12px] font-semibold ${className}`}
      style={{ color, background: soft ?? `${color}18` }}
    >
      {children}
    </span>
  );
}

export function PriorityPill({
  priority,
  solid = false,
}: {
  priority: IncidentPriority;
  solid?: boolean;
}) {
  const color = PRIORITY_COLOR[priority];
  if (solid) {
    return (
      <span
        className="inline-flex items-center whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-bold text-white"
        style={{ background: color, boxShadow: `0 6px 14px -8px ${color}` }}
      >
        Prioridad {PRIORITY_TEXT[priority].toLowerCase()}
      </span>
    );
  }
  return (
    <Pill color={priority === 'medium' ? '#9a6b00' : color} soft={PRIORITY_SOFT[priority]}>
      <span className="size-1.5 rounded-full" style={{ background: color }} />
      {PRIORITY_TEXT[priority]}
    </Pill>
  );
}

export function StatusPill({ status }: { status: IncidentStatus }) {
  const tone: Record<IncidentStatus, string> = {
    pending: '#8a5a00',
    validated: '#2563eb',
    assigned: '#6d28d9',
    in_progress: '#c2410c',
    resolved: '#15803d',
    rejected: '#64748b',
  };
  return <Pill color={tone[status]}>{INCIDENT_STATUS_LABEL[status]}</Pill>;
}

export function DeviceStatusPill({ status }: { status: DeviceStatus }) {
  const color = DEVICE_STATUS_COLOR[status];
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold" style={{ color }}>
      <span className="relative flex size-2">
        {status === 'online' && (
          <span
            className="absolute inline-flex size-full animate-ping rounded-full opacity-60"
            style={{ background: color }}
          />
        )}
        <span className="relative inline-flex size-2 rounded-full" style={{ background: color }} />
      </span>
      {DEVICE_STATUS_LABEL[status]}
    </span>
  );
}

export function IconBubble({
  icon: Icon,
  color = '#2563eb',
  size = 36,
  solid = false,
}: {
  icon: IconType;
  color?: string;
  size?: number;
  solid?: boolean;
}) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-full"
      style={{
        width: size,
        height: size,
        background: solid ? color : `${color}18`,
        color: solid ? '#fff' : color,
      }}
    >
      <Icon size={Math.round(size * 0.5)} strokeWidth={2.2} aria-hidden />
    </span>
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'ghost' | 'soft' | 'danger';
  icon?: IconType;
};

const VARIANT: Record<NonNullable<ButtonProps['variant']>, string> = {
  primary:
    'bg-cx-blue text-white shadow-[0_10px_24px_-12px_rgb(37_99_235/0.9)] hover:bg-cx-blue2 disabled:bg-cx-blue/50',
  ghost: 'border border-cx-line bg-white text-cx-ink hover:border-cx-blue/40 hover:text-cx-blue',
  soft: 'bg-cx-bluesoft text-cx-blue hover:bg-[#dce8ff]',
  danger: 'border border-[#f3c7c9] bg-white text-[#c62a2f] hover:bg-[#fff5f5]',
};

export function Button({
  variant = 'primary',
  icon: Icon,
  className = '',
  children,
  ...rest
}: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`inline-flex items-center justify-center gap-2 rounded-[12px] px-4 py-2.5 text-[13.5px] font-semibold transition disabled:cursor-not-allowed disabled:opacity-60 ${VARIANT[variant]} ${className}`}
    >
      {Icon && <Icon size={16} strokeWidth={2.2} aria-hidden />}
      {children}
    </button>
  );
}

export function ButtonLink({
  to,
  children,
  variant = 'primary',
  className = '',
}: {
  to: string;
  children: ReactNode;
  variant?: 'primary' | 'ghost' | 'soft';
  className?: string;
}) {
  return (
    <Link
      to={to}
      className={`inline-flex items-center justify-center gap-2 rounded-[12px] px-4 py-2.5 text-[13.5px] font-semibold transition ${VARIANT[variant]} ${className}`}
    >
      {children}
    </Link>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  size = 'md',
}: {
  options: ReadonlyArray<{ value: T; label: ReactNode }>;
  value: T;
  onChange: (v: T) => void;
  size?: 'sm' | 'md';
}) {
  return (
    <div className="inline-flex rounded-[12px] border border-cx-line bg-cx-line2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`rounded-[9px] font-semibold transition ${
            size === 'sm' ? 'px-2.5 py-1 text-[12px]' : 'px-3.5 py-1.5 text-[13px]'
          } ${
            value === o.value
              ? 'bg-white text-cx-ink shadow-[0_2px_8px_-4px_rgb(16_24_40/0.35)]'
              : 'text-cx-ink3 hover:text-cx-ink2'
          }`}
          aria-pressed={value === o.value}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3">
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-cx-ink">{label}</span>
        {hint && <span className="block text-[12px] text-cx-ink3">{hint}</span>}
      </span>
      <input
        type="checkbox"
        className="peer sr-only"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span
        className={`relative h-6 w-11 shrink-0 rounded-full transition ${
          checked ? 'bg-cx-blue' : 'bg-[#d5dce7]'
        } peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-cx-blue`}
        aria-hidden
      >
        <span
          className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${
            checked ? 'left-[22px]' : 'left-0.5'
          }`}
        />
      </span>
    </label>
  );
}

export function InfoRow({
  icon: Icon,
  label,
  children,
}: {
  icon: IconType;
  label?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 py-2.5">
      <Icon size={18} strokeWidth={2} className="mt-0.5 shrink-0 text-cx-ink2" aria-hidden />
      <div className="min-w-0 flex-1">
        {label && <div className="text-[12px] font-medium text-cx-ink3">{label}</div>}
        <div className="text-[13.5px] font-medium text-cx-ink">{children}</div>
      </div>
    </div>
  );
}

export function Meter({
  value,
  color = '#2563eb',
  height = 8,
}: {
  value: number;
  color?: string;
  height?: number;
}) {
  return (
    <div className="w-full overflow-hidden rounded-full bg-cx-line2" style={{ height }}>
      <div
        className="h-full rounded-full transition-[width] duration-700"
        style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: color }}
      />
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end gap-x-6 gap-y-3 px-7 pb-4 pt-6">
      <div className="min-w-0">
        <h1 className="text-[30px] font-extrabold leading-[1.1] tracking-[-0.025em] text-cx-ink">
          {title}
        </h1>
        {subtitle && <p className="mt-1 text-[15px] text-cx-ink3">{subtitle}</p>}
      </div>
      <div className="ml-auto flex flex-wrap items-center gap-3">{children}</div>
    </header>
  );
}

export function Breadcrumb({ items }: { items: ReadonlyArray<{ label: string; to?: string }> }) {
  return (
    <nav
      aria-label="Ubicación"
      className="flex max-w-[560px] items-center gap-1.5 overflow-hidden rounded-[12px] border border-cx-line bg-white px-3.5 py-2.5 text-[13px] shadow-cx"
    >
      <MapPin size={16} strokeWidth={2.2} className="shrink-0 text-cx-blue" aria-hidden />
      {items.map((it, i) => (
        <span key={`${it.label}-${i}`} className="flex min-w-0 items-center gap-1.5">
          {i > 0 && <ChevronRight size={14} className="shrink-0 text-cx-ink3" aria-hidden />}
          {it.to ? (
            <Link to={it.to} className="truncate text-cx-ink3 hover:text-cx-blue">
              {it.label}
            </Link>
          ) : (
            <span
              className={`truncate ${i === items.length - 1 ? 'font-semibold text-cx-ink' : 'text-cx-ink3'}`}
            >
              {it.label}
            </span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className="py-6 text-center text-[13px] text-cx-ink3">{children}</p>;
}

/** Nota de honestidad: qué es simulado o ilustrativo. */
export function Note({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <p className={`text-[11.5px] leading-snug text-cx-ink3 ${className}`}>{children}</p>;
}
