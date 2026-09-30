import type { RoleName } from '@simu/shared-types';
import { useEffect, useState, type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { refreshSession, UnreachableError } from '../../lib/api';
import { useAuth } from '../../stores/auth';

/**
 * Restores the session from the httpOnly refresh cookie on first load, then guards the
 * route. Optional `roles` restricts the view (e.g. admin-only screens).
 */
export function RequireAuth({
  children,
  roles,
}: {
  children: ReactNode;
  roles?: readonly RoleName[];
}) {
  const { status, user } = useAuth();
  const location = useLocation();
  const [unreachable, setUnreachable] = useState(false);

  useEffect(() => {
    if (status !== 'unknown') return;
    let cancelled = false;
    const attempt = () => {
      refreshSession()
        .then(() => !cancelled && setUnreachable(false))
        .catch((err: unknown) => {
          if (cancelled) return;
          if (err instanceof UnreachableError) {
            setUnreachable(true);
            window.setTimeout(attempt, 5000);
          }
        });
    };
    attempt();
    return () => {
      cancelled = true;
    };
  }, [status]);

  if (status === 'unknown') {
    return (
      <div className="flex h-full items-center px-6 font-mono text-[12px] text-fg-muted">
        {unreachable ? 'Servidor no disponible. Reintentando…' : 'Verificando sesión…'}
      </div>
    );
  }
  if (status === 'anonymous')
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (roles && user && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return <>{children}</>;
}
