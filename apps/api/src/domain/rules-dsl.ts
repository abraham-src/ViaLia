import { INCIDENT_PRIORITIES, INCIDENT_TYPES } from '@simu/shared-types';
import { z } from 'zod';

/**
 * Validation schema for the rules DSL stored in rules.conditions / rules.action.
 * The evaluator (Phase 3) consumes exactly this shape.
 */
export const RULE_FACTS = [
  'drain.obstruction_level',
  'weather.raining',
  'camera.water_detected',
  'camera.confidence',
] as const;

export const RULE_OPERATORS = ['gt', 'gte', 'lt', 'lte', 'eq', 'neq'] as const;

export const RuleConditionSchema = z
  .object({
    fact: z.enum(RULE_FACTS),
    op: z.enum(RULE_OPERATORS),
    value: z.union([z.number(), z.boolean(), z.string()]),
    window: z
      .object({
        radius_m: z.number().int().min(1).max(5000),
        seconds: z.number().int().min(1).max(86_400),
      })
      .strict()
      .optional(),
  })
  .strict();

export const RuleConditionsSchema = z
  .object({ all: z.array(RuleConditionSchema).min(1).max(10) })
  .strict();

export const RuleActionSchema = z
  .object({
    incident_type: z.enum(INCIDENT_TYPES),
    set_priority: z.enum(INCIDENT_PRIORITIES),
    emit_alert: z.boolean().default(true),
    label: z.string().min(1).max(40).optional(),
  })
  .strict();

export type RuleCondition = z.infer<typeof RuleConditionSchema>;
export type RuleConditions = z.infer<typeof RuleConditionsSchema>;
export type RuleAction = z.infer<typeof RuleActionSchema>;
