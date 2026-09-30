import type { IncidentDto } from '@simu/shared-types';
import { useMemo } from 'react';
import { useIncident } from '../../hooks/mutations';
import { distanceM } from '../lib/geo';
import { nearestStreetNames, streetAddress, useStreets } from '../lib/streets';
import { lngLatOf, nearest, useCxData } from './useCxData';

/**
 * Todo lo que las vistas de zoom y detalle necesitan saber de una incidencia: dónde está
 * (calles OSM del repo), en qué zona, y qué cámara, coladera y semáforo tiene cerca.
 * Sin `id` toma la incidencia activa más grave.
 */
export function useIncidentContext(id: string | undefined) {
  const data = useCxData();
  const one = useIncident(id ?? null);
  const streets = useStreets();

  const incident: IncidentDto | null =
    (id ? (data.incidents.find((i) => i.id === id) ?? one.data) : data.incidents[0]) ?? null;

  return useMemo(() => {
    const index = incident ? data.incidents.findIndex((i) => i.id === incident.id) : -1;
    const base = {
      data,
      incident,
      loading: (!!id && one.isLoading) || data.loading,
      notFound: !!id && !one.isLoading && !incident,
      index,
      total: data.incidents.length,
    };
    if (!incident) return { ...base, ctx: null };
    const point = lngLatOf(incident);
    const zone = data.zoneOfItem(incident);
    const device = incident.device_code ? (data.byCode.get(incident.device_code) ?? null) : null;
    const names = nearestStreetNames(streets.data, point);
    const address =
      streetAddress(names) ??
      device?.camera?.location_description ??
      device?.name.replace(/^(Cámara|Coladera|Semáforo)\s+/, '') ??
      null;
    const others = data.incidents
      .filter((i) => i.id !== incident.id)
      .map((i) => ({ incident: i, distance: distanceM(point, lngLatOf(i)) }))
      .sort((a, b) => a.distance - b.distance);
    return {
      ...base,
      ctx: {
        point,
        zone,
        device,
        names,
        address,
        camera: nearest(point, data.cameras),
        drain: nearest(point, data.drains),
        light: nearest(point, data.lights),
        others,
      },
    };
  }, [data, incident, id, one.isLoading, streets.data]);
}
