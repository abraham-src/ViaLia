/** Human-readable (es-MX) rendering of the rules DSL. Mirrors apps/api/src/domain/rules-dsl.ts. */

export const RULE_FACTS = [
  'drain.obstruction_level',
  'weather.raining',
  'camera.water_detected',
  'camera.confidence',
] as const;
export type RuleFact = (typeof RULE_FACTS)[number];

export const RULE_OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

export interface RuleCondition {
  fact: RuleFact;
  op: RuleOperator;
  value: number | boolean | string;
  window?: { radius_m: number; seconds: number };
}

export const FACT_LABEL: Record<RuleFact, string> = {
  'drain.obstruction_level': 'coladera',
  'weather.raining': 'lluvia',
  'camera.water_detected': 'cámara detecta agua',
  'camera.confidence': 'confianza de cámara',
};

export const OP_LABEL: Record<RuleOperator, string> = {
  gt: '>',
  gte: '≥',
  lt: '<',
  lte: '≤',
  eq: '=',
  neq: '≠',
};

/** Facts whose value is a boolean (rendered as sí/no). */
export const BOOLEAN_FACTS: ReadonlySet<RuleFact> = new Set([
  'weather.raining',
  'camera.water_detected',
]);
/** Facts that take a spatial/temporal window. */
export const WINDOW_FACTS: ReadonlySet<RuleFact> = new Set([
  'camera.water_detected',
  'camera.confidence',
]);

function value(c: RuleCondition): string {
  if (typeof c.value === 'boolean') return c.value ? 'sí' : 'no';
  if (c.fact === 'drain.obstruction_level') return `${c.value} %`;
  return String(c.value);
}

export function describeCondition(c: RuleCondition): string {
  const base =
    BOOLEAN_FACTS.has(c.fact) && c.op === 'eq' && c.value === true
      ? FACT_LABEL[c.fact]
      : `${FACT_LABEL[c.fact]} ${OP_LABEL[c.op]} ${value(c)}`;
  return c.window
    ? `${base} (a ${c.window.radius_m} m en ${Math.round(c.window.seconds / 60)} min)`
    : base;
}

export function describeConditions(conditions: unknown): string {
  const all = (conditions as { all?: RuleCondition[] } | null)?.all;
  if (!Array.isArray(all) || all.length === 0) return '—';
  return all.map(describeCondition).join(' Y ');
}
