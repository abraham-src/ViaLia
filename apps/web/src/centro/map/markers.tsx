import type { DeviceStatus, DrainStatus, IncidentPriority } from '@simu/shared-types';
import { Droplets, Video } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';
import { DEVICE_STATUS_COLOR, DRAIN_COLOR, PRIORITY_COLOR } from '../lib/visuals';

/** Marcadores HTML del centro (se pintan con MapMarker). Diseño del maquetado. */

const halo = (color: string, alpha = 0.45): CSSProperties =>
  ({
    '--cx-halo': `${color}${Math.round(alpha * 255)
      .toString(16)
      .padStart(2, '0')}`,
  }) as CSSProperties;

export function IncidentPin({
  priority,
  selected = false,
  size = 34,
  onClick,
  title,
}: {
  priority: IncidentPriority;
  selected?: boolean;
  size?: number;
  onClick?: () => void;
  title?: string;
}) {
  const color = PRIORITY_COLOR[priority];
  const pulse = priority === 'critical' || priority === 'high' || selected;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`cx-marker relative grid place-items-center ${pulse ? 'cx-pulse' : ''}`}
      style={{ width: size, height: size, ...halo(color, 0.35) }}
    >
      <svg viewBox="0 0 40 36" width={size} height={size * 0.9} aria-hidden>
        <defs>
          <filter id={`sh-${priority}`} x="-30%" y="-30%" width="160%" height="170%">
            <feDropShadow
              dx="0"
              dy="2"
              stdDeviation="1.6"
              floodColor="#0b1b34"
              floodOpacity="0.28"
            />
          </filter>
        </defs>
        <path
          d="M17.4 3.6a3 3 0 0 1 5.2 0l15 26.1A3 3 0 0 1 35 34.2H5a3 3 0 0 1-2.6-4.5z"
          fill={color}
          stroke="#fff"
          strokeWidth="2.4"
          strokeLinejoin="round"
          filter={`url(#sh-${priority})`}
        />
        <rect x="18.3" y="12" width="3.4" height="11" rx="1.7" fill="#fff" />
        <circle cx="20" cy="27.6" r="2" fill="#fff" />
      </svg>
    </button>
  );
}

/** Círculo grande con "!" para la incidencia seleccionada (zoom), como el maquetado. */
export function IncidentBeacon({
  priority,
  onClick,
}: {
  priority: IncidentPriority;
  onClick?: () => void;
}) {
  const color = PRIORITY_COLOR[priority];
  return (
    <button
      type="button"
      onClick={onClick}
      className="cx-marker cx-pulse relative grid size-[54px] place-items-center rounded-full"
      style={halo(color, 0.4)}
      aria-label="Incidencia seleccionada"
    >
      <span
        className="grid size-[54px] place-items-center rounded-full border-[3px] border-white text-[26px] font-extrabold text-white"
        style={{
          background: color,
          boxShadow: `0 10px 24px -6px ${color}aa, 0 0 0 10px ${color}22`,
        }}
      >
        !
      </span>
    </button>
  );
}

export function ClusterBubble({
  count,
  priority,
  onClick,
}: {
  count: number;
  priority: IncidentPriority;
  onClick?: () => void;
}) {
  const color = PRIORITY_COLOR[priority];
  const size = count >= 6 ? 58 : count >= 3 ? 52 : 46;
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cx-marker relative grid place-items-center rounded-full ${
        priority === 'critical' ? 'cx-pulse' : ''
      }`}
      style={{ width: size, height: size, ...halo(color, 0.3) }}
      aria-label={`${count} incidencias`}
    >
      <span
        className="absolute inset-0 rounded-full"
        style={{
          background: `radial-gradient(circle, ${color}33 40%, ${color}00 72%)`,
          transform: 'scale(1.9)',
        }}
        aria-hidden
      />
      <span
        className="relative grid size-full place-items-center rounded-full border-[3px] border-white text-[17px] font-extrabold text-white"
        style={{ background: color, boxShadow: `0 8px 20px -6px ${color}` }}
      >
        {count}
      </span>
    </button>
  );
}

export function CameraPin({
  status,
  active = false,
  onClick,
  title,
}: {
  status: DeviceStatus;
  active?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const size = active ? 48 : 36;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`cx-marker relative grid place-items-center rounded-full ${active ? 'cx-pulse' : ''}`}
      style={{ width: size, height: size, ...halo('#2563eb', 0.35) }}
    >
      <span
        className="grid size-full place-items-center rounded-full border-[3px] border-white text-white"
        style={{
          background: active ? 'linear-gradient(145deg,#3b7bff,#1d4ed8)' : '#13284b',
          boxShadow: active
            ? '0 0 0 9px rgb(37 99 235 / 0.16), 0 10px 22px -8px rgb(29 78 216 / 0.9)'
            : '0 6px 14px -6px rgb(11 27 52 / 0.7)',
        }}
      >
        <Video size={active ? 20 : 16} strokeWidth={2.2} aria-hidden />
      </span>
      <span
        className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-white"
        style={{ background: DEVICE_STATUS_COLOR[status] }}
        aria-hidden
      />
    </button>
  );
}

export function DrainGauge({
  level,
  status,
  deviceStatus,
  showLabel = true,
  onClick,
  title,
}: {
  level: number;
  status: DrainStatus;
  deviceStatus: DeviceStatus;
  showLabel?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const color = DRAIN_COLOR[status];
  const r = 15;
  const c = 2 * Math.PI * r;
  const offline = deviceStatus === 'offline';
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={`cx-marker relative flex flex-col items-center ${status === 'critical' ? 'cx-pulse' : ''}`}
      style={halo(color, 0.35)}
    >
      <span className="relative grid size-[38px] place-items-center rounded-full bg-white shadow-[0_6px_14px_-6px_rgb(11_27_52/0.55)]">
        <svg viewBox="0 0 38 38" className="absolute inset-0" aria-hidden>
          <circle cx="19" cy="19" r={r} fill="none" stroke="#e8edf4" strokeWidth="4" />
          <circle
            cx="19"
            cy="19"
            r={r}
            fill="none"
            stroke={offline ? '#9aa6b8' : color}
            strokeWidth="4"
            strokeLinecap="round"
            strokeDasharray={`${(c * Math.min(100, Math.max(0, level))) / 100} ${c}`}
            transform="rotate(-90 19 19)"
          />
        </svg>
        <Droplets
          size={15}
          strokeWidth={2.3}
          style={{ color: offline ? '#9aa6b8' : color }}
          aria-hidden
        />
      </span>
      {showLabel && (
        <span
          className="cx-tabular mt-1 rounded-full px-1.5 py-px text-[10.5px] font-bold text-white shadow-sm"
          style={{ background: offline ? '#9aa6b8' : color }}
        >
          {Math.round(level)} %
        </span>
      )}
    </button>
  );
}

export type Lamp = 'red' | 'yellow' | 'green';

const LAMP_COLOR: Record<Lamp, string> = { red: '#ff4d4f', yellow: '#ffc53d', green: '#2ee37a' };

export function TrafficLightPin({
  lamp,
  onClick,
  title,
  adaptive = false,
}: {
  lamp: Lamp;
  onClick?: () => void;
  title?: string;
  adaptive?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="cx-marker relative flex flex-col items-center"
    >
      <span className="flex h-[44px] w-[20px] flex-col items-center justify-around rounded-[7px] border-2 border-white bg-[#0e1c33] py-[3px] shadow-[0_6px_14px_-6px_rgb(11_27_52/0.8)]">
        {(['red', 'yellow', 'green'] as const).map((l) => (
          <span
            key={l}
            className="size-[9px] rounded-full"
            style={{
              background: l === lamp ? LAMP_COLOR[l] : '#2a3a55',
              boxShadow: l === lamp ? `0 0 8px 2px ${LAMP_COLOR[l]}aa` : 'none',
            }}
          />
        ))}
      </span>
      {adaptive && (
        <span className="mt-1 rounded-full bg-[#0e1c33] px-1.5 py-px text-[9.5px] font-bold uppercase tracking-wide text-white">
          IA
        </span>
      )}
    </button>
  );
}

export function Callout({
  tone = 'blue',
  title,
  subtitle,
  children,
}: {
  tone?: 'blue' | 'red' | 'amber' | 'navy';
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  const border = { blue: '#2563eb', red: '#e5484d', amber: '#f5812a', navy: '#0b1b34' }[tone];
  const titleColor = { blue: '#0b1b34', red: '#c62a2f', amber: '#b85a10', navy: '#0b1b34' }[tone];
  return (
    <div
      className="pointer-events-none relative w-max max-w-[230px] rounded-[12px] border-[1.5px] bg-white px-3 py-2 shadow-cx-lg"
      style={{ borderColor: border }}
    >
      <div className="text-[13.5px] font-bold leading-tight" style={{ color: titleColor }}>
        {title}
      </div>
      {subtitle && <div className="mt-0.5 text-[12px] leading-snug text-cx-ink2">{subtitle}</div>}
      {children}
    </div>
  );
}

export function ZoneLabel({ name }: { name: string }) {
  return (
    <span
      className="pointer-events-none select-none whitespace-nowrap text-[11.5px] font-bold uppercase tracking-[0.2em] text-[#6f7c91]"
      style={{ textShadow: '0 0 4px #fff, 0 0 8px #fff, 0 0 2px #fff' }}
    >
      {name}
    </span>
  );
}
