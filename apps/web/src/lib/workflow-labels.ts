import type { IncidentAction } from '@simu/shared-utils';

export const ACTION_LABEL: Record<IncidentAction, string> = {
  validate: 'Validar',
  assign: 'Asignar',
  start: 'Iniciar atención',
  resolve: 'Resolver',
  reject: 'Rechazar',
};

/** Human wording for incident_events.event_type in the audit timeline. */
export const EVENT_LABEL: Record<string, string> = {
  created: 'Creada',
  validated: 'Validada',
  assigned: 'Asignada',
  accepted: 'Aceptada por mantenimiento',
  started: 'Atención iniciada',
  resolved: 'Resuelta',
  rejected: 'Rechazada',
  updated: 'Actualizada',
  priority_changed: 'Prioridad cambiada',
  priority_raised: 'Prioridad elevada por regla',
  redetected: 'Detectada de nuevo',
};
