import type { WsMessage } from '@simu/shared-types';
import { describe, expect, it } from 'vitest';
import { describeEvent } from './describe-event';

const ts = '2026-09-29T21:30:00.000Z';

describe('describeEvent (live timeline, es-MX)', () => {
  it('describes a drain reading with its status', () => {
    const item = describeEvent({
      channel: 'drain-readings',
      event: 'reading',
      ts,
      data: {
        device_code: 'DRAIN-001',
        value: 92,
        recorded_at: ts,
        synced: true,
        obstruction_level: 92,
        drain_status: 'critical',
        batch_size: 1,
      },
    } satisfies WsMessage);
    expect(item).toMatchObject({
      subject: 'DRAIN-001',
      severity: 'critical',
      text: 'Nivel 92 % · Crítico',
    });
  });

  it('flags late store-and-forward batches', () => {
    const item = describeEvent({
      channel: 'drain-readings',
      event: 'reading',
      ts,
      data: {
        device_code: 'DRAIN-001',
        value: 84,
        recorded_at: ts,
        synced: false,
        obstruction_level: 84,
        drain_status: 'alert',
        batch_size: 18,
      },
    });
    expect(item.text).toBe('Nivel 84 % · Alerta · lote sincronizado de 18 · llegó tarde');
  });

  it('explains heartbeat timeouts', () => {
    const item = describeEvent({
      channel: 'devices:status',
      event: 'status_changed',
      ts,
      data: {
        device_code: 'CAM-002',
        status: 'offline',
        previous_status: 'online',
        last_heartbeat: ts,
        reason: 'heartbeat_timeout',
      },
    });
    expect(item).toMatchObject({
      severity: 'danger',
      text: 'En línea → Fuera de línea (sin heartbeat 90 s)',
    });
  });

  it('uses the rules-engine label for alerts', () => {
    const item = describeEvent({
      channel: 'alerts',
      event: 'escalated',
      ts,
      data: {
        incident_id: 'x',
        device_code: 'DRAIN-001',
        priority: 'critical',
        label: 'RIESGO CRÍTICO',
        message:
          'RIESGO CRÍTICO: coladera DRAIN-001 al 88 % con lluvia y agua detectada por cámara',
        kind: 'escalated',
        source: 'rules_engine',
        rule_name: 'r3',
        facts: {},
      },
    });
    expect(item.severity).toBe('critical');
    expect(item.text.startsWith('RIESGO CRÍTICO · ')).toBe(true);
  });

  it('marks camera detections below threshold', () => {
    const item = describeEvent({
      channel: 'camera-events',
      event: 'detected',
      ts,
      data: {
        device_code: 'CAM-003',
        event_type: 'OBSTACLE',
        confidence: 0.41,
        location_id: 'ZONE-003',
        priority: 'MEDIUM',
        recorded_at: ts,
        synced: true,
        incident_id: null,
      },
    });
    expect(item).toMatchObject({
      severity: 'info',
      text: 'Detecta OBSTACLE · confianza 0.41 · bajo umbral',
    });
  });
});
