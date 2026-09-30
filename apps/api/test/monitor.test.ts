import type { DeviceStatusEvent } from '@simu/shared-types';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sweepOfflineDevices } from '../src/services/heartbeat-monitor.js';
import {
  createTestApp,
  DEVICE_KEY,
  hasTestDb,
  serviceContext,
  type TestContext,
} from './helpers.js';

describe.skipIf(!hasTestDb)('heartbeat monitor (spec §6.2)', () => {
  let t: TestContext;
  beforeAll(async () => {
    t = await createTestApp();
  });
  afterAll(async () => t?.close());

  it('marks devices OFFLINE after 90 s without heartbeat, except maintenance', async () => {
    const now = new Date();
    const old = new Date(now.getTime() - 91_000);
    const fresh = new Date(now.getTime() - 30_000);
    await t.prisma.device.updateMany({ data: { lastHeartbeat: old } });
    await t.prisma.device.update({
      where: { deviceCode: 'CAM-001' },
      data: { lastHeartbeat: fresh },
    });
    await t.prisma.device.update({
      where: { deviceCode: 'TL-001' },
      data: { status: 'maintenance' },
    });
    await t.prisma.device.update({
      where: { deviceCode: 'CAM-004' },
      data: { status: 'degraded' },
    });

    const { ctx, published } = serviceContext(t);
    const offline = await sweepOfflineDevices(ctx, now);

    expect(offline).toHaveLength(9);
    expect(offline).not.toContain('CAM-001');
    expect(offline).not.toContain('TL-001');
    expect(offline).toContain('CAM-004');

    const cam = await t.prisma.camera.findFirstOrThrow({
      where: { device: { deviceCode: 'CAM-002' } },
    });
    expect(cam.status).toBe('offline');

    const events = published.filter((p) => p.channel === 'devices:status');
    expect(events).toHaveLength(9);
    expect(
      events.find((e) => (e.data as DeviceStatusEvent).device_code === 'CAM-004')?.data,
    ).toMatchObject({
      status: 'offline',
      previous_status: 'degraded',
      reason: 'heartbeat_timeout',
    });
  });

  it('is idempotent: a second sweep changes nothing', async () => {
    const { ctx, published } = serviceContext(t);
    expect(await sweepOfflineDevices(ctx)).toEqual([]);
    expect(published).toHaveLength(0);
  });

  it('brings a device back ONLINE on its next heartbeat', async () => {
    const res = await t.app.inject({
      method: 'POST',
      url: '/devices/CAM-002/heartbeat',
      headers: { 'x-device-key': DEVICE_KEY },
    });
    expect(res.json().status).toBe('online');
    const device = await t.prisma.device.findUniqueOrThrow({
      where: { deviceCode: 'CAM-002' },
      include: { camera: true },
    });
    expect(device.status).toBe('online');
    expect(device.camera?.status).toBe('online');
  });

  it('does not mark offline a device whose heartbeat is within the window', async () => {
    const { ctx } = serviceContext(t);
    // CAM-002 just sent a heartbeat; sweep as if 60 s had passed.
    const offline = await sweepOfflineDevices(ctx, new Date(Date.now() + 60_000));
    expect(offline).not.toContain('CAM-002');
  });
});
