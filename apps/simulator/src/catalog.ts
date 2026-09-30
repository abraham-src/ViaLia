/**
 * Simulated field devices. Codes and baselines mirror database/seed/data/devices.ts so the
 * simulator drives exactly the devices the API knows.
 */

export const DRAIN_BASELINES: Readonly<Record<string, number>> = {
  'DRAIN-001': 35,
  'DRAIN-002': 64,
  'DRAIN-003': 12,
  'DRAIN-004': 48,
};

export const CAMERAS = ['CAM-001', 'CAM-002', 'CAM-003', 'CAM-004'] as const;
export type CameraCode = (typeof CAMERAS)[number];

/** Zone of each camera (payload `location_id`). */
export const CAMERA_ZONES: Readonly<Record<CameraCode, string>> = {
  'CAM-001': 'ZONE-001',
  'CAM-002': 'ZONE-002',
  'CAM-003': 'ZONE-003',
  'CAM-004': 'ZONE-004',
};

export const DRAINS = Object.keys(DRAIN_BASELINES);

/** Every device that sends heartbeats (spec §6.2). */
export const ALL_DEVICES = [...CAMERAS, ...DRAINS, 'TL-001', 'TL-002', 'GW-001'] as const;

/** The laptop gateway: source of weather reports. */
export const GATEWAY = 'GW-001';
