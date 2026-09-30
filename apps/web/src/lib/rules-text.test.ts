import { describe, expect, it } from 'vitest';
import { describeConditions } from './rules-text';

describe('describeConditions', () => {
  it('renders the three rules of the project document', () => {
    expect(
      describeConditions({ all: [{ fact: 'drain.obstruction_level', op: 'gt', value: 80 }] }),
    ).toBe('coladera > 80 %');
    expect(
      describeConditions({
        all: [
          { fact: 'drain.obstruction_level', op: 'gt', value: 80 },
          { fact: 'weather.raining', op: 'eq', value: true },
          {
            fact: 'camera.water_detected',
            op: 'eq',
            value: true,
            window: { radius_m: 250, seconds: 900 },
          },
        ],
      }),
    ).toBe('coladera > 80 % Y lluvia Y cámara detecta agua (a 250 m en 15 min)');
  });

  it('renders negated booleans and other operators', () => {
    expect(describeConditions({ all: [{ fact: 'weather.raining', op: 'eq', value: false }] })).toBe(
      'lluvia = no',
    );
    expect(
      describeConditions({ all: [{ fact: 'camera.confidence', op: 'gte', value: 0.8 }] }),
    ).toBe('confianza de cámara ≥ 0.8');
  });

  it('handles malformed input', () => {
    expect(describeConditions(null)).toBe('—');
    expect(describeConditions({ all: [] })).toBe('—');
  });
});
