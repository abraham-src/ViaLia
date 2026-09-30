import type { KeyboardEvent } from 'react';

/**
 * Props that make a clickable table row reachable and operable from the keyboard:
 * Tab focuses it, Enter or Space activates it. Keys pressed on controls inside the
 * row (switches, buttons) are left alone.
 */
export function rowActivation(activate: () => void) {
  return {
    tabIndex: 0,
    onClick: activate,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      if (e.target !== e.currentTarget) return;
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        activate();
      }
    },
  };
}
