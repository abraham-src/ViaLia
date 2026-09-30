-- SIMU · CDMX — initial schema
-- Hand-written to include PostGIS generated columns and GIST indexes,
-- which Prisma cannot express. Keep in sync with database/schema.prisma.

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "postgis";

-- CreateEnum
CREATE TYPE "role_name" AS ENUM ('admin', 'operator', 'maintenance', 'citizen');
CREATE TYPE "user_status" AS ENUM ('active', 'inactive', 'suspended');
CREATE TYPE "device_type" AS ENUM ('camera', 'drain', 'traffic_light', 'sensor', 'gateway');
CREATE TYPE "device_status" AS ENUM ('online', 'offline', 'degraded', 'maintenance');
CREATE TYPE "drain_status" AS ENUM ('normal', 'caution', 'alert', 'critical');
CREATE TYPE "incident_type" AS ENUM ('water_accumulation', 'drain_obstruction', 'accident', 'obstacle', 'infrastructure_failure', 'accessibility_block', 'flood_risk');
CREATE TYPE "incident_priority" AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE "incident_status" AS ENUM ('pending', 'validated', 'assigned', 'in_progress', 'resolved', 'rejected');
CREATE TYPE "accessibility_point_type" AS ENUM ('ramp', 'sidewalk', 'crosswalk', 'accessible_route', 'obstacle', 'temporarily_disabled');
CREATE TYPE "accessibility_status" AS ENUM ('available', 'blocked', 'damaged', 'unknown');
CREATE TYPE "route_status" AS ENUM ('active', 'blocked', 'alternative');

-- ───────────────────────────── Identity ─────────────────────────────

CREATE TABLE "roles" (
    "id" SERIAL NOT NULL,
    "name" "role_name" NOT NULL,
    "description" TEXT NOT NULL,
    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "users" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role_id" INTEGER NOT NULL,
    "status" "user_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- ───────────────────────────── Devices ─────────────────────────────

CREATE TABLE "devices" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_code" TEXT NOT NULL,
    "type" "device_type" NOT NULL,
    "name" TEXT NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geom" geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)) STORED,
    "status" "device_status" NOT NULL DEFAULT 'offline',
    "last_heartbeat" TIMESTAMPTZ(3),
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devices_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "devices_latitude_check" CHECK ("latitude" BETWEEN -90 AND 90),
    CONSTRAINT "devices_longitude_check" CHECK ("longitude" BETWEEN -180 AND 180)
);

CREATE TABLE "cameras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "model" TEXT NOT NULL,
    "location_description" TEXT NOT NULL,
    "stream_url" TEXT,
    "status" "device_status" NOT NULL DEFAULT 'offline',
    CONSTRAINT "cameras_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "drains" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geom" geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)) STORED,
    "obstruction_level" INTEGER NOT NULL DEFAULT 0,
    "status" "drain_status" NOT NULL DEFAULT 'normal',
    "last_reading_at" TIMESTAMPTZ(3),
    CONSTRAINT "drains_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "drains_obstruction_level_check" CHECK ("obstruction_level" BETWEEN 0 AND 100)
);

CREATE TABLE "sensor_readings" (
    "id" BIGSERIAL NOT NULL,
    "device_id" UUID NOT NULL,
    "value" DECIMAL(12,4) NOT NULL,
    "unit" TEXT NOT NULL,
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced" BOOLEAN NOT NULL DEFAULT true,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "sensor_readings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "heartbeats" (
    "id" BIGSERIAL NOT NULL,
    "device_id" UUID NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" "device_status" NOT NULL,
    CONSTRAINT "heartbeats_pkey" PRIMARY KEY ("id")
);

-- ───────────────────────────── Incidents ─────────────────────────────

CREATE TABLE "incidents" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "device_id" UUID,
    "type" "incident_type" NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "incident_priority" NOT NULL DEFAULT 'medium',
    "confidence" DECIMAL(4,3) NOT NULL DEFAULT 1,
    "status" "incident_status" NOT NULL DEFAULT 'pending',
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geom" geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)) STORED,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validated_at" TIMESTAMPTZ(3),
    "resolved_at" TIMESTAMPTZ(3),
    "assigned_to" UUID,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "incidents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "incidents_confidence_check" CHECK ("confidence" BETWEEN 0 AND 1)
);

CREATE TABLE "incident_events" (
    "id" BIGSERIAL NOT NULL,
    "incident_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "incident_events_pkey" PRIMARY KEY ("id")
);

-- ───────────────────────────── Accessibility ─────────────────────────────

CREATE TABLE "accessibility_points" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "type" "accessibility_point_type" NOT NULL,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geom" geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)) STORED,
    "status" "accessibility_status" NOT NULL DEFAULT 'unknown',
    "source" TEXT NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "accessibility_points_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ramps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "accessibility_point_id" UUID,
    "latitude" DOUBLE PRECISION NOT NULL,
    "longitude" DOUBLE PRECISION NOT NULL,
    "geom" geometry(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)) STORED,
    "status" "accessibility_status" NOT NULL DEFAULT 'unknown',
    "slope" DECIMAL(5,2),
    "width_m" DECIMAL(5,2),
    CONSTRAINT "ramps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "accessible_routes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "origin" geometry(Point, 4326) NOT NULL,
    "destination" geometry(Point, 4326) NOT NULL,
    "path" geometry(LineString, 4326) NOT NULL,
    "status" "route_status" NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "accessible_routes_pkey" PRIMARY KEY ("id")
);

-- ───────────────────────────── Rules engine ─────────────────────────────

CREATE TABLE "rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "conditions" JSONB NOT NULL,
    "action" JSONB NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rules_pkey" PRIMARY KEY ("id")
);

-- ───────────────────────────── Indexes ─────────────────────────────

CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

CREATE UNIQUE INDEX "devices_device_code_key" ON "devices"("device_code");
CREATE INDEX "devices_type_idx" ON "devices"("type");
CREATE INDEX "devices_status_idx" ON "devices"("status");
CREATE INDEX "devices_geom_idx" ON "devices" USING GIST ("geom");

CREATE UNIQUE INDEX "cameras_device_id_key" ON "cameras"("device_id");

CREATE UNIQUE INDEX "drains_device_id_key" ON "drains"("device_id");
CREATE INDEX "drains_geom_idx" ON "drains" USING GIST ("geom");

CREATE UNIQUE INDEX "sensor_readings_device_id_recorded_at_key" ON "sensor_readings"("device_id", "recorded_at");

CREATE INDEX "heartbeats_device_id_received_at_idx" ON "heartbeats"("device_id", "received_at" DESC);

CREATE INDEX "incidents_status_idx" ON "incidents"("status");
CREATE INDEX "incidents_priority_idx" ON "incidents"("priority");
CREATE INDEX "incidents_type_idx" ON "incidents"("type");
CREATE INDEX "incidents_created_at_idx" ON "incidents"("created_at" DESC);
CREATE INDEX "incidents_device_id_idx" ON "incidents"("device_id");
CREATE INDEX "incidents_assigned_to_idx" ON "incidents"("assigned_to");
CREATE INDEX "incidents_geom_idx" ON "incidents" USING GIST ("geom");

CREATE INDEX "incident_events_incident_id_created_at_idx" ON "incident_events"("incident_id", "created_at");

CREATE INDEX "accessibility_points_type_idx" ON "accessibility_points"("type");
CREATE INDEX "accessibility_points_geom_idx" ON "accessibility_points" USING GIST ("geom");

CREATE INDEX "ramps_accessibility_point_id_idx" ON "ramps"("accessibility_point_id");
CREATE INDEX "ramps_geom_idx" ON "ramps" USING GIST ("geom");

CREATE INDEX "accessible_routes_origin_idx" ON "accessible_routes" USING GIST ("origin");
CREATE INDEX "accessible_routes_destination_idx" ON "accessible_routes" USING GIST ("destination");
CREATE INDEX "accessible_routes_path_idx" ON "accessible_routes" USING GIST ("path");

CREATE UNIQUE INDEX "rules_name_key" ON "rules"("name");
CREATE INDEX "rules_enabled_sort_order_idx" ON "rules"("enabled", "sort_order");

-- ───────────────────────────── Foreign keys ─────────────────────────────

ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cameras" ADD CONSTRAINT "cameras_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "drains" ADD CONSTRAINT "drains_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "sensor_readings" ADD CONSTRAINT "sensor_readings_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "heartbeats" ADD CONSTRAINT "heartbeats_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "incident_events" ADD CONSTRAINT "incident_events_incident_id_fkey" FOREIGN KEY ("incident_id") REFERENCES "incidents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ramps" ADD CONSTRAINT "ramps_accessibility_point_id_fkey" FOREIGN KEY ("accessibility_point_id") REFERENCES "accessibility_points"("id") ON DELETE SET NULL ON UPDATE CASCADE;
