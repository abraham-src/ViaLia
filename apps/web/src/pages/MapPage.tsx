import type { AccessibleRouteDto, ListResponse } from '@simu/shared-types';
import { useQuery } from '@tanstack/react-query';
import type { FeatureCollection } from 'geojson';
import { useMemo } from 'react';
import { IncidentSidePanel } from '../features/map/IncidentSidePanel';
import { LayerPanel } from '../features/map/LayerPanel';
import { LAYER_KEYS, LAYER_META, type LayerKey } from '../features/map/layers';
import { MapView, type MapSources } from '../features/map/MapView';
import {
  devicesToGeoJSON,
  EMPTY_FC,
  incidentsToGeoJSON,
  pointsToGeoJSON,
  routesToGeoJSON,
} from '../features/map/sources';
import { useAccessibilityPoints, useDevices, useIncidents } from '../hooks/queries';
import { api } from '../lib/api';
import { ACTIVE_INCIDENT_STATUSES } from '../lib/labels';
import { isStaff, useAuth } from '../stores/auth';

const ACTIVE = ACTIVE_INCIDENT_STATUSES.join(',');

/** Spec §7.1 layout: layer sidebar · map · incident panel (live strip in the shell footer). */
export function MapPage() {
  const staff = isStaff(useAuth((s) => s.user));
  const devices = useDevices(staff);
  const incidents = useIncidents({ status: ACTIVE, sort: '-priority', page_size: 200 });
  const points = useAccessibilityPoints();
  const routes = useQuery({
    queryKey: ['routes'],
    queryFn: ({ signal }) =>
      api
        .get<ListResponse<AccessibleRouteDto>>('/accessibility/routes', signal)
        .then((r) => r.data),
    staleTime: 60_000,
  });
  const flood = useQuery({
    queryKey: ['gis', 'flood-risk-zones'],
    queryFn: ({ signal }) => api.get<FeatureCollection>('/gis/flood-risk-zones', signal),
    staleTime: Infinity,
  });

  const sources: MapSources = useMemo(
    () => ({
      devices: devices.data ? devicesToGeoJSON(devices.data) : EMPTY_FC,
      incidents: incidents.data ? incidentsToGeoJSON(incidents.data.data) : EMPTY_FC,
      access: points.data ? pointsToGeoJSON(points.data) : EMPTY_FC,
      routes: routes.data ? routesToGeoJSON(routes.data) : EMPTY_FC,
      flood: flood.data ?? EMPTY_FC,
    }),
    [devices.data, incidents.data, points.data, routes.data, flood.data],
  );

  const counts = useMemo<Partial<Record<LayerKey, number>>>(() => {
    const d = devices.data ?? [];
    const p = points.data ?? [];
    return {
      cameras: d.filter((x) => x.type === 'camera').length,
      traffic_lights: d.filter((x) => x.type === 'traffic_light').length,
      drains: d.filter((x) => x.type === 'drain').length,
      incidents: incidents.data?.data.length ?? 0,
      flood_zones: flood.data?.features.length ?? 0,
      ramps: p.filter((x) => x.type === 'ramp').length,
      sidewalks: p.filter((x) => x.type === 'sidewalk').length,
      crosswalks: p.filter((x) => x.type === 'crosswalk').length,
      routes: routes.data?.length ?? 0,
      obstacles: p.filter((x) => x.type === 'obstacle' || x.type === 'temporarily_disabled').length,
      sensor_state: d.filter((x) => x.type === 'drain').length,
      device_state: d.length,
    };
  }, [devices.data, points.data, incidents.data, routes.data, flood.data]);

  const hiddenKeys = useMemo(
    () => (staff ? [] : LAYER_KEYS.filter((k) => LAYER_META[k].staffOnly)),
    [staff],
  );

  return (
    // Explicit row track: without it the row is auto-sized and the map's h-full collapses.
    // Below 1280 px the incident panel is hidden so the map keeps a usable width.
    <div className="grid h-full min-h-0 grid-cols-[220px_minmax(0,1fr)] grid-rows-[minmax(0,1fr)] xl:grid-cols-[220px_minmax(0,1fr)_300px]">
      <LayerPanel counts={counts} staff={staff} />
      <MapView sources={sources} hiddenKeys={hiddenKeys} />
      <IncidentSidePanel incidents={incidents.data?.data ?? []} loading={incidents.isLoading} />
    </div>
  );
}
