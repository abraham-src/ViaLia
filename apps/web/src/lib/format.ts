const TZ = 'America/Mexico_City';

const timeFmt = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ,
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

const dateTimeFmt = new Intl.DateTimeFormat('es-MX', {
  timeZone: TZ,
  day: '2-digit',
  month: 'short',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

/** HH:mm:ss in CDMX time. */
export function formatTime(iso: string | number | Date | null | undefined): string {
  if (iso === null || iso === undefined) return '—';
  return timeFmt.format(new Date(iso));
}

/** "29 sept 15:30" in CDMX time. */
export function formatDateTime(iso: string | null | undefined): string {
  return iso ? dateTimeFmt.format(new Date(iso)) : '—';
}

/** Compact relative age: "ahora", "hace 45 s", "hace 12 min", "hace 3 h", "hace 2 d". */
export function formatAge(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '—';
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 5) return 'ahora';
  if (s < 60) return `hace ${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 48) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

/** "19.41870, -99.15970" with 5 decimals (~1 m). */
export function formatCoords(lat: number, lng: number): string {
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

/** Buckets ISO timestamps into `hours` hourly counts ending at `now` (oldest first). */
export function hourlyBuckets(
  timestamps: readonly string[],
  hours: number,
  now: number = Date.now(),
): number[] {
  const buckets = new Array<number>(hours).fill(0);
  const hourMs = 3600_000;
  const end = Math.ceil(now / hourMs) * hourMs;
  for (const iso of timestamps) {
    const t = new Date(iso).getTime();
    const idx = hours - 1 - Math.floor((end - 1 - t) / hourMs);
    if (idx >= 0 && idx < hours) buckets[idx] = (buckets[idx] ?? 0) + 1;
  }
  return buckets;
}
