import { INCIDENT_STATUSES } from '@simu/shared-types';
import { describe, expect, it } from 'vitest';
import { redactUrl } from '../src/app.js';
import { parseDurationSeconds } from '../src/config.js';
import {
  availableActions,
  canPerform,
  canTransition,
  TRANSITIONS,
  type IncidentAction,
} from '../src/domain/incident-workflow.js';

const op = { id: 'op-1', role: 'operator' } as const;
const mnt = { id: 'mnt-1', role: 'maintenance' } as const;
const citizen = { id: 'cit-1', role: 'citizen' } as const;

describe('incident workflow transitions', () => {
  it('follows the maintenance flow pending → assigned → in_progress → resolved', () => {
    expect(canTransition('assign', 'pending')).toBe(true);
    expect(canTransition('start', 'assigned')).toBe(true);
    expect(canTransition('resolve', 'in_progress')).toBe(true);
  });

  it('treats resolved and rejected as terminal', () => {
    for (const action of Object.keys(TRANSITIONS) as IncidentAction[]) {
      expect(canTransition(action, 'resolved')).toBe(false);
      expect(canTransition(action, 'rejected')).toBe(false);
    }
  });

  it('cannot start work that was never assigned', () => {
    expect(canTransition('start', 'pending')).toBe(false);
    expect(canTransition('start', 'validated')).toBe(false);
  });

  it('only targets valid statuses', () => {
    for (const t of Object.values(TRANSITIONS)) {
      expect(INCIDENT_STATUSES).toContain(t.to);
      for (const f of t.from) expect(INCIDENT_STATUSES).toContain(f);
    }
  });
});

describe('incident workflow permissions', () => {
  it('lets operators triage', () => {
    for (const a of ['validate', 'reject', 'assign', 'start', 'resolve'] as const) {
      expect(canPerform(a, op, { assignedToId: null })).toBe(true);
    }
  });

  it('lets maintenance work only on incidents assigned to them', () => {
    expect(canPerform('start', mnt, { assignedToId: 'mnt-1' })).toBe(true);
    expect(canPerform('resolve', mnt, { assignedToId: 'mnt-1' })).toBe(true);
    expect(canPerform('start', mnt, { assignedToId: 'someone-else' })).toBe(false);
    expect(canPerform('validate', mnt, { assignedToId: 'mnt-1' })).toBe(false);
    expect(canPerform('assign', mnt, { assignedToId: 'mnt-1' })).toBe(false);
  });

  it('never lets citizens move incidents', () => {
    for (const a of Object.keys(TRANSITIONS) as IncidentAction[]) {
      expect(canPerform(a, citizen, { assignedToId: 'cit-1' })).toBe(false);
    }
  });
});

describe('availableActions (what the UI offers)', () => {
  it('offers triage actions to operators on a pending incident', () => {
    expect(availableActions(op, { status: 'pending', assignedToId: null })).toEqual([
      'validate',
      'reject',
      'assign',
    ]);
  });

  it('offers start/resolve to the assigned maintenance user only', () => {
    expect(availableActions(mnt, { status: 'assigned', assignedToId: 'mnt-1' })).toEqual([
      'start',
      'resolve',
    ]);
    expect(availableActions(mnt, { status: 'assigned', assignedToId: 'other' })).toEqual([]);
  });

  it('offers nothing on closed incidents', () => {
    expect(availableActions(op, { status: 'resolved', assignedToId: null })).toEqual([]);
  });
});

describe('helpers', () => {
  it('parses durations', () => {
    expect(parseDurationSeconds('15m')).toBe(900);
    expect(parseDurationSeconds('7d')).toBe(604_800);
    expect(() => parseDurationSeconds('15 minutes')).toThrow(RangeError);
  });

  it('redacts WebSocket tokens from logged URLs', () => {
    expect(redactUrl('/ws?token=eyJabc.def&x=1')).toBe('/ws?token=[redacted]&x=1');
    expect(redactUrl('/devices?type=drain')).toBe('/devices?type=drain');
  });
});
