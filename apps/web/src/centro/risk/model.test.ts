import { describe, expect, it } from 'vitest';
import { NO_SCENARIO, assessZone, levelOf, rainAt, type ZoneInput } from './model';

const roma = (level: number, extra: Partial<ZoneInput> = {}): ZoneInput => ({
  code: 'ZONE-001',
  name: 'Roma Norte',
  flood: { level: 'high', name: 'Bajo de Álvaro Obregón y Orizaba' },
  drains: [{ code: 'DRAIN-001', level, online: true, ageMin: 1, trendPerHour: 0 }],
  hydricIncidents: 0,
  cameraWater: false,
  trafficIncidents: 0,
  trafficLights: ['TL-001'],
  ...extra,
});

const dry = { intensityNow: 0, ageMin: 5 };

describe('ViaLia · índice de riesgo', () => {
  it('sin lluvia y con la coladera limpia el riesgo es bajo', () => {
    const r = assessZone(roma(35), dry, NO_SCENARIO, 30);
    expect(r.level).toBe('low');
    expect(r.actions[0]).toMatch(/monitoreando/);
  });

  it('escenario 4 de la demo (88 %, lluvia y agua en cámara) es crítico', () => {
    const r = assessZone(
      roma(88, { hydricIncidents: 1, cameraWater: true }),
      { intensityNow: 22, ageMin: 2 },
      NO_SCENARIO,
      30,
    );
    expect(r.level).toBe('critical');
    expect(r.actions.join(' ')).toMatch(/TL-001/);
    expect(r.factors[0]?.weight).toBeGreaterThan(0.1);
  });

  it('momento wow: la alerta sube antes de que llegue la lluvia', () => {
    const sc = { ...NO_SCENARIO, rainPeak: 30, rainPeakAt: 30 };
    const now = assessZone(roma(71), dry, sc, 0);
    const later = assessZone(roma(71), dry, sc, 30);
    expect(later.probability).toBeGreaterThan(now.probability + 0.2);
    expect(['high', 'critical']).toContain(later.level);
  });

  it('la lluvia pronosticada llega a su pico en el minuto indicado', () => {
    const sc = { ...NO_SCENARIO, rainPeak: 40, rainPeakAt: 45 };
    expect(rainAt(45, dry, sc)).toBeCloseTo(40, 5);
    expect(rainAt(0, dry, sc)).toBeLessThan(5);
  });

  it('umbrales de nivel', () => {
    expect(levelOf(0.1)).toBe('low');
    expect(levelOf(0.4)).toBe('medium');
    expect(levelOf(0.6)).toBe('high');
    expect(levelOf(0.9)).toBe('critical');
  });
});
