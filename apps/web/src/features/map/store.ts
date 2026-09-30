import { create } from 'zustand';
import { LAYER_KEYS, LAYER_META, type LayerKey } from './layers';

const STORAGE_KEY = 'simu.map.layers.v1';

function initialVisibility(): Record<LayerKey, boolean> {
  const defaults = Object.fromEntries(
    LAYER_KEYS.map((k) => [k, LAYER_META[k].defaultOn]),
  ) as Record<LayerKey, boolean>;
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<
      Record<LayerKey, boolean>
    > | null;
    return saved ? { ...defaults, ...saved } : defaults;
  } catch {
    return defaults; // storage blocked (private mode): per-session defaults
  }
}

export interface FocusRequest {
  lng: number;
  lat: number;
  html: string;
  /** Changes on every request so the same point can be focused twice. */
  nonce: number;
}

interface MapUiState {
  visible: Record<LayerKey, boolean>;
  pitched: boolean;
  focus: FocusRequest | null;
  toggle(key: LayerKey): void;
  setPitched(v: boolean): void;
  focusOn(lng: number, lat: number, html: string): void;
}

export const useMapUi = create<MapUiState>((set, get) => ({
  visible: initialVisibility(),
  pitched: true,
  focus: null,
  toggle: (key) => {
    const visible = { ...get().visible, [key]: !get().visible[key] };
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(visible));
    } catch {
      /* per-viewer convenience only */
    }
    set({ visible });
  },
  setPitched: (pitched) => set({ pitched }),
  focusOn: (lng, lat, html) => set({ focus: { lng, lat, html, nonce: Date.now() } }),
}));
