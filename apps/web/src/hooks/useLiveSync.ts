import type {
  AlertEvent,
  DeviceDto,
  DeviceStatusEvent,
  DrainReadingEvent,
  HeartbeatEvent,
  SensorReadingDto,
  WsChannel,
  WsMessage,
} from '@simu/shared-types';
import { WS_CHANNELS } from '@simu/shared-types';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { refreshSession } from '../lib/api';
import { describeEvent } from '../lib/describe-event';
import { LiveSocket } from '../lib/live-socket';
import { useAuth } from '../stores/auth';
import { useConnection } from '../stores/connection';
import { useLive } from '../stores/live';
import { qk } from './queries';

let socket: LiveSocket | null = null;

export function getLiveSocket(): LiveSocket {
  socket ??= new LiveSocket(async (forceRefresh) => {
    if (forceRefresh && !(await refreshSession())) return null;
    return useAuth.getState().accessToken;
  });
  return socket;
}

const patchDevice = (
  qc: QueryClient,
  code: string,
  patch: (d: DeviceDto) => DeviceDto,
): DeviceDto | undefined => {
  let previous: DeviceDto | undefined;
  qc.setQueryData<DeviceDto[]>(qk.devices, (list) =>
    list?.map((d) => {
      if (d.device_code !== code) return d;
      previous = d;
      return patch(d);
    }),
  );
  return previous;
};

/** Applies one live message to the query cache and the timeline. */
export function applyLiveMessage(qc: QueryClient, msg: WsMessage): void {
  const live = useLive.getState();
  useConnection.getState().touch();

  switch (msg.channel) {
    case 'heartbeats': {
      const d = msg.data as HeartbeatEvent;
      patchDevice(qc, d.device_code, (dev) => ({
        ...dev,
        last_heartbeat: d.received_at,
        status: d.status,
      }));
      live.heartbeat(msg.ts);
      return; // routine: counted, not listed
    }
    case 'devices:status': {
      const d = msg.data as DeviceStatusEvent;
      patchDevice(qc, d.device_code, (dev) => ({
        ...dev,
        status: d.status,
        last_heartbeat: d.last_heartbeat ?? dev.last_heartbeat,
        camera: dev.camera ? { ...dev.camera, status: d.status } : null,
      }));
      break;
    }
    case 'drain-readings': {
      const d = msg.data as DrainReadingEvent;
      const previous = patchDevice(qc, d.device_code, (dev) => ({
        ...dev,
        drain: dev.drain
          ? {
              ...dev.drain,
              obstruction_level: d.obstruction_level,
              status: d.drain_status,
              last_reading_at: d.recorded_at,
            }
          : dev.drain,
      }));
      qc.setQueryData<SensorReadingDto[]>(qk.readings(d.device_code), (list) =>
        list
          ? [
              ...list,
              {
                id: `live-${msg.ts}`,
                device_code: d.device_code,
                value: d.value,
                unit: 'percent',
                recorded_at: d.recorded_at,
                received_at: msg.ts,
                synced: d.synced,
              },
            ].slice(-800)
          : list,
      );
      // Only state changes and late batches reach the timeline (every 5 s would drown it).
      const changed = previous?.drain && previous.drain.status !== d.drain_status;
      if (!changed && d.synced && d.batch_size === 1) return;
      break;
    }
    case 'incidents':
      void qc.invalidateQueries({ queryKey: qk.incidentsAll });
      break;
    case 'alerts':
      live.pushAlert({ ...(msg.data as AlertEvent), ts: msg.ts });
      void qc.invalidateQueries({ queryKey: qk.incidentsAll });
      break;
    case 'camera-events':
      break;
  }
  live.push(describeEvent(msg));
}

/** Connects the WebSocket while signed in and keeps the cache live. */
export function useLiveSync(): void {
  const qc = useQueryClient();
  const status = useAuth((s) => s.status);

  useEffect(() => {
    if (status !== 'authenticated') return;
    const ws = getLiveSocket();
    const offStatus = ws.onStatus((s) => useConnection.getState().setLive(s));
    const offMessage = ws.onMessage((msg) => applyLiveMessage(qc, msg));
    ws.start(WS_CHANNELS as readonly WsChannel[]);
    return () => {
      offStatus();
      offMessage();
    };
  }, [qc, status]);
}

export function stopLive(): void {
  socket?.stop();
  useConnection.getState().setLive('idle');
  useLive.getState().reset();
}
