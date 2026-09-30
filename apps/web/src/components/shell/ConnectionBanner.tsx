import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { API_BASE } from '../../lib/api';
import { formatAge } from '../../lib/format';
import { useConnection } from '../../stores/connection';
import { TopBanner } from '../ui/Feedback';

/** Re-renders every `ms` so relative ages ("hace 2 min") stay current. */
function useTick(ms: number, active: boolean): void {
  const [, set] = useState(0);
  useEffect(() => {
    if (!active) return;
    const t = window.setInterval(() => set((n) => n + 1), ms);
    return () => window.clearInterval(t);
  }, [ms, active]);
}

/**
 * Distinguishes "this computer is offline" from "online but the server is down"
 * (spec §6.3 / §7.3). While the server is down it probes /health; on recovery every
 * query is refetched so the "últimos datos" are replaced right away.
 */
export function ConnectionBanner() {
  const qc = useQueryClient();
  const browserOnline = useConnection((s) => s.browserOnline);
  const serverReachable = useConnection((s) => s.serverReachable);
  const lastDataAt = useConnection((s) => s.lastDataAt);
  const degraded = !browserOnline || serverReachable === false;
  const wasDegraded = useRef(false);
  useTick(15_000, degraded);

  useEffect(() => {
    if (!browserOnline || serverReachable !== false) return;
    const timer = window.setInterval(() => {
      fetch(`${API_BASE}/health`)
        .then((r) => {
          if (r.ok) useConnection.getState().setServerReachable(true);
        })
        .catch(() => undefined);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [browserOnline, serverReachable]);

  // Back online / server back: refresh everything that was shown stale.
  useEffect(() => {
    if (degraded) {
      wasDegraded.current = true;
    } else if (wasDegraded.current) {
      wasDegraded.current = false;
      void qc.invalidateQueries();
    }
  }, [degraded, qc]);

  const age = lastDataAt ? ` · actualizados ${formatAge(new Date(lastDataAt).toISOString())}` : '';
  if (!browserOnline) {
    return <TopBanner tone="warn">Sin conexión — mostrando últimos datos{age}</TopBanner>;
  }
  if (serverReachable === false) {
    return (
      <TopBanner tone="danger">
        Servidor no disponible, mostrando últimos datos{age}. Reintentando cada 5 s.
      </TopBanner>
    );
  }
  return null;
}
