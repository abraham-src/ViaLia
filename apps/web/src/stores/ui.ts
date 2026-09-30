import { create } from 'zustand';

const KEY = 'simu.ui.timeline';

function readOpen(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

interface UiState {
  timelineOpen: boolean;
  setTimelineOpen(v: boolean): void;
}

/** Per-viewer layout preferences (remembered in this browser only). */
export const useUi = create<UiState>((set) => ({
  timelineOpen: readOpen(),
  setTimelineOpen: (v) => {
    try {
      localStorage.setItem(KEY, v ? '1' : '0');
    } catch {
      /* convenience only */
    }
    set({ timelineOpen: v });
  },
}));
