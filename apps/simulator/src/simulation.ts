import type { CameraEventType, IngestEvent } from '@simu/shared-types';
import { CAMERA_EVENT_TYPES } from '@simu/shared-types';
import { serialLineToDrainReading } from '@simu/shared-utils';
import {
  ALL_DEVICES,
  CAMERA_ZONES,
  CAMERAS,
  DRAIN_BASELINES,
  GATEWAY,
  type CameraCode,
} from './catalog.js';
import type { Outbox } from './store.js';

export interface DrainState {
  code: string;
  base: number;
  level: number;
  /** When set, the drain reports exactly this level (forced by the demo). */
  hold: number | null;
}

export interface WeatherState {
  raining: boolean;
  zone: string | null;
  intensityMmH: number | null;
}

export interface LogEntry {
  at: string;
  message: string;
}

const clamp = (v: number, min: number, max: number): number => Math.min(max, Math.max(min, v));

/** Arduino serial line exactly as the firmware prints it: `DRAIN001,78`. */
export function toSerialLine(code: string, level: number): string {
  return `${code.replace('-', '')},${Math.round(level)}`;
}

/**
 * Holds the simulated world (drain levels, rain, device health) and turns it into
 * outbox events. Nothing here talks to the network: the sync worker does.
 */
export class Simulation {
  readonly drains = new Map<string, DrainState>();
  weather: WeatherState = { raining: false, zone: null, intensityMmH: null };
  readonly health = new Map<string, 'online' | 'degraded'>();
  private readonly log: LogEntry[] = [];

  constructor(
    private readonly outbox: Outbox,
    private readonly random: () => number = Math.random,
  ) {
    this.resetWorld();
  }

  resetWorld(): void {
    for (const [code, base] of Object.entries(DRAIN_BASELINES)) {
      this.drains.set(code, { code, base, level: base, hold: null });
    }
    this.weather = { raining: false, zone: null, intensityMmH: null };
    this.health.clear();
  }

  record(message: string): void {
    this.log.unshift({ at: new Date().toISOString(), message });
    this.log.length = Math.min(this.log.length, 60);
  }

  recentLog(): LogEntry[] {
    return [...this.log];
  }

  private enqueue(event: IngestEvent): void {
    this.outbox.enqueue(event);
  }

  // ── Drains (Arduino + ultrasonic sensor → USB serial → gateway) ──

  /** One sampling cycle for every drain (spec §8: every 5 s). */
  sampleDrains(now: Date = new Date()): void {
    for (const d of this.drains.values()) {
      if (d.hold !== null) {
        d.level = d.hold;
      } else {
        const step = (this.random() - 0.5) * 3; // random walk ±1.5 %
        d.level = clamp(d.level + step, Math.max(0, d.base - 6), Math.min(100, d.base + 6));
      }
      // Same path as the real gateway: serial line → parser → JSON payload.
      const payload = serialLineToDrainReading(toSerialLine(d.code, d.level), now);
      if (!payload) continue;
      this.enqueue({
        type: 'drain_reading',
        device_code: payload.device_code,
        value: payload.value,
        unit: 'percent',
        recorded_at: payload.recorded_at,
      });
    }
  }

  setDrainLevel(code: string, level: number | null): void {
    const drain = this.drains.get(code);
    if (!drain) throw new Error(`Coladera desconocida: ${code}`);
    drain.hold = level === null ? null : clamp(Math.round(level), 0, 100);
    if (level === null) drain.level = drain.base;
    this.record(
      level === null ? `${code}: vuelve a su nivel normal` : `${code}: forzada a ${drain.hold} %`,
    );
  }

  // ── Cameras (Ray-Ban Meta → bridge app → AI → event) ──

  emitCamera(
    code: CameraCode,
    eventType: CameraEventType,
    confidence: number,
    now = new Date(),
  ): void {
    this.enqueue({
      type: 'camera_event',
      device_id: code,
      event_type: eventType,
      confidence: Math.round(confidence * 1000) / 1000,
      location_id: CAMERA_ZONES[code],
      recorded_at: now.toISOString(),
    });
    this.record(`${code}: detecta ${eventType} (confianza ${confidence.toFixed(2)})`);
  }

  /**
   * Background detections with random confidence. Most fall below the API threshold
   * (0.6), so they are logged but rarely become incidents — like a real noisy model.
   */
  maybeRandomDetection(probability: number): void {
    if (this.random() > probability) return;
    const camera = CAMERAS[Math.floor(this.random() * CAMERAS.length)]!;
    const eventType = CAMERA_EVENT_TYPES[Math.floor(this.random() * CAMERA_EVENT_TYPES.length)]!;
    this.emitCamera(camera, eventType, 0.3 + this.random() * 0.38);
  }

  // ── Weather (rain sensor on the gateway) ──

  setWeather(
    raining: boolean,
    zone: string | null = null,
    intensityMmH: number | null = null,
  ): void {
    this.weather = { raining, zone, intensityMmH: raining ? (intensityMmH ?? 15) : null };
    this.sendWeather();
    this.record(raining ? `Lluvia activada${zone ? ` en ${zone}` : ''}` : 'Lluvia desactivada');
  }

  sendWeather(now = new Date()): void {
    this.enqueue({
      type: 'weather',
      device_code: GATEWAY,
      raining: this.weather.raining,
      ...(this.weather.intensityMmH !== null && { intensity_mm_h: this.weather.intensityMmH }),
      ...(this.weather.zone !== null && { zone: this.weather.zone }),
      recorded_at: now.toISOString(),
    });
  }

  // ── Heartbeats (spec §6.2: every 30 s) ──

  sendHeartbeats(now = new Date()): void {
    for (const code of ALL_DEVICES) {
      this.enqueue({
        type: 'heartbeat',
        device_code: code,
        status: this.health.get(code) ?? 'online',
        recorded_at: now.toISOString(),
      });
    }
  }

  setHealth(code: string, status: 'online' | 'degraded'): void {
    if (status === 'online') this.health.delete(code);
    else this.health.set(code, status);
    this.record(
      `${code}: reporta ${status === 'degraded' ? 'DEGRADED (baja visibilidad)' : 'ONLINE'}`,
    );
  }
}
