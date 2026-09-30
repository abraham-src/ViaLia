import { create } from 'zustand';

export type LiveStatus = 'idle' | 'connecting' | 'open' | 'reconnecting';

interface ConnectionState {
  /** navigator.onLine: false means this computer has no network at all. */
  browserOnline: boolean;
  /** null until the first request; false when the API does not answer. */
  serverReachable: boolean | null;
  live: LiveStatus;
  lastDataAt: number | null;
  setBrowserOnline(v: boolean): void;
  setServerReachable(v: boolean): void;
  setLive(v: LiveStatus): void;
  touch(): void;
}

export const useConnection = create<ConnectionState>((set, get) => ({
  browserOnline: typeof navigator === 'undefined' ? true : navigator.onLine,
  serverReachable: null,
  live: 'idle',
  lastDataAt: null,
  setBrowserOnline: (v) => set({ browserOnline: v }),
  setServerReachable: (v) => {
    if (get().serverReachable !== v) set({ serverReachable: v });
  },
  setLive: (v) => set({ live: v }),
  touch: () => set({ lastDataAt: Date.now() }),
}));

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => useConnection.getState().setBrowserOnline(true));
  window.addEventListener('offline', () => useConnection.getState().setBrowserOnline(false));
}
