export interface LngLat {
  lng: number;
  lat: number;
}

/** [lng, lat] in EPSG:4326, GeoJSON order. */
export type LngLatTuple = [number, number];

/** [minLng, minLat, maxLng, maxLat] in EPSG:4326. */
export type BBox = readonly [number, number, number, number];

export interface GeoJsonPoint {
  type: 'Point';
  coordinates: LngLatTuple;
}

export interface GeoJsonLineString {
  type: 'LineString';
  coordinates: LngLatTuple[];
}

export interface GeoJsonFeature<
  G extends GeoJsonPoint | GeoJsonLineString = GeoJsonPoint,
  P = Record<string, unknown>,
> {
  type: 'Feature';
  id?: string;
  geometry: G;
  properties: P;
}

export interface GeoJsonFeatureCollection<
  G extends GeoJsonPoint | GeoJsonLineString = GeoJsonPoint,
  P = Record<string, unknown>,
> {
  type: 'FeatureCollection';
  features: Array<GeoJsonFeature<G, P>>;
}
