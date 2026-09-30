-- Phase 3: camera detections and weather reports (rules engine facts, GET /events).

CREATE TABLE "device_events" (
    "id" BIGSERIAL NOT NULL,
    "device_id" UUID NOT NULL,
    "event_type" TEXT NOT NULL,
    "confidence" DECIMAL(4,3),
    "payload" JSONB NOT NULL DEFAULT '{}',
    "recorded_at" TIMESTAMPTZ(3) NOT NULL,
    "received_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "synced" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "device_events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "device_events_confidence_check" CHECK ("confidence" IS NULL OR "confidence" BETWEEN 0 AND 1)
);

CREATE UNIQUE INDEX "device_events_device_id_event_type_recorded_at_key" ON "device_events"("device_id", "event_type", "recorded_at");
CREATE INDEX "device_events_recorded_at_idx" ON "device_events"("recorded_at" DESC);
CREATE INDEX "device_events_event_type_recorded_at_idx" ON "device_events"("event_type", "recorded_at" DESC);

ALTER TABLE "device_events" ADD CONSTRAINT "device_events_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
