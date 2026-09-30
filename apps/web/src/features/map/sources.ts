import type {
  AccessibilityPointDto,
  AccessibleRouteDto,
  DeviceDto,
  IncidentDto,
} from '@simu/shared-types';
import type { FeatureCollection, LineString, Point } from 'geojson';
import { DEVICE_STATUS_LABEL } from '../../lib/labels';

/** Empty collection used before data arrives. */
export const EMPTY_FC: FeatureCollection = { type: 'FeatureCollection', features: [] };

/** Flat, primitive properties only (MapLibre serializes nested objects to strings). */
export function devicesToGeoJSON(devices: readonly DeviceDto[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: devices.map((d) => ({
      type: 'Feature',
      id: d.id,
      geometry: { type: 'Point', coordinates: [d.longitude, d.latitude] },
      properties: {
        kind: 'device',
        code: d.device_code,
        type: d.type,
        name: d.name,
        status: d.status,
        status_label: DEVICE_STATUS_LABEL[d.status],
        last_heartbeat: d.last_heartbeat,
        zone: typeof d.metadata.zone_name === 'string' ? d.metadata.zone_name : null,
        model: d.camera?.model ?? null,
        location: d.camera?.location_description ?? null,
        level: d.drain?.obstruction_level ?? null,
        drain_status: d.drain?.status ?? null,
        last_reading_at: d.drain?.last_reading_at ?? null,
        lat: d.latitude,
        lng: d.longitude,
      },
    })),
  };
}

export function incidentsToGeoJSON(incidents: readonly IncidentDto[]): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: incidents.map((i) => ({
      type: 'Feature',
      id: i.id,
      geometry: { type: 'Point', coordinates: [i.longitude, i.latitude] },
      properties: {
        kind: 'incident',
        id: i.id,
        type: i.type,
        priority: i.priority,
        status: i.status,
        description: i.description,
        device_code: i.device_code,
        confidence: i.confidence,
        created_at: i.created_at,
        updated_at: i.updated_at,
        source: typeof i.metadata.source === 'string' ? i.metadata.source : null,
        rule: typeof i.metadata.label === 'string' ? i.metadata.label : null,
        assigned_to: i.assigned_to?.name ?? null,
        lat: i.latitude,
        lng: i.longitude,
      },
    })),
  };
}

export function pointsToGeoJSON(
  points: readonly AccessibilityPointDto[],
): FeatureCollection<Point> {
  return {
    type: 'FeatureCollection',
    features: points.map((p) => ({
      type: 'Feature',
      id: p.id,
      geometry: { type: 'Point', coordinates: [p.longitude, p.latitude] },
      properties: {
        kind: 'access',
        id: p.id,
        type: p.type,
        status: p.status,
        name: p.name,
        source: p.source,
        slope: p.ramp?.slope ?? null,
        width_m: p.ramp?.width_m ?? null,
        lat: p.latitude,
        lng: p.longitude,
      },
    })),
  };
}

export function routesToGeoJSON(
  routes: readonly AccessibleRouteDto[],
): FeatureCollection<LineString> {
  return {
    type: 'FeatureCollection',
    features: routes.map((r) => ({
      type: 'Feature',
      id: r.id,
      geometry: { type: 'LineString', coordinates: r.path.coordinates },
      properties: {
        kind: 'route',
        id: r.id,
        name: r.name,
        status: r.status,
        length_m: r.length_m,
        created_at: r.created_at,
      },
    })),
  };
}
