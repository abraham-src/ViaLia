import { describe, expect, it, vi } from 'vitest';
import { rowActivation } from './row-activation';

function key(k: string, onRow = true) {
  const row = {};
  return { key: k, target: onRow ? row : {}, currentTarget: row, preventDefault: vi.fn() };
}

describe('rowActivation', () => {
  it('is focusable and activates on click, Enter and Space', () => {
    const fn = vi.fn();
    const props = rowActivation(fn);
    expect(props.tabIndex).toBe(0);
    props.onClick();
    props.onKeyDown(key('Enter') as never);
    props.onKeyDown(key(' ') as never);
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('ignores other keys and keys pressed on controls inside the row', () => {
    const fn = vi.fn();
    const props = rowActivation(fn);
    props.onKeyDown(key('a') as never);
    props.onKeyDown(key('Enter', false) as never);
    expect(fn).not.toHaveBeenCalled();
  });
});
