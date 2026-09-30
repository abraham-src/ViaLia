import type { RoleName } from '@simu/shared-types';
import type { LucideIcon } from 'lucide-react';
import {
  Accessibility,
  CircleAlert,
  Cpu,
  LayoutDashboard,
  ListChecks,
  Map as MapIcon,
  MonitorPlay,
  ScrollText,
  SlidersHorizontal,
  Users,
  Workflow,
} from 'lucide-react';

export interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  roles: readonly RoleName[];
  /** Opens outside the SPA router (e.g. the simulator panel). */
  external?: boolean;
}

const ALL: readonly RoleName[] = ['admin', 'operator', 'maintenance', 'citizen'];
export const STAFF: readonly RoleName[] = ['admin', 'operator', 'maintenance'];
export const ADMIN: readonly RoleName[] = ['admin'];

export const NAV_ITEMS: readonly NavItem[] = [
  { to: '/centro', label: 'Centro de control', icon: MonitorPlay, roles: ALL },
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ALL },
  { to: '/mapa', label: 'Mapa', icon: MapIcon, roles: ALL },
  { to: '/incidencias', label: 'Incidencias', icon: CircleAlert, roles: ALL },
  { to: '/mantenimiento', label: 'Mantenimiento', icon: ListChecks, roles: STAFF },
  { to: '/accesibilidad', label: 'Accesibilidad', icon: Accessibility, roles: ALL },
  { to: '/dispositivos', label: 'Dispositivos', icon: Cpu, roles: STAFF },
  { to: '/eventos', label: 'Logs / Eventos', icon: ScrollText, roles: STAFF },
  { to: '/reglas', label: 'Reglas', icon: Workflow, roles: ADMIN },
  { to: '/usuarios', label: 'Usuarios', icon: Users, roles: ADMIN },
  {
    to: '/simulator/control',
    label: 'Simulador de campo',
    icon: SlidersHorizontal,
    roles: ['admin', 'operator'],
    external: true,
  },
];
