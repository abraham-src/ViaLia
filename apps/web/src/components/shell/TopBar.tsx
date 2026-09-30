import { CloudRain, LogOut } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useDevices, useWeather } from '../../hooks/queries';
import { stopLive } from '../../hooks/useLiveSync';
import { api } from '../../lib/api';
import { formatTime } from '../../lib/format';
import { ROLE_LABEL } from '../../lib/labels';
import { isStaff, useAuth } from '../../stores/auth';
import { useConnection } from '../../stores/connection';

function Clock() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);
  return (
    <span className="font-mono text-[12px] text-fg-muted" title="Hora de la Ciudad de México">
      {formatTime(now)} <span className="text-[10px]">CDMX</span>
    </span>
  );
}

function LiveIndicator() {
  const live = useConnection((s) => s.live);
  const map = {
    open: { label: 'En vivo', cls: 'text-ok', dot: 'bg-ok' },
    connecting: { label: 'Conectando', cls: 'text-fg-muted', dot: 'bg-fg-muted' },
    reconnecting: { label: 'Reconectando', cls: 'text-warn', dot: 'bg-warn' },
    idle: { label: 'Sin tiempo real', cls: 'text-fg-muted', dot: 'bg-fg-muted' },
  }[live];
  return (
    <span className={`inline-flex items-center gap-1.5 font-mono text-[11px] uppercase ${map.cls}`}>
      <span
        className={`size-1.5 ${map.dot} ${live === 'open' ? 'animate-pulse' : ''}`}
        aria-hidden
      />
      {map.label}
    </span>
  );
}

function DeviceSummary() {
  const { data } = useDevices();
  if (!data) return null;
  const count = (s: string) => data.filter((d) => d.status === s).length;
  const items = [
    { n: count('online'), label: 'en línea', cls: 'text-ok' },
    { n: count('degraded'), label: 'degradados', cls: 'text-warn' },
    { n: count('offline'), label: 'fuera de línea', cls: 'text-critical' },
    { n: count('maintenance'), label: 'mantenimiento', cls: 'text-fg-muted' },
  ];
  return (
    <span
      className="hidden items-center gap-3 font-mono text-[11px] md:inline-flex"
      aria-label="Estado de dispositivos"
    >
      {items.map((i) => (
        <span key={i.label} className={i.n === 0 && i.cls !== 'text-ok' ? 'text-fg-muted' : i.cls}>
          {i.n} <span className="text-fg-muted">{i.label}</span>
        </span>
      ))}
    </span>
  );
}

function WeatherBadge() {
  const { data } = useWeather();
  if (!data?.raining) return null;
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[11px] text-warn"
      title="Reporte de lluvia vigente"
    >
      <CloudRain size={13} strokeWidth={1.5} aria-hidden />
      Lluvia {data.zone ?? 'CDMX'}
      {data.intensity_mm_h !== null && ` · ${data.intensity_mm_h} mm/h`}
    </span>
  );
}

export function TopBar() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();

  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    stopLive();
    useAuth.getState().clear();
    qc.clear();
    navigate('/login', { replace: true });
  };

  return (
    <header className="col-span-2 flex h-10 items-center gap-4 border-b border-line bg-surface px-3">
      <span className="font-mono text-[13px] font-medium tracking-wide">ViaLia · CDMX</span>
      <span className="h-4 w-px bg-line" aria-hidden />
      {isStaff(user) && <DeviceSummary />}
      <WeatherBadge />
      <span className="flex-1" />
      <LiveIndicator />
      <Clock />
      {user && (
        <span className="flex items-center gap-2 border-l border-line pl-3">
          <span className="text-right leading-tight">
            <span className="block text-[12px]">{user.name}</span>
            <span className="block text-[10px] uppercase tracking-wider text-fg-muted">
              {ROLE_LABEL[user.role]}
            </span>
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            className="rounded-sm border border-line p-1 text-fg-muted hover:border-accent hover:text-fg"
            title="Cerrar sesión"
            aria-label="Cerrar sesión"
          >
            <LogOut size={14} strokeWidth={1.5} />
          </button>
        </span>
      )}
    </header>
  );
}
