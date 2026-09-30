import type { StyleSpecification } from 'maplibre-gl';

/**
 * Dark control-room basemap over OpenFreeMap vector tiles (OpenMapTiles schema, free,
 * no API key). Written by hand instead of reusing a public style so the palette matches
 * the UI tokens and the city recedes behind the operational layers.
 */
export const OPENFREEMAP_SOURCE = 'https://tiles.openfreemap.org/planet';
const GLYPHS = 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf';
const FONT = ['Noto Sans Regular'];

export const BASE = {
  bg: '#0b0f14',
  land: '#10151b',
  water: '#0c1a26',
  park: '#111c17',
  roadMinor: '#1d242c',
  roadMajor: '#2a323b',
  roadMotorway: '#384350',
  rail: '#2a3139',
  building: '#1a2129',
  buildingTop: '#262f39',
  label: '#8b949e',
  labelHalo: '#0b0f14',
};

export function buildBaseStyle(): StyleSpecification {
  return {
    version: 8,
    name: 'ViaLia oscuro',
    glyphs: GLYPHS,
    sources: {
      openmaptiles: {
        type: 'vector',
        url: OPENFREEMAP_SOURCE,
        attribution:
          '<a href="https://openfreemap.org" target="_blank">OpenFreeMap</a> · <a href="https://www.openmaptiles.org/" target="_blank">© OpenMapTiles</a> · <a href="https://www.openstreetmap.org/copyright" target="_blank">© OpenStreetMap</a>',
      },
    },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': BASE.bg } },
      {
        id: 'landuse-residential',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        filter: ['in', ['get', 'class'], ['literal', ['residential', 'suburb', 'neighbourhood']]],
        paint: { 'fill-color': BASE.land },
      },
      {
        id: 'park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: { 'fill-color': BASE.park },
      },
      {
        id: 'landcover-grass',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        filter: ['in', ['get', 'class'], ['literal', ['grass', 'wood']]],
        paint: { 'fill-color': BASE.park, 'fill-opacity': 0.7 },
      },
      {
        id: 'water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: { 'fill-color': BASE.water },
      },
      {
        id: 'road-minor',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 12,
        filter: ['in', ['get', 'class'], ['literal', ['minor', 'service', 'track']]],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': BASE.roadMinor,
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 12, 0.5, 18, 10],
        },
      },
      {
        id: 'road-path',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        minzoom: 15,
        filter: ['in', ['get', 'class'], ['literal', ['path', 'pedestrian']]],
        paint: {
          'line-color': BASE.roadMajor,
          'line-width': 1,
          'line-dasharray': [2, 2],
        },
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
        paint: {
          'line-color': BASE.roadMajor,
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 10, 0.8, 18, 18],
        },
      },
      {
        id: 'road-motorway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['==', ['get', 'class'], 'motorway'],
        layout: { 'line-cap': 'round', 'line-join': 'round' },
        paint: {
          'line-color': BASE.roadMotorway,
          'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 8, 1, 18, 22],
        },
      },
      {
        id: 'rail',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        filter: ['in', ['get', 'class'], ['literal', ['rail', 'transit']]],
        paint: { 'line-color': BASE.rail, 'line-width': 1, 'line-dasharray': [3, 3] },
      },
      {
        id: 'building-flat',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 13,
        maxzoom: 15,
        paint: {
          'fill-color': BASE.building,
          'fill-opacity': ['interpolate', ['linear'], ['zoom'], 13, 0, 14, 1],
        },
      },
      {
        id: 'building-3d',
        type: 'fill-extrusion',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 14,
        paint: {
          // Taller buildings a step lighter so the skyline reads without competing with data.
          'fill-extrusion-color': [
            'interpolate',
            ['linear'],
            ['coalesce', ['get', 'render_height'], 6],
            0,
            BASE.building,
            60,
            BASE.buildingTop,
          ],
          'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 6],
          'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
          'fill-extrusion-opacity': 0.85,
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
          'text-size': 11,
        },
        paint: {
          'text-color': '#6e7681',
          'text-halo-color': BASE.labelHalo,
          'text-halo-width': 1.2,
        },
      },
      {
        id: 'place-neighbourhood',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        minzoom: 12,
        filter: ['in', ['get', 'class'], ['literal', ['neighbourhood', 'suburb', 'quarter']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name']],
          'text-font': FONT,
          'text-size': ['interpolate', ['linear'], ['zoom'], 12, 11, 16, 13],
          'text-transform': 'uppercase',
          'text-letter-spacing': 0.08,
          'text-max-width': 8,
        },
        paint: {
          'text-color': BASE.label,
          'text-halo-color': BASE.labelHalo,
          'text-halo-width': 1.5,
        },
      },
      {
        id: 'place-city',
        type: 'symbol',
        source: 'openmaptiles',
        'source-layer': 'place',
        maxzoom: 12,
        filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
        layout: {
          'text-field': ['coalesce', ['get', 'name:es'], ['get', 'name']],
          'text-font': FONT,
          'text-size': 13,
        },
        paint: {
          'text-color': BASE.label,
          'text-halo-color': BASE.labelHalo,
          'text-halo-width': 1.5,
        },
      },
    ],
  };
}
