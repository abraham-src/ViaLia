// One-off generator for database/gis/pedestrian-network.geojson.
//
// Downloads the walkable street network of the four demo zones from OpenStreetMap
// (Overpass API) and splits every way at intersections, producing graph edges with
// stable node ids. The output is committed, so the app never calls Overpass at runtime.
//
//   node scripts/build-pedestrian-network.mjs
//
// Data © OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright).
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'database/gis/pedestrian-network.geojson');
const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** [south, west, north, east] — Roma Norte + Condesa, Centro Histórico, Coyoacán. */
const BBOXES = [
  [19.408, -99.172, 19.424, -99.153],
  [19.428, -99.1445, 19.4375, -99.1295],
  [19.3465, -99.1685, 19.3535, -99.159],
];

const WALKABLE =
  '^(trunk|primary|secondary|tertiary|primary_link|secondary_link|tertiary_link|residential|unclassified|living_street|pedestrian|footway|path|steps|service)$';

const query = `[out:json][timeout:90];
(
${BBOXES.map((b) => `  way["highway"~"${WALKABLE}"]["access"!~"^(private|no)$"](${b.join(',')});`).join('\n')}
);
(._;>;);
out body;`;

const res = await fetch(OVERPASS, {
  method: 'POST',
  headers: {
    'content-type': 'application/x-www-form-urlencoded',
    'user-agent': 'SIMU-CDMX/0.8 (hackathon demo)',
  },
  body: `data=${encodeURIComponent(query)}`,
});
if (!res.ok) throw new Error(`Overpass ${res.status}: ${await res.text()}`);
const osm = await res.json();

const nodes = new Map();
const ways = [];
for (const el of osm.elements) {
  if (el.type === 'node') nodes.set(el.id, [el.lon, el.lat]);
  else if (el.type === 'way') ways.push(el);
}

// A node is a graph vertex if it ends a way or is shared by more than one way.
const uses = new Map();
for (const w of ways) for (const n of w.nodes) uses.set(n, (uses.get(n) ?? 0) + 1);

const round = (v) => Math.round(v * 1e6) / 1e6;
const features = [];
for (const w of ways) {
  let segment = [w.nodes[0]];
  for (let i = 1; i < w.nodes.length; i++) {
    const n = w.nodes[i];
    segment.push(n);
    const isVertex = i === w.nodes.length - 1 || (uses.get(n) ?? 0) > 1;
    if (!isVertex) continue;
    const coords = segment.map((id) => nodes.get(id)).filter(Boolean);
    if (coords.length >= 2) {
      features.push({
        type: 'Feature',
        properties: {
          id: `${w.id}-${features.length}`,
          from: String(segment[0]),
          to: String(n),
          highway: w.tags.highway,
          name: w.tags.name ?? null,
          footway: w.tags.footway ?? null,
          oneway: false, // pedestrians walk both ways
          steps: w.tags.highway === 'steps',
        },
        geometry: { type: 'LineString', coordinates: coords.map(([x, y]) => [round(x), round(y)]) },
      });
    }
    segment = [n];
  }
}

writeFileSync(
  OUT,
  JSON.stringify({
    type: 'FeatureCollection',
    name: 'simu_pedestrian_network',
    attribution: '© OpenStreetMap contributors (ODbL 1.0), vía Overpass API',
    generated_at: new Date().toISOString(),
    bboxes: BBOXES,
    features,
  }),
);
console.info(
  `ways=${ways.length} nodes=${nodes.size} edges=${features.length} → ${path.relative(ROOT, OUT)}`,
);
