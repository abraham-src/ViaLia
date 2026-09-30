import { create } from 'zustand';

export interface FocusRequest {
  center: [number, number];
  zoom: number;
  label?: string;
  /** Cambia en cada petición para volar aunque el destino sea el mismo. */
  nonce: number;
}

interface FocusStore {
  request: FocusRequest | null;
  focus(req: Omit<FocusRequest, 'nonce'>): void;
  clear(): void;
}

/** Peticiones de "llévame a…" desde la búsqueda hacia el mapa general. */
export const useMapFocus = create<FocusStore>((set) => ({
  request: null,
  focus: (req) => set({ request: { ...req, nonce: Date.now() } }),
  clear: () => set({ request: null }),
}));
