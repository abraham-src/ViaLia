import { describe, expect, it } from 'vitest';
import { CDMX_BBOX, haversineMeters, isPointInBbox, parseBbox } from '../src/geo.js';

const ZOCALO = { lng: -99.1332, lat: 19.4326 };
const ANGEL = { lng: -99.1677, lat: 19.427 };

describe('haversineMeters', () => {
  it('returns 0 for the same point', () => {
    expect(haversineMeters(ZOCALO, ZOCALO)).toBe(0);
  });

  it('measures Zócalo to Ángel de la Independencia (~3.67 km)', () => {
    const d = haversineMeters(ZOCALO, ANGEL);
    expect(d).toBeGreaterThan(3650);
    expect(d).toBeLessThan(3690);
  });

  it('is symmetric', () => {
    expect(haversineMeters(ZOCALO, ANGEL)).toBeCloseTo(haversineMeters(ANGEL, ZOCALO), 6);
  });
});

describe('parseBbox', () => {
  it('parses a valid bbox', () => {
    expect(parseBbox('-99.17, 19.41, -99.15, 19.43')).toEqual([-99.17, 19.41, -99.15, 19.43]);
  });

  it.each([
    '-99.17,19.41,-99.15',
    'a,b,c,d',
    '-99.15,19.41,-99.17,19.43',
    '-99.17,19.43,-99.15,19.41',
    '-200,19.41,-99.15,19.43',
    ',,,',
  ])('rejects %j', (input) => {
    expect(() => parseBbox(input)).toThrow(RangeError);
  });
});

describe('isPointInBbox', () => {
  it('accepts points inside CDMX and rejects Guadalajara', () => {
    expect(isPointInBbox(ZOCALO, CDMX_BBOX)).toBe(true);
    expect(isPointInBbox({ lng: -103.3496, lat: 20.6597 }, CDMX_BBOX)).toBe(false);
  });
});
