import type {
  AccessibilityPointType,
  AccessibilityStatus,
  DeviceStatus,
  DeviceType,
  DrainStatus,
  IncidentPriority,
  IncidentStatus,
  IncidentType,
} from '@simu/shared-types';
import { formatAge, formatCoords, formatDateTime, formatTime } from '../../lib/format';
import {
  ACCESSIBILITY_STATUS_LABEL,
  ACCESSIBILITY_TYPE_LABEL,
  DEVICE_STATUS_LABEL,
  DEVICE_TYPE_LABEL,
  DRAIN_STATUS_LABEL,
  INCIDENT_STATUS_LABEL,
  INCIDENT_TYPE_LABEL,
  PRIORITY_LABEL,
} from '../../lib/labels';

type Props = Record<string, unknown>;

const esc = (v: unknown): string =>
  String(v ?? '—').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const str = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' && v !== 'null' ? v : null;
const num = (v: unknown): number | null =>
  typeof v === 'number'
    ? v
    : typeof v === 'string' && v !== '' && !Number.isNaN(Number(v))
      ? Number(v)
      : null;

function tone(kind: string, label: string): string {
  return `<span class="simu-chip simu-chip-${kind}">${esc(label)}</span>`;
}

const DEVICE_TONE: Record<DeviceStatus, string> = {
  online: 'ok',
  degraded: 'warn',
  offline: 'danger',
  maintenance: 'neutral',
};
const DRAIN_TONE: Record<DrainStatus, string> = {
  normal: 'ok',
  caution: 'warn',
  alert: 'danger',
  critical: 'critical',
};
const PRIORITY_TONE: Record<IncidentPriority, string> = {
  low: 'neutral',
  medium: 'accent',
  high: 'warn',
  critical: 'critical',
};
const ACCESS_TONE: Record<AccessibilityStatus, string> = {
  available: 'ok',
  blocked: 'critical',
  damaged: 'warn',
  unknown: 'neutral',
};

function table(rows: Array<[string, string | null]>): string {
  return `<table class="simu-popup-table">${rows
    .filter(([, v]) => v !== null)
    .map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`)
    .join('')}</table>`;
}

const ts = (iso: string | null): string | null =>
  iso ? `${esc(formatTime(iso))} <span class="simu-muted">· ${esc(formatAge(iso))}</span>` : null;

/** Popup HTML with the raw fields and timestamps (spec §7.2 "datos crudos"). */
export function popupHtml(p: Props): string {
  const lat = num(p.lat);
  const lng = num(p.lng);
  const coords = lat !== null && lng !== null ? esc(formatCoords(lat, lng)) : null;

  switch (p.kind) {
    case 'device': {
      const status = p.status as DeviceStatus;
      const drainStatus = str(p.drain_status) as DrainStatus | null;
      const level = num(p.level);
      return `<div class="simu-popup">
        <div class="simu-popup-head"><b>${esc(p.code)}</b> ${esc(DEVICE_TYPE_LABEL[p.type as DeviceType])} ${tone(DEVICE_TONE[status], DEVICE_STATUS_LABEL[status])}</div>
        <div class="simu-popup-sub">${esc(p.name)}</div>
        ${table([
          [
            'Nivel',
            level !== null && drainStatus
              ? `${level} % ${tone(DRAIN_TONE[drainStatus], DRAIN_STATUS_LABEL[drainStatus])}`
              : null,
          ],
          ['Última lectura', ts(str(p.last_reading_at))],
          ['Heartbeat', ts(str(p.last_heartbeat))],
          ['Modelo', str(p.model) ? esc(p.model) : null],
          ['Ubicación', str(p.location) ? esc(p.location) : null],
          ['Zona', str(p.zone) ? esc(p.zone) : null],
          ['Coordenadas', coords],
        ])}
      </div>`;
    }
    case 'incident': {
      const priority = p.priority as IncidentPriority;
      const confidence = num(p.confidence);
      return `<div class="simu-popup">
        <div class="simu-popup-head">${tone(PRIORITY_TONE[priority], PRIORITY_LABEL[priority])} <b>${esc(INCIDENT_TYPE_LABEL[p.type as IncidentType])}</b></div>
        <div class="simu-popup-sub">${esc(p.description)}</div>
        ${table([
          ['Estado', esc(INCIDENT_STATUS_LABEL[p.status as IncidentStatus])],
          ['Regla', str(p.rule) ? esc(p.rule) : null],
          ['Origen', str(p.source) ? esc(p.source) : null],
          ['Dispositivo', str(p.device_code) ? esc(p.device_code) : 'reporte'],
          ['Confianza', confidence !== null ? confidence.toFixed(2) : null],
          ['Asignada a', str(p.assigned_to) ? esc(p.assigned_to) : null],
          [
            'Creada',
            str(p.created_at)
              ? `${esc(formatDateTime(str(p.created_at)))} <span class="simu-muted">· ${esc(formatAge(str(p.created_at)))}</span>`
              : null,
          ],
          ['Actualizada', ts(str(p.updated_at))],
          ['Coordenadas', coords],
          ['ID', `<span class="simu-muted">${esc(String(p.id).slice(0, 8))}</span>`],
        ])}
      </div>`;
    }
    case 'access': {
      const status = p.status as AccessibilityStatus;
      const slope = num(p.slope);
      const width = num(p.width_m);
      return `<div class="simu-popup">
        <div class="simu-popup-head"><b>${esc(ACCESSIBILITY_TYPE_LABEL[p.type as AccessibilityPointType])}</b> ${tone(ACCESS_TONE[status], ACCESSIBILITY_STATUS_LABEL[status])}</div>
        <div class="simu-popup-sub">${esc(p.name)}</div>
        ${table([
          ['Pendiente', slope !== null ? `${slope} %` : null],
          ['Ancho', width !== null ? `${width} m` : null],
          ['Fuente', esc(p.source)],
          ['Coordenadas', coords],
        ])}
      </div>`;
    }
    case 'route':
      return `<div class="simu-popup">
        <div class="simu-popup-head"><b>Ruta accesible</b> ${tone(p.status === 'blocked' ? 'critical' : p.status === 'alternative' ? 'ok' : 'accent', String(p.status))}</div>
        <div class="simu-popup-sub">${esc(p.name)}</div>
        ${table([['Longitud', num(p.length_m) !== null ? `${num(p.length_m)} m` : null]])}
      </div>`;
    default:
      // Flood-risk polygons (static GIS layer).
      return `<div class="simu-popup">
        <div class="simu-popup-head"><b>Zona con riesgo de inundación</b> ${tone(p.risk_level === 'high' ? 'danger' : 'warn', p.risk_level === 'high' ? 'riesgo alto' : 'riesgo medio')}</div>
        <div class="simu-popup-sub">${esc(p.name)}</div>
        ${table([
          ['Código', esc(p.code)],
          [
            'Dispositivos',
            str(p.related_devices)
              ? esc(
                  String(p.related_devices)
                    .replace(/[[\]"]/g, '')
                    .replace(/,/g, ', '),
                )
              : null,
          ],
          ['Fuente', esc(p.source)],
        ])}
      </div>`;
  }
}
