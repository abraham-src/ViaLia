import type {
  AlertEvent,
  CameraEventMessage,
  DeviceStatusEvent,
  DrainReadingEvent,
  HeartbeatEvent,
  IncidentDto,
  WsMessage,
} from '@simu/shared-types';
import {
  DEVICE_STATUS_LABEL,
  DRAIN_STATUS_LABEL,
  INCIDENT_STATUS_LABEL,
  INCIDENT_TYPE_LABEL,
  PRIORITY_LABEL,
} from './labels';

export type FeedSeverity = 'info' | 'ok' | 'warn' | 'danger' | 'critical';

export interface FeedItem {
  id: string;
  ts: string;
  channel: WsMessage['channel'];
  event: string;
  /** Device or incident the event is about (mono column). */
  subject: string;
  text: string;
  severity: FeedSeverity;
}

const drainSeverity: Record<string, FeedSeverity> = {
  normal: 'ok',
  caution: 'warn',
  alert: 'danger',
  critical: 'critical',
};
const prioritySeverity: Record<string, FeedSeverity> = {
  low: 'info',
  medium: 'warn',
  high: 'danger',
  critical: 'critical',
};

let seq = 0;

/** Turns a WebSocket message into one line of the live timeline (es-MX). */
export function describeEvent(msg: WsMessage): FeedItem {
  const base = { id: `${Date.now()}-${seq++}`, ts: msg.ts, channel: msg.channel, event: msg.event };
  switch (msg.channel) {
    case 'drain-readings': {
      const d = msg.data as DrainReadingEvent;
      return {
        ...base,
        subject: d.device_code,
        text:
          `Nivel ${d.obstruction_level} % · ${DRAIN_STATUS_LABEL[d.drain_status]}` +
          (d.batch_size > 1 ? ` · lote sincronizado de ${d.batch_size}` : '') +
          (d.synced ? '' : ' · llegó tarde'),
        severity: drainSeverity[d.drain_status] ?? 'info',
      };
    }
    case 'devices:status': {
      const d = msg.data as DeviceStatusEvent;
      const reason = d.reason === 'heartbeat_timeout' ? ' (sin heartbeat 90 s)' : '';
      return {
        ...base,
        subject: d.device_code,
        text: `${DEVICE_STATUS_LABEL[d.previous_status]} → ${DEVICE_STATUS_LABEL[d.status]}${reason}`,
        severity: d.status === 'online' ? 'ok' : d.status === 'offline' ? 'danger' : 'warn',
      };
    }
    case 'heartbeats': {
      const d = msg.data as HeartbeatEvent;
      return {
        ...base,
        subject: d.device_code,
        text: `Heartbeat · ${DEVICE_STATUS_LABEL[d.status]}`,
        severity: d.status === 'online' ? 'info' : 'warn',
      };
    }
    case 'camera-events': {
      const d = msg.data as CameraEventMessage;
      return {
        ...base,
        subject: d.device_code,
        text: `Detecta ${d.event_type} · confianza ${d.confidence.toFixed(2)}${d.incident_id ? ' · incidencia' : ' · bajo umbral'}`,
        severity: d.incident_id ? 'warn' : 'info',
      };
    }
    case 'alerts': {
      const d = msg.data as AlertEvent;
      return {
        ...base,
        subject: d.device_code ?? '—',
        text: `${d.label} · ${d.message}`,
        severity: prioritySeverity[d.priority] ?? 'warn',
      };
    }
    case 'incidents': {
      const d = msg.data as IncidentDto;
      const verb =
        msg.event === 'created'
          ? 'Nueva'
          : msg.event === 'priority_raised'
            ? `Prioridad ↑ ${PRIORITY_LABEL[d.priority]}`
            : msg.event === 'status_changed'
              ? INCIDENT_STATUS_LABEL[d.status]
              : 'Actualizada';
      return {
        ...base,
        subject: d.device_code ?? 'reporte',
        text: `${verb} · ${INCIDENT_TYPE_LABEL[d.type]} · ${PRIORITY_LABEL[d.priority]}`,
        severity: prioritySeverity[d.priority] ?? 'info',
      };
    }
  }
}
