import type { IncidentStatus, RoleName } from '@simu/shared-types';

/**
 * Incident lifecycle, shared by the API (enforcement) and the web (which actions to
 * offer). One source of truth: a button the UI shows is an action the API accepts.
 *
 *   pending ──validate──▶ validated ──assign──▶ assigned ──start──▶ in_progress ──resolve──▶ resolved
 *      │                     │                     │ ▲                               ▲
 *      │                     └──────resolve────────┼─┼───────────────────────────────┘
 *      ├──assign (auto-validates)──────────────────┘ └ reassign
 *      └──reject──▶ rejected ◀──reject── validated
 *
 * Maintenance UI labels: PENDIENTE = assigned, ACEPTADA = assigned (seen),
 * EN ATENCIÓN = in_progress, RESUELTA = resolved.
 */
export type IncidentAction = 'validate' | 'reject' | 'assign' | 'start' | 'resolve';

interface Transition {
  from: readonly IncidentStatus[];
  to: IncidentStatus;
}

export const TRANSITIONS: Record<IncidentAction, Transition> = {
  validate: { from: ['pending'], to: 'validated' },
  reject: { from: ['pending', 'validated'], to: 'rejected' },
  assign: { from: ['pending', 'validated', 'assigned'], to: 'assigned' },
  start: { from: ['assigned'], to: 'in_progress' },
  resolve: { from: ['validated', 'assigned', 'in_progress'], to: 'resolved' },
};

export const ACTIVE_STATUSES: readonly IncidentStatus[] = [
  'pending',
  'validated',
  'assigned',
  'in_progress',
];

export function canTransition(action: IncidentAction, from: IncidentStatus): boolean {
  return TRANSITIONS[action].from.includes(from);
}

export interface WorkflowActor {
  id: string;
  role: RoleName;
}

/** Role/ownership check. Status validity is checked separately with canTransition. */
export function canPerform(
  action: IncidentAction,
  actor: WorkflowActor,
  incident: { assignedToId: string | null },
): boolean {
  const staff = actor.role === 'admin' || actor.role === 'operator';
  switch (action) {
    case 'validate':
    case 'reject':
    case 'assign':
      return staff;
    case 'start':
    case 'resolve':
      return staff || (actor.role === 'maintenance' && incident.assignedToId === actor.id);
  }
}

/** Actions this actor can apply to this incident right now (status + role + ownership). */
export function availableActions(
  actor: WorkflowActor,
  incident: { status: IncidentStatus; assignedToId: string | null },
): IncidentAction[] {
  return (Object.keys(TRANSITIONS) as IncidentAction[]).filter(
    (a) => canTransition(a, incident.status) && canPerform(a, actor, incident),
  );
}
