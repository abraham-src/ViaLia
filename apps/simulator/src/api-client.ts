import type { IngestEvent, IngestResult } from '@simu/shared-types';

/** Thrown when the (simulated) Internet link is down. */
export class NetworkDownError extends Error {
  constructor(message = 'Sin Internet (simulado)') {
    super(message);
    this.name = 'NetworkDownError';
  }
}

/** Non-2xx answer from the API. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

/**
 * Simulated uplink. The demo can force it OFF for N seconds (spec §6.1 demo mode);
 * real failures (API stopped, timeouts) are handled by the same retry path.
 */
export class Connectivity {
  private offlineUntil: number | null = null;

  constructor(private readonly now: () => number = Date.now) {}

  isOnline(): boolean {
    if (this.offlineUntil !== null && this.now() >= this.offlineUntil) this.offlineUntil = null;
    return this.offlineUntil === null;
  }

  goOffline(seconds: number): void {
    this.offlineUntil = this.now() + seconds * 1000;
  }

  goOnline(): void {
    this.offlineUntil = null;
  }

  /** Seconds until the link comes back, or 0 when online. */
  remainingSeconds(): number {
    return this.isOnline() ? 0 : Math.ceil(((this.offlineUntil ?? 0) - this.now()) / 1000);
  }
}

export type IngestSender = (events: IngestEvent[]) => Promise<IngestResult>;

export class ApiClient {
  constructor(
    private readonly baseUrl: string,
    private readonly deviceKey: string,
    private readonly connectivity: Connectivity,
    private readonly timeoutMs = 8000,
  ) {}

  /** POST /events/ingest. Throws NetworkDownError, HttpError or a fetch error. */
  readonly ingest: IngestSender = async (events) => {
    if (!this.connectivity.isOnline()) throw new NetworkDownError();
    const res = await fetch(new URL('/events/ingest', this.baseUrl), {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-device-key': this.deviceKey },
      body: JSON.stringify({ events }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new HttpError(res.status, `API respondió ${res.status}: ${text.slice(0, 300)}`);
    }
    return (await res.json()) as IngestResult;
  };

  async isApiHealthy(): Promise<boolean> {
    if (!this.connectivity.isOnline()) return false;
    try {
      const res = await fetch(new URL('/health', this.baseUrl), {
        signal: AbortSignal.timeout(3000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
