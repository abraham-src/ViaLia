import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FastifyPluginAsync } from 'fastify';
import { notFound } from '../lib/errors.js';
import type { AuthGuards } from '../plugins/auth.js';

/** Static GIS layers shipped in database/gis (mock CDMX data), served to the map. */
const LAYERS = {
  'flood-risk-zones': 'flood-risk-zones.geojson',
  zones: 'zones.geojson',
} as const;
type LayerName = keyof typeof LAYERS;

/** Loads every layer once at startup; a missing or invalid file fails fast. */
export function loadGisLayers(dir: string): Record<LayerName, unknown> {
  const out = {} as Record<LayerName, unknown>;
  for (const [name, file] of Object.entries(LAYERS) as Array<[LayerName, string]>) {
    const parsed = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as { type?: string };
    if (parsed.type !== 'FeatureCollection') throw new Error(`${file} no es un FeatureCollection`);
    out[name] = parsed;
  }
  return out;
}

export function gisRoutes(gisDir: string, guards: AuthGuards): FastifyPluginAsync {
  const layers = loadGisLayers(gisDir);
  return async (app) => {
    app.get<{ Params: { layer: string } }>(
      '/gis/:layer',
      { preHandler: guards.requireUser() },
      async (req, reply) => {
        const layer = layers[req.params.layer as LayerName];
        if (!layer) throw notFound(`Capa ${req.params.layer}`);
        return reply.header('cache-control', 'private, max-age=300').send(layer);
      },
    );
  };
}
