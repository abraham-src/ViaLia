import { describe, expect, it } from 'vitest';
import { drainStatusFromLevel } from '../src/drain.js';

describe('drainStatusFromLevel', () => {
  it.each([
    [0, 'normal'],
    [42, 'normal'],
    [50, 'caution'],
    [71, 'caution'],
    [80, 'caution'],
    [81, 'alert'],
    [88, 'alert'],
    [90, 'alert'],
    [92, 'critical'],
    [100, 'critical'],
  ] as const)('%d percent is %s', (level, status) => {
    expect(drainStatusFromLevel(level)).toBe(status);
  });

  it.each([-1, 101, Number.NaN])('rejects %d', (level) => {
    expect(() => drainStatusFromLevel(level)).toThrow(RangeError);
  });
});
