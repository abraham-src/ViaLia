import { PRIORITY_RANK } from '@simu/shared-types';
import {
  RuleActionSchema,
  RuleConditionsSchema,
  type RuleAction,
  type RuleCondition,
  type RuleConditions,
} from './rules-dsl.js';

/**
 * Pure rules evaluation. Knows nothing about the database: facts come from a resolver,
 * so the same code is unit-tested with fakes and used in production with PostGIS lookups.
 */

export interface EngineRule {
  id: string;
  name: string;
  sortOrder: number;
  conditions: RuleConditions;
  action: RuleAction;
}

export type FactValue = number | boolean | string | null;

/** Resolves the current value of a condition's fact (window-aware for camera facts). */
export type FactResolver = (condition: RuleCondition) => Promise<FactValue>;

export interface RuleMatch {
  rule: EngineRule;
  /** fact name → value observed when the rule matched. */
  facts: Record<string, FactValue>;
}

export interface EvaluationResult {
  /** Every matching rule, in evaluation order. */
  matches: RuleMatch[];
  /** The match whose action is most severe (ties → later sort_order). Null when none match. */
  winner: RuleMatch | null;
}

/** Validates a stored rule. Returns null for rows whose DSL is invalid (they are skipped). */
export function parseRule(row: {
  id: string;
  name: string;
  sortOrder: number;
  conditions: unknown;
  action: unknown;
}): EngineRule | null {
  const conditions = RuleConditionsSchema.safeParse(row.conditions);
  const action = RuleActionSchema.safeParse(row.action);
  if (!conditions.success || !action.success) return null;
  return {
    id: row.id,
    name: row.name,
    sortOrder: row.sortOrder,
    conditions: conditions.data,
    action: action.data,
  };
}

export function compare(op: RuleCondition['op'], actual: FactValue, expected: FactValue): boolean {
  if (actual === null) return false;
  switch (op) {
    case 'eq':
      return actual === expected;
    case 'neq':
      return actual !== expected;
    case 'gt':
    case 'gte':
    case 'lt':
    case 'lte': {
      if (typeof actual !== 'number' || typeof expected !== 'number') return false;
      if (op === 'gt') return actual > expected;
      if (op === 'gte') return actual >= expected;
      if (op === 'lt') return actual < expected;
      return actual <= expected;
    }
  }
}

const factKey = (c: RuleCondition): string =>
  c.window ? `${c.fact}@${c.window.radius_m}m/${c.window.seconds}s` : c.fact;

/** Evaluates rules in sort_order. Conditions are ANDed and short-circuit on the first miss. */
export async function evaluateRules(
  rules: readonly EngineRule[],
  resolveFact: FactResolver,
): Promise<EvaluationResult> {
  const cache = new Map<string, Promise<FactValue>>();
  const resolve = (c: RuleCondition): Promise<FactValue> => {
    const key = factKey(c);
    let value = cache.get(key);
    if (!value) {
      value = resolveFact(c);
      cache.set(key, value);
    }
    return value;
  };

  const ordered = [...rules].sort((a, b) => a.sortOrder - b.sortOrder);
  const matches: RuleMatch[] = [];

  for (const rule of ordered) {
    const facts: Record<string, FactValue> = {};
    let matched = true;
    for (const condition of rule.conditions.all) {
      const actual = await resolve(condition);
      facts[condition.fact] = actual;
      if (!compare(condition.op, actual, condition.value)) {
        matched = false;
        break;
      }
    }
    if (matched) matches.push({ rule, facts });
  }

  let winner: RuleMatch | null = null;
  for (const m of matches) {
    if (
      !winner ||
      PRIORITY_RANK[m.rule.action.set_priority] >= PRIORITY_RANK[winner.rule.action.set_priority]
    ) {
      winner = m;
    }
  }
  return { matches, winner };
}

/** Largest camera search radius used by any rule (to find drains near a camera). */
export function maxCameraRadius(rules: readonly EngineRule[], fallback = 250): number {
  let max = 0;
  for (const r of rules) {
    for (const c of r.conditions.all) {
      if (c.fact.startsWith('camera.') && c.window) max = Math.max(max, c.window.radius_m);
    }
  }
  return max || fallback;
}
