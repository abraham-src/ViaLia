import {
  AccessibilityPointType,
  AccessibilityStatus,
  DeviceStatus,
  DeviceType,
  DrainStatus,
  IncidentPriority,
  IncidentStatus,
  IncidentType,
  RoleName,
  RouteStatus,
  UserStatus,
} from '@prisma/client';
import {
  ACCESSIBILITY_POINT_TYPES,
  ACCESSIBILITY_STATUSES,
  DEVICE_STATUSES,
  DEVICE_TYPES,
  DRAIN_STATUSES,
  INCIDENT_PRIORITIES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
  ROLE_NAMES,
  ROUTE_STATUSES,
  USER_STATUSES,
} from '@simu/shared-types';
import { describe, expect, it } from 'vitest';

/** Guards against drift between database/schema.prisma and packages/shared-types. */
describe('Prisma enums match shared-types', () => {
  it.each([
    ['RoleName', RoleName, ROLE_NAMES],
    ['UserStatus', UserStatus, USER_STATUSES],
    ['DeviceType', DeviceType, DEVICE_TYPES],
    ['DeviceStatus', DeviceStatus, DEVICE_STATUSES],
    ['DrainStatus', DrainStatus, DRAIN_STATUSES],
    ['IncidentType', IncidentType, INCIDENT_TYPES],
    ['IncidentPriority', IncidentPriority, INCIDENT_PRIORITIES],
    ['IncidentStatus', IncidentStatus, INCIDENT_STATUSES],
    ['AccessibilityPointType', AccessibilityPointType, ACCESSIBILITY_POINT_TYPES],
    ['AccessibilityStatus', AccessibilityStatus, ACCESSIBILITY_STATUSES],
    ['RouteStatus', RouteStatus, ROUTE_STATUSES],
  ] as const)('%s', (_name, prismaEnum, shared) => {
    expect(Object.values(prismaEnum)).toEqual([...shared]);
  });
});
