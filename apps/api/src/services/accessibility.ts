import { Prisma } from '@prisma/client';
import type {
  AccessibilityPointDto,
  AccessibilityPointType,
  AccessibilityStatus,
  AccessibleRouteDto,
  BBox,
  GeoJsonLineString,
  LngLatTuple,
  RouteStatus,
} from '@simu/shared-types';
import { asObject, pointInclude, toAccessibilityPointDto } from '../lib/serialize.js';
import type { ServiceContext } from './context.js';

export async function listPoints(
  ctx: ServiceContext,
  filter: { types?: AccessibilityPointType[]; statuses?: AccessibilityStatus[]; bbox?: BBox },
): Promise<AccessibilityPointDto[]> {
  const rows = await ctx.prisma.accessibilityPoint.findMany({
    where: {
      ...(filter.types && { type: { in: filter.types } }),
      ...(filter.statuses && { status: { in: filter.statuses } }),
      ...(filter.bbox && {
        longitude: { gte: filter.bbox[0], lte: filter.bbox[2] },
        latitude: { gte: filter.bbox[1], lte: filter.bbox[3] },
      }),
    },
    include: pointInclude,
    orderBy: [{ type: 'asc' }, { id: 'asc' }],
  });
  return rows.map(toAccessibilityPointDto);
}

interface RouteRow {
  id: string;
  status: RouteStatus;
  metadata: Prisma.JsonValue;
  created_at: Date;
  origin: string;
  destination: string;
  path: string;
  length_m: number;
}

function pointCoords(geojson: string): LngLatTuple {
  const parsed = JSON.parse(geojson) as { coordinates: LngLatTuple };
  return parsed.coordinates;
}

/**
 * Stored routes (PostGIS geometries). With origin/destination, returns routes whose
 * endpoints lie within `radiusM` meters of them (geography distance, not degrees).
 * Route computation around incidents arrives in Phase 8.
 */
export async function listRoutes(
  ctx: ServiceContext,
  query: {
    origin?: LngLatTuple;
    destination?: LngLatTuple;
    radiusM: number;
    accessibleOnly: boolean;
  },
): Promise<AccessibleRouteDto[]> {
  const conditions: Prisma.Sql[] = [];
  if (query.accessibleOnly) conditions.push(Prisma.sql`status IN ('active', 'alternative')`);
  if (query.origin) {
    conditions.push(Prisma.sql`ST_DWithin(origin::geography,
      ST_SetSRID(ST_MakePoint(${query.origin[0]}, ${query.origin[1]}), 4326)::geography, ${query.radiusM})`);
  }
  if (query.destination) {
    conditions.push(Prisma.sql`ST_DWithin(destination::geography,
      ST_SetSRID(ST_MakePoint(${query.destination[0]}, ${query.destination[1]}), 4326)::geography, ${query.radiusM})`);
  }
  const where =
    conditions.length > 0 ? Prisma.sql`WHERE ${Prisma.join(conditions, ' AND ')}` : Prisma.empty;

  const rows = await ctx.prisma.$queryRaw<RouteRow[]>`
    SELECT id, status, metadata, created_at,
           ST_AsGeoJSON(origin) AS origin,
           ST_AsGeoJSON(destination) AS destination,
           ST_AsGeoJSON(path) AS path,
           ST_Length(path::geography)::float8 AS length_m
    FROM accessible_routes
    ${where}
    ORDER BY created_at ASC, id ASC`;

  return rows.map((r) => {
    const metadata = asObject(r.metadata);
    return {
      id: r.id,
      status: r.status,
      name: typeof metadata.name === 'string' ? metadata.name : null,
      origin: pointCoords(r.origin),
      destination: pointCoords(r.destination),
      path: JSON.parse(r.path) as GeoJsonLineString,
      length_m: Math.round(r.length_m),
      created_at: r.created_at.toISOString(),
      metadata,
    };
  });
}
