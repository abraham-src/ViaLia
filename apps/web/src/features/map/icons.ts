import type { Map as MapLibreMap } from 'maplibre-gl';

/**
 * Custom SVG markers (spec §7.2: no default pins). Device glyphs are thin white strokes
 * drawn on top of a status-colored circle layer; incidents use a filled diamond per
 * priority so they never look like a device.
 */

export const COLORS = {
  ok: '#2ea043',
  warn: '#d29922',
  danger: '#da3633',
  critical: '#f85149',
  accent: '#3d7fcf',
  muted: '#8b949e',
  maintenance: '#6e7681',
  base: '#0f1419',
} as const;

const stroke = (paths: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#e6edf3" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;

/** 24×24 glyphs (Lucide-style geometry). */
const GLYPHS: Record<string, string> = {
  'icon-camera': stroke(
    '<path d="M14.5 5h-5L7.5 7.5H4.5A1.5 1.5 0 0 0 3 9v8.5A1.5 1.5 0 0 0 4.5 19h15a1.5 1.5 0 0 0 1.5-1.5V9a1.5 1.5 0 0 0-1.5-1.5h-3z"/><circle cx="12" cy="13" r="3"/>',
  ),
  'icon-drain': stroke(
    '<rect x="4" y="4" width="16" height="16" rx="1.5"/><path d="M8 4v16M12 4v16M16 4v16"/>',
  ),
  'icon-traffic-light': stroke(
    '<rect x="8" y="2.5" width="8" height="19" rx="2"/><circle cx="12" cy="7" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="12" cy="17" r="1.3"/>',
  ),
  'icon-gateway': stroke(
    '<rect x="3" y="13" width="18" height="7" rx="1.5"/><path d="M7 16.5h.01M11 16.5h.01"/><path d="M8.5 9.5a5 5 0 0 1 7 0M6 7a8.5 8.5 0 0 1 12 0"/>',
  ),
  'icon-ramp': stroke('<path d="M3 19h18L6 9v10"/><path d="M6 9v10"/>'),
  'icon-sidewalk': stroke('<path d="M4 19h16M6 14h12M8 9h8M10 4h4"/>'),
  'icon-crosswalk': stroke('<path d="M5 4v16M9.5 4v16M14.5 4v16M19 4v16"/>'),
  'icon-route': stroke(
    '<circle cx="6" cy="18" r="2"/><circle cx="18" cy="6" r="2"/><path d="M8 18h5a3 3 0 0 0 0-6h-2a3 3 0 0 1 0-6h5"/>',
  ),
  'icon-obstacle': stroke('<path d="M12 3 4 20h16z"/><path d="M8.5 13h7M7 16.5h10"/>'),
};

/** Diamond incident marker, filled by priority, with an exclamation glyph. */
const diamond = (fill: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 28 28"><path d="M14 2.5 25.5 14 14 25.5 2.5 14z" fill="${fill}" stroke="${COLORS.base}" stroke-width="2" stroke-linejoin="round"/><path d="M14 9v6" stroke="#fff" stroke-width="2.2" stroke-linecap="round"/><circle cx="14" cy="18.6" r="1.3" fill="#fff"/></svg>`;

const INCIDENT_ICONS: Record<string, string> = {
  'incident-low': diamond(COLORS.muted),
  'incident-medium': diamond(COLORS.accent),
  'incident-high': diamond(COLORS.warn),
  'incident-critical': diamond(COLORS.critical),
};

async function loadSvg(svg: string, size: number): Promise<HTMLImageElement> {
  const img = new Image(size, size);
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  return img;
}

/** Registers every marker image once per map instance (rendered at 2× for sharpness). */
export async function registerIcons(map: MapLibreMap): Promise<void> {
  const entries = [
    ...Object.entries(GLYPHS).map(([name, svg]) => [name, svg, 48] as const),
    ...Object.entries(INCIDENT_ICONS).map(([name, svg]) => [name, svg, 56] as const),
  ];
  await Promise.all(
    entries.map(async ([name, svg, size]) => {
      if (map.hasImage(name)) return;
      map.addImage(
        name,
        await loadSvg(
          svg
            .replace('width="24" height="24"', `width="${size}" height="${size}"`)
            .replace('width="28" height="28"', `width="${size}" height="${size}"`),
          size,
        ),
        {
          pixelRatio: 2,
        },
      );
    }),
  );
}
