import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useLiveSync } from '../../hooks/useLiveSync';
import { BottomBar } from './BottomBar';
import { ConnectionBanner } from './ConnectionBanner';
import { ErrorBoundary } from './ErrorBoundary';
import { NAV_ITEMS } from './nav';
import { NavRail } from './NavRail';
import { TopBar } from './TopBar';

/** Browser tab title per view: "ViaLia · Mapa". */
function useViewTitle(pathname: string): void {
  useEffect(() => {
    const item = NAV_ITEMS.find(
      (i) => !i.external && (i.to === '/' ? pathname === '/' : pathname.startsWith(i.to)),
    );
    document.title = item && item.to !== '/' ? `ViaLia · ${item.label}` : 'ViaLia · CDMX';
  }, [pathname]);
}

/** Control-room frame: banner · top bar · nav rail | content · live strip. */
export function AppShell() {
  useLiveSync();
  const { pathname } = useLocation();
  useViewTitle(pathname);
  return (
    <div className="flex h-full flex-col">
      <ConnectionBanner />
      <div className="grid min-h-0 flex-1 grid-cols-[48px_1fr] grid-rows-[40px_minmax(0,1fr)_auto]">
        <TopBar />
        <NavRail />
        <main className="min-h-0 min-w-0 overflow-auto">
          <ErrorBoundary resetKey={pathname}>
            <Outlet />
          </ErrorBoundary>
        </main>
        <BottomBar />
      </div>
    </div>
  );
}
