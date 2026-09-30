import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config.js';

const VALID = {
  DATABASE_URL: 'postgresql://simu:pw@localhost:5432/simu?schema=public',
  JWT_ACCESS_SECRET: 'a'.repeat(32),
  JWT_REFRESH_SECRET: 'b'.repeat(32),
  DEVICE_INGEST_KEY: 'k'.repeat(16),
};

describe('loadConfig', () => {
  it('applies defaults', () => {
    const cfg = loadConfig(VALID);
    expect(cfg.API_PORT).toBe(3000);
    expect(cfg.NODE_ENV).toBe('development');
    expect(cfg.AI_SERVICE_URL).toBeUndefined();
    expect(cfg.JWT_ACCESS_TTL).toBe(900);
    expect(cfg.COOKIE_SECURE).toBe(false);
  });

  it('requires the device ingest key', () => {
    const { DEVICE_INGEST_KEY: _omit, ...rest } = VALID;
    expect(() => loadConfig(rest)).toThrow(/DEVICE_INGEST_KEY/);
  });

  it('treats an empty AI_SERVICE_URL as unset (mock AI)', () => {
    expect(loadConfig({ ...VALID, AI_SERVICE_URL: '' }).AI_SERVICE_URL).toBeUndefined();
  });

  it('rejects short JWT secrets and a missing DATABASE_URL, listing both', () => {
    expect(() =>
      loadConfig({ JWT_ACCESS_SECRET: 'short', JWT_REFRESH_SECRET: 'b'.repeat(32) }),
    ).toThrow(/DATABASE_URL[\s\S]*JWT_ACCESS_SECRET|JWT_ACCESS_SECRET[\s\S]*DATABASE_URL/);
  });
});
