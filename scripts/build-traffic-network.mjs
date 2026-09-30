#!/usr/bin/env node
/**
 * Genera apps/simulator/src/traffic-network.ts: los tramos viales que el simulador usa para
 * el tráfico en tiempo real. Parte de las calles OSM que ya trae el repo
 * (apps/web/public/cx/streets.geojson), une los pedazos de cada avenida en líneas continuas
 * y las corta en tramos de ~220 m. Cada tramo queda asignado a una zona del seed.
 *
 *   node scripts/build-traffic-network.mjs
 *
 * Datos © colaboradores de OpenStreetMap (ODbL).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const streets = JSON.parse(readFileSync(join(root, 'apps/web/public/cx/streets.geojson'), 'utf8'));
const zonesGeo = JSON.parse(readFileSync(join(root, 'database/gis/zones.geojson'), 'utf8'));

const TARGET_M = 220;
const MIN_M = 50;

const KX = Math.cos((19.4 * Math.PI) / 180) * 111_320;
const KY = 110_540;
const dist = (a, b) => Math.hypot((a[0] - b[0]) * KX, (a[1] - b[1]) * KY);
const key = (c) => `${c[0].toFixed(5)},${c[1].toFixed(5)}`;
const round = (c) => [Number(c[0].toFixed(5)), Number(c[1].toFixed(5))];

// ── 1. Pedazos por nombre ──
const byName = new Map();
for (const f of streets.features) {
  const { c, n } = f.properties;
  if (c !== 'major' || !n) continue;
  if (/^Plaza|^Calle Plaza|^Parque/i.test(n)) continue;
  const list = byName.get(n) ?? [];
  list.push(f.geometry.coordinates.map(round));
  byName.set(n, list);
}

// ── 2. Unir pedazos que comparten extremo en líneas continuas ──
function chain(pieces) {
  const used = new Array(pieces.length).fill(false);
  const ends = new Map();
  pieces.forEach((p, i) => {
    for (const c of [p[0], p[p.length - 1]]) {
      const k = key(c);
      const l = ends.get(k) ?? [];
      l.push(i);
      ends.set(k, l);
    }
  });
  const take = (k) => {
    for (const i of ends.get(k) ?? []) if (!used[i]) return i;
    return -1;
  };
  const lines = [];
  for (let s = 0; s < pieces.length; s++) {
    if (used[s]) continue;
    used[s] = true;
    let line = [...pieces[s]];
    for (;;) {
      const i = take(key(line[line.length - 1]));
      if (i < 0) break;
      used[i] = true;
      const p = pieces[i];
      const fwd = key(p[0]) === key(line[line.length - 1]);
      line = line.concat((fwd ? p : [...p].reverse()).slice(1));
    }
    for (;;) {
      const i = take(key(line[0]));
      if (i < 0) break;
      used[i] = true;
      const p = pieces[i];
      const fwd = key(p[p.length - 1]) === key(line[0]);
      line = (fwd ? p : [...p].reverse()).slice(0, -1).concat(line);
    }
    lines.push(line);
  }
  return lines;
}

// ── 3. Cortar en tramos de ~TARGET_M ──
function cut(line) {
  const total = line.slice(1).reduce((acc, c, i) => acc + dist(line[i], c), 0);
  if (total < MIN_M) return [];
  const n = Math.max(1, Math.round(total / TARGET_M));
  const step = total / n;
  const out = [];
  let cur = [line[0]];
  let acc = 0;
  for (let i = 1; i < line.length; i++) {
    let a = line[i - 1];
    const b = line[i];
    let d = dist(a, b);
    while (acc + d >= step && out.length < n - 1) {
      const t = (step - acc) / d;
      const m = round([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]);
      cur.push(m);
      out.push(cur);
      cur = [m];
      a = m;
      d = dist(a, b);
      acc = 0;
    }
    acc += d;
    cur.push(b);
  }
  out.push(cur);
  return out.filter((s) => s.length >= 2);
}

const zones = zonesGeo.features.map((f) => {
  const ring = f.geometry.coordinates[0];
  const xs = ring.map((c) => c[0]);
  const ys = ring.map((c) => c[1]);
  return {
    code: f.properties.code,
    name: f.properties.name,
    box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
  };
});
const zoneOf = (p) =>
  zones.find((z) => p[0] >= z.box[0] && p[0] <= z.box[2] && p[1] >= z.box[1] && p[1] <= z.box[3])
    ?.code ?? 'COR';

const freeKmh = (name) =>
  /^Glorieta/i.test(name) ? 25 : /^(Avenida|Calzada|Eje|Viaducto|Paseo)/i.test(name) ? 50 : 35;

const segments = [];
for (const [name, pieces] of [...byName.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
  for (const line of chain(pieces)) {
    for (const seg of cut(line)) {
      const mid = seg[Math.floor(seg.length / 2)];
      const len = seg.slice(1).reduce((acc, c, i) => acc + dist(seg[i], c), 0);
      if (len < 25) continue;
      segments.push({
        id: `S${String(segments.length + 1).padStart(4, '0')}`,
        street: name,
        zone: zoneOf(mid),
        free_kmh: freeKmh(name),
        length_m: Math.round(len),
        coords: seg,
      });
    }
  }
}

const zoneList = [
  ...zones.map((z) => ({ code: z.code, name: z.name })),
  { code: 'COR', name: 'Corredores principales' },
];
const counts = Object.fromEntries(
  zoneList.map((z) => [z.code, segments.filter((s) => s.zone === z.code).length]),
);

const out = `// ARCHIVO GENERADO por scripts/build-traffic-network.mjs. No lo edites a mano.
// Tramos viales de la Ciudad de México a partir de OpenStreetMap (© colaboradores de OSM, ODbL).

export interface TrafficZoneDef {
  code: string;
  name: string;
}

export interface TrafficSegmentDef {
  id: string;
  street: string;
  zone: string;
  free_kmh: number;
  length_m: number;
  coords: Array<[number, number]>;
}

export const TRAFFIC_ZONES: readonly TrafficZoneDef[] = ${JSON.stringify(zoneList)};

export const TRAFFIC_SEGMENTS: readonly TrafficSegmentDef[] = [
${segments.map((s) => `  ${JSON.stringify(s)},`).join('\n')}
];
`;
writeFileSync(join(root, 'apps/simulator/src/traffic-network.ts'), out);
console.log(`tramos=${segments.length}`, counts, `bytes=${out.length}`);
