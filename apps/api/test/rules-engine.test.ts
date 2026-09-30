import { describe, expect, it } from 'vitest';
import type { RuleCondition } from '../src/domain/rules-dsl.js';
import {
  compare,
  evaluateRules,
  maxCameraRadius,
  parseRule,
  type EngineRule,
  type FactValue,
} from '../src/domain/rules-engine.js';

/** The three seeded rules (database/seed/data/rules.ts), parsed through the real DSL schema. */
const DRAIN = { fact: 'drain.obstruction_level', op: 'gt', value: 80 };
const RAIN = { fact: 'weather.raining', op: 'eq', value: true };
const CAMERA = {
  fact: 'camera.water_detected',
  op: 'eq',
  value: true,
  window: { radius_m: 250, seconds: 900 },
};

function rule(
  id: string,
  sortOrder: number,
  all: object[],
  priority: string,
  type: string,
): EngineRule {
  const parsed = parseRule({
    id,
    name: id,
    sortOrder,
    conditions: { all },
    action: { incident_type: type, set_priority: priority, emit_alert: true, label: id },
  });
  if (!parsed) throw new Error(`invalid test rule ${id}`);
  return parsed;
}

const RULES = [
  rule('ALERTA', 10, [DRAIN], 'medium', 'drain_obstruction'),
  rule('RIESGO ALTO', 20, [DRAIN, RAIN], 'high', 'flood_risk'),
  rule('RIESGO CRÍTICO', 30, [DRAIN, RAIN, CAMERA], 'critical', 'flood_risk'),
];

function facts(values: Record<string, FactValue>) {
  const calls: string[] = [];
  const resolve = async (c: RuleCondition): Promise<FactValue> => {
    calls.push(c.fact);
    return values[c.fact] ?? null;
  };
  return { resolve, calls };
}

describe('rules engine: the three rules from the project document', () => {
  it('drain ≤ 80 → nothing', async () => {
    const { winner, matches } = await evaluateRules(
      RULES,
      facts({ 'drain.obstruction_level': 80 }).resolve,
    );
    expect(winner).toBeNull();
    expect(matches).toHaveLength(0);
  });

  it('drain > 80 → ALERTA', async () => {
    const { winner } = await evaluateRules(
      RULES,
      facts({ 'drain.obstruction_level': 88, 'weather.raining': false }).resolve,
    );
    expect(winner?.rule.name).toBe('ALERTA');
    expect(winner?.rule.action.set_priority).toBe('medium');
  });

  it('drain > 80 AND rain → RIESGO ALTO', async () => {
    const { winner, matches } = await evaluateRules(
      RULES,
      facts({
        'drain.obstruction_level': 88,
        'weather.raining': true,
        'camera.water_detected': false,
      }).resolve,
    );
    expect(matches.map((m) => m.rule.name)).toEqual(['ALERTA', 'RIESGO ALTO']);
    expect(winner?.rule.name).toBe('RIESGO ALTO');
  });

  it('drain > 80 AND rain AND camera water → RIESGO CRÍTICO, with the facts that matched', async () => {
    const { winner } = await evaluateRules(
      RULES,
      facts({
        'drain.obstruction_level': 88,
        'weather.raining': true,
        'camera.water_detected': true,
      }).resolve,
    );
    expect(winner?.rule.name).toBe('RIESGO CRÍTICO');
    expect(winner?.rule.action).toMatchObject({
      set_priority: 'critical',
      incident_type: 'flood_risk',
    });
    expect(winner?.facts).toEqual({
      'drain.obstruction_level': 88,
      'weather.raining': true,
      'camera.water_detected': true,
    });
  });

  it('camera water without rain is not enough for the critical rule', async () => {
    const { winner } = await evaluateRules(
      RULES,
      facts({
        'drain.obstruction_level': 95,
        'weather.raining': false,
        'camera.water_detected': true,
      }).resolve,
    );
    expect(winner?.rule.name).toBe('ALERTA');
  });

  it('resolves each fact once per evaluation and short-circuits failed conditions', async () => {
    const low = facts({ 'drain.obstruction_level': 10 });
    await evaluateRules(RULES, low.resolve);
    // The drain condition fails first in every rule: rain and camera are never queried.
    expect(low.calls).toEqual(['drain.obstruction_level']);
  });

  it('evaluates in sort_order regardless of input order', async () => {
    const { matches } = await evaluateRules(
      [...RULES].reverse(),
      facts({
        'drain.obstruction_level': 88,
        'weather.raining': true,
        'camera.water_detected': true,
      }).resolve,
    );
    expect(matches.map((m) => m.rule.sortOrder)).toEqual([10, 20, 30]);
  });
});

describe('compare', () => {
  it.each([
    ['gt', 81, 80, true],
    ['gt', 80, 80, false],
    ['gte', 80, 80, true],
    ['lt', 3, 4, true],
    ['lte', 4, 4, true],
    ['eq', true, true, true],
    ['eq', false, true, false],
    ['neq', 'a', 'b', true],
    ['gt', 'high', 80, false],
    ['eq', null, true, false],
  ] as const)('%s(%s, %s) = %s', (op, actual, expected, result) => {
    expect(compare(op, actual, expected)).toBe(result);
  });
});

describe('parseRule / maxCameraRadius', () => {
  it('rejects rules with invalid DSL instead of crashing the engine', () => {
    expect(
      parseRule({
        id: 'x',
        name: 'x',
        sortOrder: 1,
        conditions: { all: [{ fact: 'drain.temperature', op: 'gt', value: 1 }] },
        action: { incident_type: 'flood_risk', set_priority: 'high' },
      }),
    ).toBeNull();
  });

  it('finds the widest camera radius (to know which drains a camera affects)', () => {
    expect(maxCameraRadius(RULES)).toBe(250);
    expect(maxCameraRadius(RULES.slice(0, 2))).toBe(250); // fallback
  });
});
