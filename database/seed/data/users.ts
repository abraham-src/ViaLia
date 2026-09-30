import type { RoleName } from '@simu/shared-types';

export const ROLES: ReadonlyArray<{ name: RoleName; description: string }> = [
  { name: 'admin', description: 'Administración del sistema: usuarios, reglas y configuración.' },
  {
    name: 'operator',
    description: 'Operación del centro de monitoreo: valida y asigna incidencias.',
  },
  {
    name: 'maintenance',
    description: 'Cuadrillas de mantenimiento: atienden incidencias asignadas.',
  },
  { name: 'citizen', description: 'Ciudadanía: consulta rutas accesibles y reporta incidencias.' },
];

/** Demo accounts. The password comes from SEED_DEMO_PASSWORD (.env). */
export const DEMO_USERS: ReadonlyArray<{ name: string; email: string; role: RoleName }> = [
  { name: 'Administración Demo', email: 'admin@simu.local', role: 'admin' },
  { name: 'Operación Demo', email: 'operador@simu.local', role: 'operator' },
  { name: 'Mantenimiento Demo', email: 'mantenimiento@simu.local', role: 'maintenance' },
  { name: 'Ciudadanía Demo', email: 'ciudadano@simu.local', role: 'citizen' },
];
