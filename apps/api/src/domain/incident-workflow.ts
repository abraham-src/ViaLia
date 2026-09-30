/**
 * The incident workflow lives in @simu/shared-utils so the API (enforcement) and the
 * web (which buttons to show) can never disagree. Re-exported here for the API.
 */
export {
  ACTIVE_STATUSES,
  availableActions,
  canPerform,
  canTransition,
  TRANSITIONS,
  type IncidentAction,
  type WorkflowActor,
} from '@simu/shared-utils';
