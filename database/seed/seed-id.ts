import { createHash } from 'node:crypto';

/**
 * Deterministic UUID (v5-style layout) derived from a stable key.
 * Lets the seed upsert rows that have no natural unique key, so re-running
 * the seed on every container start never duplicates data.
 */
export function seedId(key: string): string {
  const h = createHash('sha1').update(`simu-seed:${key}`).digest('hex');
  const variant = ((parseInt(h.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0');
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    `5${h.slice(13, 16)}`,
    `${variant}${h.slice(18, 20)}`,
    h.slice(20, 32),
  ].join('-');
}
