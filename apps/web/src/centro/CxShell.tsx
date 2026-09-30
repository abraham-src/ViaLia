import '@fontsource-variable/plus-jakarta-sans';
import './centro.css';

import { useQueryClient } from '@tanstack/react-query';
import {
  CloudRain,
  LayoutDashboard,
  LogOut,
  Boxes,
  MapPin,
  Menu,
  SlidersHorizontal,
  TriangleAlert,
  Workflow,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ErrorBoundary } from '../components/shell/ErrorBoundary';
import { stopLive, useLiveSync } from '../hooks/useLiveSync';
import { api } from '../lib/api';
import { ROLE_LABEL } from '../lib/labels';
import { useAuth } from '../stores/auth';
import { useConnection } from '../stores/connection';
import { BRAND } from './brand';
import { Logo, LogoMark } from './components/Logo';
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
        ? 'bg-white text-cx-navy shadow-[0_10px_24px_-12px_rgb(0_0_0/0.55)]'
        : 'text-[#cdd7e4] hover:bg-white/[0.08] hover:text-white'
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
        <div className="text-[11.5px] text-[#9fb0c6]">
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
      <span className="grid size-10 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#2b6cb3] to-[#174b86] text-[13px] font-bold text-white">
        {initials(user.name)}
      </span>
      <div className="min-w-0 flex-1 leading-tight">
        <div className="truncate text-[13.5px] font-semibold text-white">{user.name}</div>
        <div className="text-[12px] text-[#9fb0c6]">{ROLE_LABEL[user.role]}</div>
      </div>
      <button
        type="button"
        onClick={() => void logout()}
        className="grid size-9 place-items-center rounded-full text-[#9fb0c6] hover:bg-white/10 hover:text-white"
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

  // Menú lateral deslizable en pantallas angostas: se cierra al navegar o con Escape.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);
  const pageTitle = TITLES.find(([p]) => pathname.startsWith(p))?.[1] ?? 'Centro de control';

  return (
    <div className="cx-root flex h-full min-h-0 flex-col lg:flex-row">
      <header className="flex h-14 shrink-0 items-center gap-3 bg-cx-navy px-3 text-white shadow-[0_8px_24px_-16px_rgb(0_0_0/0.6)] lg:hidden">
        <button
          type="button"
          onClick={() => setMenuOpen(true)}
          className="grid size-10 place-items-center rounded-[12px] hover:bg-white/10"
          aria-label="Abrir menú"
          aria-expanded={menuOpen}
          aria-controls="cx-sidebar"
        >
          <Menu size={22} />
        </button>
        <LogoMark size={30} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="text-[15px] font-extrabold tracking-[-0.01em]">{BRAND.name}</div>
          <div className="truncate text-[11.5px] font-medium text-[#aebccd]">{pageTitle}</div>
        </div>
        {data.incidents.length > 0 && (
          <NavLink
            to="/centro/incidencias"
            className="cx-tabular grid h-8 min-w-8 place-items-center rounded-full bg-[#ef4444] px-2 text-[12.5px] font-bold"
            aria-label={`${data.incidents.length} incidencias activas`}
          >
            {data.incidents.length}
          </NavLink>
        )}
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#0d233d]/55 backdrop-blur-[2px] lg:hidden"
          onClick={() => setMenuOpen(false)}
          aria-hidden
        />
      )}

      <aside
        id="cx-sidebar"
        className={`fixed inset-y-0 left-0 z-50 flex w-[272px] max-w-[85vw] flex-col overflow-y-auto bg-gradient-to-b from-[#183b63] via-[#143254] to-[#0d233d] px-4 pb-4 pt-6 transition-transform duration-300 lg:static lg:z-auto lg:w-[252px] lg:max-w-none lg:shrink-0 lg:translate-x-0 ${
          menuOpen ? 'translate-x-0 shadow-2xl' : '-translate-x-full'
        }`}
      >
        <div className="flex items-start justify-between px-1.5">
          <Logo />
          <button
            type="button"
            onClick={() => setMenuOpen(false)}
            className="-mr-1 grid size-9 place-items-center rounded-full text-[#aebccd] hover:bg-white/10 hover:text-white lg:hidden"
            aria-label="Cerrar menú"
          >
            <X size={20} />
          </button>
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
        <div className="mb-2 mt-7 px-3.5 text-[11px] font-bold uppercase tracking-[0.16em] text-[#7489a3]">
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
