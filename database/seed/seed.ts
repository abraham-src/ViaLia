/**
 * SIMU · CDMX — idempotent seed.
 *
 * Runs on every API container start (after `prisma migrate deploy`). Every write is
 * create-if-missing, so runtime state (device status, incident workflow, changed
 * passwords) is never overwritten by a restart.
 *
 * Logs only aggregate counts: no emails or other personal data.
 */
import { PrismaClient } from '@prisma/client';
import type { RoleName } from '@simu/shared-types';
import { drainStatusFromLevel } from '@simu/shared-utils';
import bcrypt from 'bcryptjs';
import { ACCESSIBILITY_POINTS, ACCESSIBLE_ROUTES } from './data/accessibility.js';
import { DEVICES, ZONES } from './data/devices.js';
import { INCIDENTS } from './data/incidents.js';
import { RULES } from './data/rules.js';
import { DEMO_USERS, ROLES } from './data/users.js';
import { seedId } from './seed-id.js';

const prisma = new PrismaClient();
const MINUTE_MS = 60_000;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name} (ver .env.example)`);
  return value;
}

async function seedRoles(): Promise<Map<RoleName, number>> {
  for (const role of ROLES) {
    await prisma.role.upsert({
      where: { name: role.name },
      update: { description: role.description },
      create: role,
    });
  }
  const roles = await prisma.role.findMany();
  return new Map(roles.map((r) => [r.name, r.id]));
}

async function seedUsers(roleIds: Map<RoleName, number>): Promise<Map<RoleName, string>> {
  const passwordHash = await bcrypt.hash(requireEnv('SEED_DEMO_PASSWORD'), 10);
  const userIdByRole = new Map<RoleName, string>();
  for (const u of DEMO_USERS) {
    const roleId = roleIds.get(u.role);
    if (roleId === undefined) throw new Error(`Rol no encontrado: ${u.role}`);
    const user = await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { name: u.name, email: u.email, passwordHash, roleId, status: 'active' },
    });
    userIdByRole.set(u.role, user.id);
  }
  return userIdByRole;
}

/** 24 h of readings every 30 min, rising towards the current level with a small wobble. */
function readingHistory(finalLevel: number, now: Date): Array<{ recordedAt: Date; value: number }> {
  const points = 48;
  const end = Math.floor(now.getTime() / MINUTE_MS) * MINUTE_MS;
  return Array.from({ length: points }, (_, i) => {
    const recordedAt = new Date(end - (points - 1 - i) * 30 * MINUTE_MS);
    if (i === points - 1) return { recordedAt, value: finalLevel };
    const base = finalLevel * (0.55 + 0.45 * (i / (points - 1)));
    const value = Math.min(100, Math.max(0, base + Math.sin(i / 3) * 2.5));
    return { recordedAt, value: Math.round(value * 10) / 10 };
  });
}

async function seedDevices(now: Date): Promise<Map<string, string>> {
  const deviceIdByCode = new Map<string, string>();
  for (const d of DEVICES) {
    const device = await prisma.device.upsert({
      where: { deviceCode: d.code },
      update: {},
      create: {
        deviceCode: d.code,
        type: d.type,
        name: d.name,
        latitude: d.lat,
        longitude: d.lng,
        status: 'online',
        lastHeartbeat: now,
        metadata: { ...d.metadata, zone: d.zone, zone_name: ZONES[d.zone] },
        ...(d.camera && {
          camera: {
            create: {
              model: d.camera.model,
              locationDescription: d.camera.locationDescription,
              status: 'online',
            },
          },
        }),
        ...(d.drain && {
          drain: {
            create: {
              latitude: d.lat,
              longitude: d.lng,
              obstructionLevel: d.drain.level,
              status: drainStatusFromLevel(d.drain.level),
              lastReadingAt: now,
            },
          },
        }),
      },
    });
    deviceIdByCode.set(d.code, device.id);

    if (d.drain) {
      const existing = await prisma.sensorReading.count({ where: { deviceId: device.id } });
      if (existing === 0) {
        await prisma.sensorReading.createMany({
          data: readingHistory(d.drain.level, now).map((r) => ({
            deviceId: device.id,
            value: r.value,
            unit: 'percent',
            recordedAt: r.recordedAt,
            receivedAt: r.recordedAt,
            synced: true,
            metadata: { source: 'seed' },
          })),
          skipDuplicates: true,
        });
      }
    }
  }
  return deviceIdByCode;
}

async function seedAccessibility(): Promise<void> {
  for (const p of ACCESSIBILITY_POINTS) {
    const pointId = seedId(`accessibility-point:${p.key}`);
    await prisma.accessibilityPoint.upsert({
      where: { id: pointId },
      update: {},
      create: {
        id: pointId,
        type: p.type,
        latitude: p.lat,
        longitude: p.lng,
        status: p.status,
        source: 'seed_mock',
        metadata: { key: p.key, name: p.name, zone: p.zone, zone_name: ZONES[p.zone] },
      },
    });
    if (p.ramp) {
      const rampId = seedId(`ramp:${p.key}`);
      await prisma.ramp.upsert({
        where: { id: rampId },
        update: {},
        create: {
          id: rampId,
          accessibilityPointId: pointId,
          latitude: p.lat,
          longitude: p.lng,
          status: p.status,
          slope: p.ramp.slope,
          widthM: p.ramp.widthM,
        },
      });
    }
  }

  // Prisma cannot write PostGIS geometries: raw, parameterized SQL.
  for (const r of ACCESSIBLE_ROUTES) {
    const first = r.path[0];
    const last = r.path[r.path.length - 1];
    if (!first || !last || r.path.length < 2) throw new Error(`Ruta inválida: ${r.key}`);
    const pathWkt = `LINESTRING(${r.path.map(([lng, lat]) => `${lng} ${lat}`).join(', ')})`;
    await prisma.$executeRaw`
      INSERT INTO accessible_routes (id, origin, destination, path, status, metadata)
      VALUES (
        ${seedId(`route:${r.key}`)}::uuid,
        ST_SetSRID(ST_MakePoint(${first[0]}, ${first[1]}), 4326),
        ST_SetSRID(ST_MakePoint(${last[0]}, ${last[1]}), 4326),
        ST_GeomFromText(${pathWkt}, 4326),
        ${r.status}::route_status,
        ${JSON.stringify({ key: r.key, name: r.name, source: 'seed_mock' })}::jsonb
      )
      ON CONFLICT (id) DO NOTHING`;
  }
}

async function seedIncidents(
  now: Date,
  deviceIdByCode: Map<string, string>,
  userIdByRole: Map<RoleName, string>,
): Promise<void> {
  for (const inc of INCIDENTS) {
    const id = seedId(`incident:${inc.key}`);
    const createdAt = new Date(now.getTime() - inc.ageMinutes * MINUTE_MS);
    const validatedEvent = inc.events.find((e) => e.eventType === 'validated');
    const deviceId = inc.deviceCode ? deviceIdByCode.get(inc.deviceCode) : undefined;
    const assignedToId = inc.assignedToRole ? userIdByRole.get(inc.assignedToRole) : undefined;

    await prisma.incident.upsert({
      where: { id },
      update: {},
      create: {
        id,
        type: inc.type,
        description: inc.description,
        priority: inc.priority,
        confidence: inc.confidence,
        status: inc.status,
        latitude: inc.lat,
        longitude: inc.lng,
        createdAt,
        validatedAt: validatedEvent
          ? new Date(createdAt.getTime() + validatedEvent.afterMinutes * MINUTE_MS)
          : null,
        deviceId: deviceId ?? null,
        assignedToId: assignedToId ?? null,
        metadata: { ...inc.metadata, seed_key: inc.key },
      },
    });

    const eventCount = await prisma.incidentEvent.count({ where: { incidentId: id } });
    if (eventCount === 0) {
      await prisma.incidentEvent.createMany({
        data: inc.events.map((e) => ({
          incidentId: id,
          eventType: e.eventType,
          payload: e.payload,
          createdAt: new Date(createdAt.getTime() + e.afterMinutes * MINUTE_MS),
        })),
      });
    }
  }
}

async function seedRules(): Promise<void> {
  for (const r of RULES) {
    await prisma.rule.upsert({
      where: { name: r.name },
      update: {},
      create: {
        id: seedId(`rule:${r.key}`),
        name: r.name,
        description: r.description,
        conditions: r.conditions,
        action: r.action,
        sortOrder: r.sortOrder,
        enabled: true,
      },
    });
  }
}

async function main(): Promise<void> {
  const now = new Date();
  const roleIds = await seedRoles();
  const userIdByRole = await seedUsers(roleIds);
  const deviceIdByCode = await seedDevices(now);
  await seedAccessibility();
  await seedIncidents(now, deviceIdByCode, userIdByRole);
  await seedRules();

  const [roles, users, devices, readings, points, ramps, routes, incidents, rules] =
    await Promise.all([
      prisma.role.count(),
      prisma.user.count(),
      prisma.device.count(),
      prisma.sensorReading.count(),
      prisma.accessibilityPoint.count(),
      prisma.ramp.count(),
      prisma.accessibleRoute.count(),
      prisma.incident.count(),
      prisma.rule.count(),
    ]);
  console.info(
    `[seed] ok roles=${roles} users=${users} devices=${devices} readings=${readings} ` +
      `accessibility_points=${points} ramps=${ramps} routes=${routes} incidents=${incidents} rules=${rules}`,
  );
}

try {
  await main();
} catch (err) {
  console.error('[seed] failed', err);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
