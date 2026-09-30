import '@fontsource-variable/plus-jakarta-sans';
import './centro.css';

import { useQueryClient } from '@tanstack/react-query';
import {
  CloudRain,
  LayoutDashboard,
  LogOut,
  Boxes,
  MapPin,
  SlidersHorizontal,
  TriangleAlert,
  Workflow,
} from 'lucide-react';
import { useEffect } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '../components/shell/ErrorBoundary';
import { stopLive, useLiveSync } from '../hooks/useLiveSync';
import { api } from '../lib/api';
import { ROLE_LABEL } from '../lib/labels';
import { useAuth } from '../stores/auth';
import { useConnection } from '../stores/connection';
import { BRAND } from './brand';
import { Logo } from './components/Logo';
import { TrafficLightIcon, type IconType } from './components/icons';
import { lngLatOf, useCxData, useDrainHistory } from './data/useCxData';
import { initials } from './lib/visuals';
import { LIGHT_FALLBACK, demandFromTraffic } from './sim/geometry';
import { MAIN_LIGHT, flagsFromIncidents, useSignal } from './sim/store';
import { useTraffic } from './traffic/traffic';

interface Item {
  to: string;
  label: string;
  icon: IconType;
  end?: boolean;
  badge?: 'incidents';
  external?: boolean;
  staffOnly?: boolean;
  roles?: ReadonlyArray<string>;
}

const MAIN: Item[] = [
  { to: '/centro/prototipos', label: 'Prototipos 3D', icon: Boxes },
  { to: '/centro', label: 'Mapa general', icon: MapPin, end: true },
  { to: '/centro/incidencias', label: 'Incidencias', icon: TriangleAlert, badge: 'incidents' },
  { to: '/centro/interseccion', label: 'Intersección', icon: TrafficLightIcon },
  { to: '/centro/prediccion', label: 'Predicción', icon: CloudRain },
  { to: '/centro/proyecto', label: 'Cómo funciona', icon: Workflow },
];

const CONSOLE: Item[] = [
  { to: '/', label: 'Consola técnica', icon: LayoutDashboard, end: true },
  {
    to: '/simulator/control',
    label: 'Simulador de campo',
    icon: SlidersHorizontal,
    external: true,
    roles: ['admin', 'operator'],
  },
];

const TITLES: Array<[string, string]> = [
  ['/centro/prototipos', 'Prototipos 3D'],
  ['/centro/interseccion', 'Intersección'],
  ['/centro/prediccion', 'Predicción'],
  ['/centro/proyecto', 'Cómo funciona'],
  ['/centro/incidencias', 'Incidencias'],
  ['/centro', 'Mapa general'],
];

function NavItem({ item, badge }: { item: Item; badge?: number }) {
  const cls = (active: boolean) =>
    `group flex h-[46px] items-center gap-3 rounded-[13px] px-3.5 text-[14.5px] font-semibold transition ${
      active
        ? 'bg-gradient-to-r from-[#2f6bff] to-[#2458e6] text-white shadow-[0_10px_24px_-10px_rgb(37_99_235/0.9)]'
        : 'text-[#c3cee3] hover:bg-white/[0.06] hover:text-white'
    }`;
  const content = (
    <>
      <item.icon size={19} strokeWidth={2} className="shrink-0" />
      <span className="flex-1 truncate">{item.label}</span>
      {badge !== undefined && badge > 0 && (
        <span className="cx-tabular grid h-[22px] min-w-[26px] place-items-center rounded-full bg-[#ef4444] px-1.5 text-[12px] font-bold text-white">
          {badge}
        </span>
      )}
    </>
  );
  if (item.external) {
    return (
      <a href={item.to} target="_blank" rel="noreferrer" className={cls(false)}>
        {content}
      </a>
    );
  }
  return (
    <NavLink to={item.to} end={item.end} className={({ isActive }) => cls(isActive)}>
      {content}
    </NavLink>
  );
}

function LiveCard() {
  const live = useConnection((s) => s.live);
  const reachable = useConnection((s) => s.serverReachable);
  const ok = live === 'open' && reachable !== false;
  return (
    <div className="flex items-center gap-2.5 rounded-[14px] bg-white/[0.05] px-3.5 py-3">
      <span className="relative flex size-2.5">
        {ok && (
          <span className="absolute inline-flex size-full animate-ping rounded-full bg-[#34d399] opacity-60" />
        )}
        <span
          className={`relative inline-flex size-2.5 rounded-full ${ok ? 'bg-[#34d399]' : 'bg-[#fbbf24]'}`}
        />
      </span>
      <div className="leading-tight">
        <div className="text-[13px] font-semibold text-white">
          {ok ? 'En vivo' : 'Reconectando…'}
        </div>
        <div className="text-[11.5px] text-[#8fa0bf]">
          {ok ? 'WebSocket · datos del simulador' : 'Se muestran los últimos datos'}
        </div>
      </div>
    </div>
  );
}

function UserCard() {
  const user = useAuth((s) => s.user);
  const navigate = useNavigate();
  const qc = useQueryClient();
  if (!user) return null;
  const logout = async () => {
    await api.post('/auth/logout').catch(() => undefined);
    stopLive();
    useAuth.getState().clear();
    qc.clear();
    navigate('/login', { replace: true });
  };
  return (
    <div className="flex items-center gap-3 px-1">
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#3b7bff] to-[#1d4ed8] text-[13px] font-bold text-white">
        {initials(user.name)}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13.5px] font-semibold text-white">{user.name}</div>
        <div className="text-[12px] text-[#8fa0bf]">{ROLE_LABEL[user.role]}</div>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="grid size-9 place-items-center rounded-full text-[#8fa0bf] hover:bg-white/10 hover:text-white"
        aria-label="Cerrar sesión"
        title="Cerrar sesión"
      >
        <LogOut size={17} strokeWidth={2} />
      </button>
    </div>
  );
}

/**
 * Mantiene viva la simulación del semáforo y la conecta con las incidencias reales y con el
 * tráfico en tiempo real del simulador de campo (demanda de cada acceso).
 */
function useSignalLink() {
  const data = useCxData();
  const traffic = useTraffic();
  const setLiveDemand = useSignal((s) => s.setLiveDemand);
  const start = useSignal((s) => s.start);
  const stop = useSignal((s) => s.stop);
  const applyFlags = useSignal((s) => s.applyFlags);
  const record = useDrainHistory((s) => s.record);

  useEffect(() => {
    start();
    return () => stop();
  }, [start, stop]);

  const light = data.byCode.get(MAIN_LIGHT);
  useEffect(() => {
    if (!light) return;
    applyFlags(flagsFromIncidents(lngLatOf(light), data.incidents));
  }, [light, data.incidents, applyFlags]);

  const lightAt = light ? lngLatOf(light) : LIGHT_FALLBACK;
  const [lng, lat] = lightAt;
  useEffect(() => {
    setLiveDemand(demandFromTraffic([lng, lat], traffic.live.features));
  }, [lng, lat, traffic.live, setLiveDemand]);

  useEffect(() => {
    if (data.devices.length) record(data.devices);
  }, [data.devices, record]);

  return data;
}

/** Marco del centro de control: barra lateral azul marino + contenido claro. */
export function CxShell() {
  useLiveSync();
  const data = useSignalLink();
  const { pathname } = useLocation();
  const role = useAuth((s) => s.user?.role);

  useEffect(() => {
    const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1];
    document.title = `${BRAND.name} · ${title ?? 'Centro de control'}`;
  }, [pathname]);

  const consoleItems = CONSOLE.filter((i) => !i.roles || (role && i.roles.includes(role)));

  return (
    <div className="cx-root flex h-full min-h-0">
      <aside className="flex w-[252px] shrink-0 flex-col bg-gradient-to-b from-[#0c1d38] via-[#0b1a31] to-[#081427] px-4 pb-4 pt-6">
        <div className="px-1.5">
          <Logo />
        </div>
        <nav aria-label="Centro de control" className="mt-8 flex flex-col gap-1.5">
          {MAIN.map((item) => (
            <NavItem
              key={item.to}
              item={item}
              badge={item.badge === 'incidents' ? data.incidents.length : undefined}
            />
          ))}
        </nav>
        <div className="mb-2 mt-7 px-3.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#5f7299]">
          Consola
        </div>
        <nav aria-label="Herramientas" className="flex flex-col gap-1.5">
          {consoleItems.map((item) => (
            <NavItem key={item.to} item={item} />
          ))}
        </nav>
        <div className="mt-auto flex flex-col gap-3 pt-6">
          <LiveCard />
          <UserCard />
        </div>
      </aside>
      <main className="min-h-0 min-w-0 flex-1 overflow-auto">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
    </div>
  );
}
