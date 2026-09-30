import type { AnalyzeRequest, AnalyzeResponse, CameraEventType } from '@simu/shared-types';
import { CAMERA_EVENT_TYPES } from '@simu/shared-types';
import { z } from 'zod';
import { notFound } from '../lib/errors.js';
import { asObject } from '../lib/serialize.js';
import type { ServiceContext } from './context.js';
import { DEFAULT_CAMERA_PRIORITY, ingestCameraEvent } from './events.js';

type Detection = AnalyzeResponse['detection'];

/** Shape returned by apps/ai-service (validated: the service is outside our trust boundary). */
const AiServiceResponse = z.object({
  device_id: z.string(),
  event_type: z.enum(CAMERA_EVENT_TYPES),
  confidence: z.number().min(0).max(1),
  location_id: z.string().nullable(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']),
  analyzed_at: z.string(),
});

const round3 = (n: number): number => Math.round(n * 1000) / 1000;

/**
 * Internal mock. Only infrastructure classes exist: the pipeline never detects or
 * identifies people, faces or plates (privacy by design).
 */
function mockDetection(
  req: AnalyzeRequest,
  locationId: string | null,
  backend: 'mock' | 'mock-fallback',
): Detection {
  const eventType: CameraEventType =
    req.hint ?? CAMERA_EVENT_TYPES[Math.floor(Math.random() * CAMERA_EVENT_TYPES.length)]!;
  // A forced class (demo) is confident enough to act on; random ones span the threshold.
  const confidence = req.hint ? 0.85 + Math.random() * 0.13 : 0.45 + Math.random() * 0.53;
  return {
    device_id: req.device_id,
    event_type: eventType,
    confidence: round3(confidence),
    location_id: locationId,
    priority: DEFAULT_CAMERA_PRIORITY[eventType].toUpperCase() as Detection['priority'],
    analyzed_at: new Date().toISOString(),
    backend,
  };
}

async function callAiService(
  url: string,
  req: AnalyzeRequest,
  locationId: string | null,
): Promise<Detection> {
  const res = await fetch(new URL('/ai/analyze', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      device_id: req.device_id,
      location_id: locationId,
      frame_ref: req.frame_ref ?? null,
      hint: req.hint ?? null,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`ai-service respondió ${res.status}`);
  const body = AiServiceResponse.parse(await res.json());
  // The camera identity comes from our validated request, never from the external reply.
  return { ...body, device_id: req.device_id, backend: 'ai-service' };
}

/**
 * POST /ai/analyze: proxies to ai-service when AI_SERVICE_URL is set, otherwise (or when
 * it is down) uses the internal mock. By default the detection is also ingested as a
 * camera event, which may create an incident and trigger the rules engine.
 */
export async function analyze(ctx: ServiceContext, req: AnalyzeRequest): Promise<AnalyzeResponse> {
  const camera = await ctx.prisma.device.findUnique({ where: { deviceCode: req.device_id } });
  if (!camera || camera.type !== 'camera') throw notFound(`Cámara ${req.device_id}`);
  const zone = asObject(camera.metadata).zone;
  const locationId = req.location_id ?? (typeof zone === 'string' ? zone : null);

  let detection: Detection;
  if (ctx.config.AI_SERVICE_URL) {
    try {
      detection = await callAiService(ctx.config.AI_SERVICE_URL, req, locationId);
    } catch (err) {
      ctx.log.warn({ err: (err as Error).message }, 'ai-service unavailable, using mock');
      detection = mockDetection(req, locationId, 'mock-fallback');
    }
  } else {
    detection = mockDetection(req, locationId, 'mock');
  }

  const ingested =
    req.ingest === false
      ? null
      : await ingestCameraEvent(ctx, {
          deviceCode: detection.device_id,
          eventType: detection.event_type,
          confidence: detection.confidence,
          locationId: detection.location_id ?? undefined,
          priority: detection.priority.toLowerCase() as Lowercase<Detection['priority']>,
          recordedAt: new Date(detection.analyzed_at),
        });

  return { detection, ingested };
}
