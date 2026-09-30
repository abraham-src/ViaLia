import type { RoleName } from '@simu/shared-types';
import type { ReactNode } from 'react';
import { createBrowserRouter, Link, Navigate } from 'react-router-dom';
import { AppShell } from '../components/shell/AppShell';
import { ADMIN, STAFF } from '../components/shell/nav';
import { RequireAuth } from '../components/shell/RequireAuth';
import { AccessibilityPage } from '../pages/AccessibilityPage';
import { DashboardPage } from '../pages/DashboardPage';
import { DevicesPage } from '../pages/DevicesPage';
import { IncidentsPage } from '../pages/IncidentsPage';
import { LoginPage } from '../pages/LoginPage';
import { LogsPage } from '../pages/LogsPage';
import { MaintenancePage } from '../pages/MaintenancePage';
import { MapPage } from '../pages/MapPage';
import { RulesPage } from '../pages/RulesPage';
import { UsersPage } from '../pages/UsersPage';
import { CxShell } from '../centro/CxShell';
import { PrototypesPage } from '../centro/pages/PrototypesPage';
import { IncidentDetailPage } from '../centro/pages/IncidentDetailPage';
import { IncidentZoomPage } from '../centro/pages/IncidentZoomPage';
import { IntersectionPage } from '../centro/pages/IntersectionPage';
import { OverviewPage } from '../centro/pages/OverviewPage';
import { PredictionPage } from '../centro/pages/PredictionPage';
import { ProjectPage } from '../centro/pages/ProjectPage';

function NotFound() {
  return (
    <div className="p-6">
      <p className="font-mono text-[12px] text-fg-muted">404 · Vista no encontrada</p>
      <Link to="/" className="mt-2 inline-block text-[#58a6ff] hover:underline">
        Volver al dashboard
      </Link>
    </div>
  );
}

const only = (roles: readonly RoleName[], element: ReactNode) => (
  <RequireAuth roles={roles}>{element}</RequireAuth>
);

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    // Centro de control con el diseño del maquetado. Convive con la consola técnica.
    path: '/centro',
    element: (
      <RequireAuth>
        <CxShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <OverviewPage /> },
      { path: 'prototipos', element: <PrototypesPage /> },
      { path: 'apartado', element: <Navigate to="/centro/prototipos" replace /> },
      { path: 'incidencias', element: <IncidentZoomPage /> },
      { path: 'incidencias/:id', element: <IncidentZoomPage /> },
      { path: 'incidencias/:id/detalle', element: <IncidentDetailPage /> },
      { path: 'interseccion', element: <IntersectionPage /> },
      { path: 'prediccion', element: <PredictionPage /> },
      { path: 'proyecto', element: <ProjectPage /> },
    ],
  },
  {
    path: '/',
    element: (
      <RequireAuth>
        <AppShell />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'mapa', element: <MapPage /> },
      { path: 'incidencias', element: <IncidentsPage /> },
      { path: 'accesibilidad', element: <AccessibilityPage /> },
      { path: 'mantenimiento', element: only(STAFF, <MaintenancePage />) },
      { path: 'dispositivos', element: only(STAFF, <DevicesPage />) },
      { path: 'eventos', element: only(STAFF, <LogsPage />) },
      { path: 'reglas', element: only(ADMIN, <RulesPage />) },
      { path: 'usuarios', element: only(ADMIN, <UsersPage />) },
      { path: '*', element: <NotFound /> },
    ],
  },
]);
