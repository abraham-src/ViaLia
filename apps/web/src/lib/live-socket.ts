import type { WsChannel, WsControlMessage, WsMessage } from '@simu/shared-types';

export type LiveMessage = WsMessage | WsControlMessage;
type Listener = (msg: WsMessage) => void;
type StatusListener = (status: 'connecting' | 'open' | 'reconnecting') => void;

const MAX_BACKOFF_MS = 30_000;

/**
 * Single WebSocket to /ws with automatic reconnection (exponential backoff) and
 * re-subscription. The access token is requested fresh on every (re)connect, so an
 * expired token is replaced transparently.
 */
export class LiveSocket {
  private ws: WebSocket | null = null;
  private wanted = new Set<WsChannel>();
  private allowed: Set<WsChannel> | null = null;
  private listeners = new Set<Listener>();
  private statusListeners = new Set<StatusListener>();
  private attempts = 0;
  private timer: number | null = null;
  private pingTimer: number | null = null;
  private stopped = true;

  constructor(private readonly getToken: (forceRefresh: boolean) => Promise<string | null>) {}

  start(channels: readonly WsChannel[]): void {
    for (const c of channels) this.wanted.add(c);
    if (!this.stopped) {
      this.flushSubscriptions();
      return;
    }
    this.stopped = false;
    void this.connect();
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) window.clearTimeout(this.timer);
    if (this.pingTimer) window.clearInterval(this.pingTimer);
    this.ws?.close(1000, 'logout');
    this.ws = null;
    this.wanted.clear();
    this.allowed = null;
  }

  onMessage(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onStatus(listener: StatusListener): () => void {
    this.statusListeners.add(listener);
    return () => this.statusListeners.delete(listener);
  }

  private emitStatus(s: 'connecting' | 'open' | 'reconnecting'): void {
    for (const l of this.statusListeners) l(s);
  }

  private async connect(): Promise<void> {
    if (this.stopped) return;
    this.emitStatus(this.attempts === 0 ? 'connecting' : 'reconnecting');
    // After repeated failures the token may have expired: force a refresh.
    const token = await this.getToken(this.attempts >= 2).catch(() => null);
    if (this.stopped) return;
    if (!token) return this.scheduleReconnect();

    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    this.ws = ws;

    ws.onopen = () => {
      this.attempts = 0;
      this.emitStatus('open');
      this.pingTimer = window.setInterval(() => this.send({ ping: true }), 25_000);
    };
    ws.onmessage = (e) => {
      let msg: LiveMessage;
      try {
        msg = JSON.parse(String(e.data)) as LiveMessage;
      } catch {
        return;
      }
      if ('type' in msg) {
        if (msg.type === 'welcome') {
          this.allowed = new Set(msg.allowed_channels);
          this.flushSubscriptions();
        }
        return;
      }
      for (const l of this.listeners) l(msg);
    };
    ws.onclose = () => {
      if (this.pingTimer) window.clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.ws === ws) this.ws = null;
      if (!this.stopped) this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    this.attempts += 1;
    this.emitStatus('reconnecting');
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** Math.min(this.attempts - 1, 5));
    this.timer = window.setTimeout(() => void this.connect(), delay);
  }

  private flushSubscriptions(): void {
    for (const c of this.wanted) {
      if (!this.allowed || this.allowed.has(c)) this.send({ subscribe: c });
    }
  }

  private send(payload: object): void {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(payload));
  }
}
