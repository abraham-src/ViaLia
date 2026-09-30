import type { DeviceStatusEvent } from '@simu/shared-types';
import type { ServiceContext } from './context.js';

/**
 * Marks devices OFFLINE when no heartbeat arrived within HEARTBEAT_TIMEOUT_S (spec §6.2).
 * `maintenance` devices are never touched (manual override). The UPDATE re-checks the
 * cutoff, so a heartbeat that lands mid-sweep wins and the device stays online.
 * Returns the codes that went offline.
 */
export async function sweepOfflineDevices(
  ctx: ServiceContext,
  now: Date = new Date(),
): Promise<string[]> {
  const cutoff = new Date(now.getTime() - ctx.config.HEARTBEAT_TIMEOUT_S * 1000);
  const staleWhere = { OR: [{ lastHeartbeat: { lt: cutoff } }, { lastHeartbeat: null }] };

  const candidates = await ctx.prisma.device.findMany({
    where: { status: { in: ['online', 'degraded'] }, ...staleWhere },
    select: { id: true, deviceCode: true, status: true, lastHeartbeat: true },
  });

  const wentOffline: string[] = [];
  for (const d of candidates) {
    const res = await ctx.prisma.device.updateMany({
      where: { id: d.id, status: d.status, ...staleWhere },
      data: { status: 'offline' },
    });
    if (res.count !== 1) continue;

    await ctx.prisma.camera.updateMany({ where: { deviceId: d.id }, data: { status: 'offline' } });
    ctx.hub.publish<DeviceStatusEvent>('devices:status', 'status_changed', {
      device_code: d.deviceCode,
      status: 'offline',
      previous_status: d.status,
      last_heartbeat: d.lastHeartbeat?.toISOString() ?? null,
      reason: 'heartbeat_timeout',
    });
    wentOffline.push(d.deviceCode);
  }

  if (wentOffline.length > 0) {
    ctx.log.warn({ devices: wentOffline }, 'devices marked offline (heartbeat timeout)');
  }
  return wentOffline;
}

/** Starts the periodic sweep. Returns a stop function. */
export function startHeartbeatMonitor(ctx: ServiceContext): () => void {
  let running = false;
  const timer = setInterval(() => {
    if (running) return; // never overlap sweeps
    running = true;
    sweepOfflineDevices(ctx)
      .catch((err: unknown) => ctx.log.error({ err }, 'heartbeat monitor failed'))
      .finally(() => {
        running = false;
      });
  }, ctx.config.HEARTBEAT_CHECK_INTERVAL_S * 1000);
  timer.unref();
  return () => clearInterval(timer);
}
