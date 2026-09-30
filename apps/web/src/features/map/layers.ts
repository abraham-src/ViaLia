import type { ExpressionSpecification, LayerSpecification } from 'maplibre-gl';
import { COLORS } from './icons';

/** The 12 toggleable layers of spec §7.2, in sidebar order. */
export const LAYER_KEYS = [
  'cameras',
  'traffic_lights',
  'drains',
  'incidents',
  'flood_zones',
  'ramps',
  'sidewalks',
  'crosswalks',
  'routes',
  'obstacles',
  'sensor_state',
  'device_state',
] as const;
export type LayerKey = (typeof LAYER_KEYS)[number];

export interface LayerMeta {
  key: LayerKey;
  label: string;
  group: 'Infraestructura' | 'Riesgo' | 'Accesibilidad' | 'Estado';
  /** Needs device data (staff only; citizens cannot read devices). */
  staffOnly: boolean;
  defaultOn: boolean;
  /** Swatch shown next to the checkbox. */
  swatch: string;
}

export const LAYER_META: Record<LayerKey, LayerMeta> = {
  cameras: {
    key: 'cameras',
    label: 'Cámaras',
    group: 'Infraestructura',
    staffOnly: true,
    defaultOn: true,
    swatch: COLORS.ok,
  },
  traffic_lights: {
    key: 'traffic_lights',
    label: 'Semáforos',
    group: 'Infraestructura',
    staffOnly: true,
    defaultOn: true,
    swatch: COLORS.ok,
  },
  drains: {
    key: 'drains',
    label: 'Coladeras inteligentes',
    group: 'Infraestructura',
    staffOnly: true,
    defaultOn: true,
    swatch: COLORS.accent,
  },
  incidents: {
    key: 'incidents',
    label: 'Incidencias',
    group: 'Riesgo',
    staffOnly: false,
    defaultOn: true,
    swatch: COLORS.critical,
  },
  flood_zones: {
    key: 'flood_zones',
    label: 'Zonas con riesgo de inundación',
    group: 'Riesgo',
    staffOnly: false,
    defaultOn: true,
    swatch: COLORS.warn,
  },
  ramps: {
    key: 'ramps',
    label: 'Rampas',
    group: 'Accesibilidad',
    staffOnly: false,
    defaultOn: false,
    swatch: COLORS.ok,
  },
  sidewalks: {
    key: 'sidewalks',
    label: 'Banquetas',
    group: 'Accesibilidad',
    staffOnly: false,
    defaultOn: false,
    swatch: COLORS.ok,
  },
  crosswalks: {
    key: 'crosswalks',
    label: 'Cruces accesibles',
    group: 'Accesibilidad',
    staffOnly: false,
    defaultOn: false,
    swatch: COLORS.ok,
  },
  routes: {
    key: 'routes',
    label: 'Rutas accesibles',
    group: 'Accesibilidad',
    staffOnly: false,
    defaultOn: true,
    swatch: COLORS.accent,
  },
  obstacles: {
    key: 'obstacles',
    label: 'Obstáculos temporales',
    group: 'Accesibilidad',
    staffOnly: false,
    defaultOn: true,
    swatch: COLORS.critical,
  },
  sensor_state: {
    key: 'sensor_state',
    label: 'Estado de sensores',
    group: 'Estado',
    staffOnly: true,
    defaultOn: false,
    swatch: COLORS.warn,
  },
  device_state: {
    key: 'device_state',
    label: 'Estado de dispositivos',
    group: 'Estado',
    staffOnly: true,
    defaultOn: false,
    swatch: COLORS.danger,
  },
};

// ── Color expressions (status colors always come with a label in popups/legend) ──

export const DEVICE_STATUS_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'status'],
  'online',
  COLORS.ok,
  'degraded',
  COLORS.warn,
  'offline',
  COLORS.danger,
  'maintenance',
  COLORS.maintenance,
  COLORS.muted,
];

export const DRAIN_STATUS_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'drain_status'],
  'normal',
  COLORS.accent,
  'caution',
  COLORS.warn,
  'alert',
  COLORS.danger,
  'critical',
  COLORS.critical,
  COLORS.muted,
];

export const ACCESS_STATUS_COLOR: ExpressionSpecification = [
  'match',
  ['get', 'status'],
  'available',
  COLORS.ok,
  'blocked',
  COLORS.critical,
  'damaged',
  COLORS.warn,
  COLORS.muted,
];

const OFFLINE_DIM: ExpressionSpecification = [
  'case',
  ['==', ['get', 'status'], 'offline'],
  0.45,
  1,
];

function markerLayers(
  id: string,
  source: string,
  filter: ExpressionSpecification,
  color: ExpressionSpecification,
  icon: string,
  opts: { radius?: number; dim?: boolean } = {},
): LayerSpecification[] {
  const radius = opts.radius ?? 9;
  return [
    {
      id: `${id}-circle`,
      type: 'circle',
      source,
      filter,
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, radius * 0.6, 15, radius],
        'circle-color': color,
        'circle-opacity': opts.dim ? OFFLINE_DIM : 1,
        'circle-stroke-color': COLORS.base,
        'circle-stroke-width': 2,
      },
    },
    {
      id: `${id}-icon`,
      type: 'symbol',
      source,
      filter,
      minzoom: 12.5,
      layout: {
        'icon-image': icon,
        'icon-size': ['interpolate', ['linear'], ['zoom'], 12.5, 0.45, 15, 0.62],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
      },
    },
  ];
}

const isType = (t: string): ExpressionSpecification => ['==', ['get', 'type'], t];
const isAnyType = (...t: string[]): ExpressionSpecification => [
  'in',
  ['get', 'type'],
  ['literal', t],
];

/** Map layers per toggle, ordered bottom → top within this list. */
export const MAP_LAYERS: Record<LayerKey, LayerSpecification[]> = {
  flood_zones: [
    {
      id: 'flood-fill',
      type: 'fill',
      source: 'flood',
      paint: {
        'fill-color': ['match', ['get', 'risk_level'], 'high', COLORS.danger, COLORS.warn],
        'fill-opacity': 0.16,
      },
    },
    {
      id: 'flood-line',
      type: 'line',
      source: 'flood',
      paint: {
        'line-color': ['match', ['get', 'risk_level'], 'high', COLORS.danger, COLORS.warn],
        'line-width': 1.2,
        'line-dasharray': [3, 2],
      },
    },
  ],
  sensor_state: [
    {
      id: 'sensor-halo',
      type: 'circle',
      source: 'devices',
      filter: isType('drain'),
      paint: {
        // Halo radius grows with obstruction (sensor reading), colored by drain state.
        'circle-radius': ['interpolate', ['linear'], ['get', 'level'], 0, 10, 100, 46],
        'circle-color': DRAIN_STATUS_COLOR,
        'circle-opacity': 0.18,
        'circle-stroke-color': DRAIN_STATUS_COLOR,
        'circle-stroke-width': 1,
        'circle-stroke-opacity': 0.6,
      },
    },
  ],
  routes: [
    {
      id: 'route-casing',
      type: 'line',
      source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': COLORS.base, 'line-width': 7 },
    },
    {
      id: 'route-line',
      type: 'line',
      source: 'routes',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: {
        'line-color': [
          'match',
          ['get', 'status'],
          'blocked',
          COLORS.critical,
          'alternative',
          COLORS.ok,
          COLORS.accent,
        ],
        'line-width': 3.5,
      },
    },
    ...markerLayers(
      'route-point',
      'access',
      isType('accessible_route'),
      ACCESS_STATUS_COLOR,
      'icon-route',
      { radius: 7 },
    ),
  ],
  ramps: markerLayers('ramp', 'access', isType('ramp'), ACCESS_STATUS_COLOR, 'icon-ramp', {
    radius: 7,
  }),
  sidewalks: markerLayers(
    'sidewalk',
    'access',
    isType('sidewalk'),
    ACCESS_STATUS_COLOR,
    'icon-sidewalk',
    { radius: 7 },
  ),
  crosswalks: markerLayers(
    'crosswalk',
    'access',
    isType('crosswalk'),
    ACCESS_STATUS_COLOR,
    'icon-crosswalk',
    { radius: 7 },
  ),
  obstacles: markerLayers(
    'obstacle',
    'access',
    isAnyType('obstacle', 'temporarily_disabled'),
    ACCESS_STATUS_COLOR,
    'icon-obstacle',
    { radius: 7 },
  ),
  device_state: [
    {
      id: 'device-ring',
      type: 'circle',
      source: 'devices',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 11, 9, 15, 15],
        'circle-color': 'rgba(0,0,0,0)',
        'circle-stroke-color': DEVICE_STATUS_COLOR,
        'circle-stroke-width': 2,
      },
    },
    ...markerLayers('gateway', 'devices', isType('gateway'), DEVICE_STATUS_COLOR, 'icon-gateway', {
      radius: 8,
    }),
    {
      id: 'device-label',
      type: 'symbol',
      source: 'devices',
      minzoom: 15,
      layout: {
        'text-field': ['concat', ['get', 'code'], '\n', ['get', 'status_label']],
        'text-font': ['Noto Sans Regular'],
        'text-size': 10,
        'text-offset': [0, 1.9],
        'text-anchor': 'top',
      },
      paint: { 'text-color': '#c9d1d9', 'text-halo-color': COLORS.base, 'text-halo-width': 1.4 },
    },
  ],
  traffic_lights: markerLayers(
    'tl',
    'devices',
    isType('traffic_light'),
    DEVICE_STATUS_COLOR,
    'icon-traffic-light',
    { dim: true },
  ),
  cameras: markerLayers('cam', 'devices', isType('camera'), DEVICE_STATUS_COLOR, 'icon-camera', {
    dim: true,
  }),
  drains: [
    ...markerLayers('drain', 'devices', isType('drain'), DRAIN_STATUS_COLOR, 'icon-drain', {
      dim: true,
    }),
    {
      id: 'drain-label',
      type: 'symbol',
      source: 'devices',
      filter: isType('drain'),
      minzoom: 13.5,
      layout: {
        'text-field': ['concat', ['to-string', ['get', 'level']], ' %'],
        'text-font': ['Noto Sans Regular'],
        'text-size': 11,
        'text-offset': [1.3, 0],
        'text-anchor': 'left',
        'text-allow-overlap': true,
      },
      paint: { 'text-color': '#e6edf3', 'text-halo-color': COLORS.base, 'text-halo-width': 1.6 },
    },
  ],
  incidents: [
    {
      id: 'incident-icon',
      type: 'symbol',
      source: 'incidents',
      layout: {
        'icon-image': ['concat', 'incident-', ['get', 'priority']],
        'icon-size': ['interpolate', ['linear'], ['zoom'], 11, 0.55, 15, 0.8],
        'icon-allow-overlap': true,
        'icon-ignore-placement': true,
        // Most severe on top.
        'symbol-sort-key': ['match', ['get', 'priority'], 'critical', 4, 'high', 3, 'medium', 2, 1],
        'icon-offset': [10, -10],
      },
    },
  ],
};

/** Render order (bottom → top) across toggles. */
export const RENDER_ORDER: readonly LayerKey[] = [
  'flood_zones',
  'sensor_state',
  'routes',
  'ramps',
  'sidewalks',
  'crosswalks',
  'obstacles',
  'device_state',
  'traffic_lights',
  'cameras',
  'drains',
  'incidents',
];

/** Layers that open a popup on click. */
export const INTERACTIVE_LAYERS = [
  'incident-icon',
  'cam-circle',
  'tl-circle',
  'drain-circle',
  'gateway-circle',
  'ramp-circle',
  'sidewalk-circle',
  'crosswalk-circle',
  'obstacle-circle',
  'route-point-circle',
  'route-line',
  'flood-fill',
];

/**
 * Route-planner overlay (accessibility view), drawn above everything else.
 * Feature property `role`: baseline | route | avoided | origin | destination.
 */
export const OVERLAY_LAYERS: LayerSpecification[] = [
  {
    id: 'overlay-baseline',
    type: 'line',
    source: 'overlay',
    filter: ['==', ['get', 'role'], 'baseline'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': COLORS.critical,
      'line-width': 3,
      'line-dasharray': [1.5, 1.5],
      'line-opacity': 0.9,
    },
  },
  {
    id: 'overlay-route-casing',
    type: 'line',
    source: 'overlay',
    filter: ['==', ['get', 'role'], 'route'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': COLORS.base, 'line-width': 9 },
  },
  {
    id: 'overlay-route',
    type: 'line',
    source: 'overlay',
    filter: ['==', ['get', 'role'], 'route'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': ['match', ['get', 'status'], 'alternative', COLORS.ok, COLORS.accent],
      'line-width': 5,
    },
  },
  {
    id: 'overlay-avoided',
    type: 'circle',
    source: 'overlay',
    filter: ['==', ['get', 'role'], 'avoided'],
    paint: {
      'circle-radius': ['interpolate', ['exponential', 2], ['zoom'], 14, 6, 18, 60],
      'circle-color': COLORS.critical,
      'circle-opacity': 0.15,
      'circle-stroke-color': COLORS.critical,
      'circle-stroke-width': 1.5,
    },
  },
  {
    id: 'overlay-endpoints',
    type: 'circle',
    source: 'overlay',
    filter: ['in', ['get', 'role'], ['literal', ['origin', 'destination']]],
    paint: {
      'circle-radius': 9,
      'circle-color': '#e6edf3',
      'circle-stroke-color': COLORS.base,
      'circle-stroke-width': 2,
    },
  },
  {
    id: 'overlay-endpoint-label',
    type: 'symbol',
    source: 'overlay',
    filter: ['in', ['get', 'role'], ['literal', ['origin', 'destination']]],
    layout: {
      'text-field': ['match', ['get', 'role'], 'origin', 'A', 'B'],
      'text-font': ['Noto Sans Regular'],
      'text-size': 12,
      'text-allow-overlap': true,
      'text-ignore-placement': true,
    },
    paint: { 'text-color': COLORS.base },
  },
];
