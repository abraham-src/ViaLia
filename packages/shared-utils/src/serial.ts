import type { DrainReadingPayload } from '@simu/shared-types';

/**
 * Arduino serial line: `<PREFIX><NNN>,<value>`, e.g. `DRAIN001,78` or `DRAIN001,78.5`.
 * The prefix is upper-case letters; the numeric suffix is exactly 3 digits.
 */
const SERIAL_LINE = /^([A-Z]{2,10})(\d{3}),(\d{1,3}(?:\.\d{1,2})?)$/;

export interface SerialReading {
  device_code: string;
  value: number;
}

/** Returns null for malformed lines or values outside 0–100. Never throws. */
export function parseArduinoSerialLine(line: string): SerialReading | null {
  const match = SERIAL_LINE.exec(line.trim());
  if (!match) return null;
  const [, prefix, number, raw] = match;
  if (prefix === undefined || number === undefined || raw === undefined) return null;
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 100) return null;
  return { device_code: `${prefix}-${number}`, value };
}

/** Gateway conversion: serial line → JSON payload for POST /drains/:code/readings. */
export function serialLineToDrainReading(
  line: string,
  recordedAt: Date,
): DrainReadingPayload | null {
  const parsed = parseArduinoSerialLine(line);
  if (!parsed) return null;
  return {
    device_code: parsed.device_code,
    value: parsed.value,
    unit: 'percent',
    recorded_at: recordedAt.toISOString(),
  };
}
