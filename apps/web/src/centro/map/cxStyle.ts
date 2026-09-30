import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from 'maplibre-gl';
import { OPENFREEMAP_SOURCE } from '../../features/map/style';
import { STREETS_URL } from '../lib/streets';

/**
 * Mapa base claro para el centro de control, con la misma estructura de capas que el
 * estilo oscuro de la consola (ya probado con OpenFreeMap) y la paleta del maquetado:
 * manzanas grises, calles blancas, parques verdes y agua azul.
 */
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const FONT = ['Noto Sans Regular'];

export const LIGHT = {
  bg: '#e9eef4',
  land: '#e6ebf2',
  park: '#cfe8d3',
  grass: '#d6ecd8',
  water: '#b9dcf5',
  casingMinor: '#d7dfe9',
  casingMajor: '#cdd6e2',
  road: '#ffffff',
  motorway: '#fff6de',
  motorwayCasing: '#ecd9a6',
  rail: '#c4ccd8',
  building: '#dde3ea',
  buildingLow: '#e4e8ee',
  buildingTop: '#cfd6e0',
  label: '#6f7c91',
  halo: '#ffffff',
};

const width = (stops: number[]): ExpressionSpecification =>
  ['interpolate', ['exponential', 1.5], ['zoom'], ...stops] as unknown as ExpressionSpecification;

export function buildCxStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'ViaLia claro',
    glyphs: GLYPHS,
    sky: {
      'sky-color': '#dfe8f3',
      'horizon-color': '#eef2f8',
      'fog-color': '#eef2f8',
      'sky-horizon-blend': 0.6,
      'horizon-fog-blend': 0.7,
      'fog-ground-blend': 0.85,
    },
    sources: {
      openmaptiles: {
        type: 'vector',
        url: OPENFREEMAP_SOURCE,
        attribution:
          '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': LIGHT.bg } },
      {
        id: 'landuse',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood']]],
        paint: { 'fill-color': LIGHT.land },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': LIGHT.park },
      },
      {
        id: 'landcover',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood']]],
        paint: { 'fill-color': LIGHT.grass, 'fill-opacity': 0.85 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': LIGHT.water },
      },
      {
        id: 'road-minor-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 13,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': LIGHT.casingMinor, 'line-width': width([13, 1.4, 18, 16]) },
      },
      {
        id: 'road-major-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: [
          'in',
          ['get', 'class'],
          ['literal', ['primary', 'secondary', 'tertiary', 'trunk']],
        ],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': LIGHT.casingMajor, 'line-width': width([10, 1.6, 18, 26]) },
      },
      {
        id: 'road-motorway-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'motorway'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': LIGHT.motorwayCasing, 'line-width': width([8, 1.8, 18, 30]) },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 13,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'track']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': LIGHT.road, 'line-width': width([13, 0.8, 18, 12]) },
      },
      {
        id: 'road-path',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 16,
        filter: ['in', ['get', 'class'], ['literal', ['path', 'pedestrian']]],
        paint: { 'line-color': '#d9e0ea', 'line-width': 1.2, 'line-dasharray': [2, 2] },
      },
      {
        id: 'road-major',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: [
          'in',
          ['get', 'class'],
          ['literal', ['primary', 'secondary', 'tertiary', 'trunk']],
        ],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': LIGHT.road, 'line-width': width([10, 1, 18, 21]) },
      },
      {
        id: 'road-motorway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'motorway'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: { 'line-color': LIGHT.motorway, 'line-width': width([8, 1.2, 18, 25]) },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['rail', 'transit']]],
        paint: { 'line-color': LIGHT.rail, 'line-width': 1.2, 'line-dasharray': [3, 3] },
      },
      {
        id: 'building-3d',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'render_height'], 6],
            0,
            LIGHT.buildingLow,
            50,
            LIGHT.buildingTop,
          ],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': ['interpolate', ['linear'], ['zoom'], 14, 0, 15, 0.92],
        },
      },
      {
        id: 'road-name',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'transportation_name',
        minzoom: 15,
        layout: {
          'symbol-placement': 'line',
          'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name']],
          'text-font': FONT,
          'text-size': 11.5,
        },
        paint: { 'text-color': LIGHT.label, 'text-halo-color': LIGHT.halo, 'text-halo-width': 1.6 },
      },
      {
        id: 'place-neighbourhood',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 12,
        maxzoom: 16,
        filter: ['in', ['get', 'class'], ['literal', ['neighbourhood', 'suburb', 'quarter']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name']],
          'text-font': FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 16, 13],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.12,
          'text-max-width': 8,
        },
        paint: { 'text-color': '#8a96aa', 'text-halo-color': LIGHT.halo, 'text-halo-width': 1.6 },
      },
    ],
  };
}

/**
 * Respaldo sin Internet: las calles OSM del repo dibujadas con el mismo lenguaje visual.
 * Se agregan solo si los mosaicos de OpenFreeMap no cargan (red del evento, sin conexión).
 */
export const FALLBACK_SOURCE = 'cx-streets';

export const FALLBACK_LAYERS: LayerSpecification[] = [
  {
    id: 'fb-foot',
    type: 'line',
    source: FALLBACK_SOURCE,
    minzoom: 16,
    filter: ['==', ['get', 'c'], 'foot'],
    paint: { 'line-color': '#d3dbe6', 'line-width': 1, 'line-dasharray': [2, 2] },
  },
  {
    id: 'fb-minor-casing',
    type: 'line',
    source: FALLBACK_SOURCE,
    filter: ['==', ['get', 'c'], 'minor'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': LIGHT.casingMinor,
      'line-width': width([12, 1.6, 14, 3.6, 16, 8.5, 18, 22]),
    },
  },
  {
    id: 'fb-major-casing',
    type: 'line',
    source: FALLBACK_SOURCE,
    filter: ['==', ['get', 'c'], 'major'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: {
      'line-color': LIGHT.casingMajor,
      'line-width': width([11, 2.4, 14, 5.6, 16, 13, 18, 34]),
    },
  },
  {
    id: 'fb-minor',
    type: 'line',
    source: FALLBACK_SOURCE,
    filter: ['==', ['get', 'c'], 'minor'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': LIGHT.road, 'line-width': width([12, 1, 14, 2.4, 16, 6.5, 18, 18]) },
  },
  {
    id: 'fb-major',
    type: 'line',
    source: FALLBACK_SOURCE,
    filter: ['==', ['get', 'c'], 'major'],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': LIGHT.road, 'line-width': width([11, 1.5, 14, 4, 16, 10.5, 18, 28]) },
  },
];

export const FALLBACK_DATA_URL = STREETS_URL;
