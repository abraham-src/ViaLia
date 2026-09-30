import type { RoleName, WsChannel, WsControlMessage, WsMessage } from '@simu/shared-types';
import { WS_CHANNELS, WS_CHANNELS_BY_ROLE } from '@simu/shared-types';
import type { FastifyBaseLogger } from 'fastify';
import { WebSocket } from 'ws';
import { z } from 'zod';

const ClientMessage = z.union([
  z.object({ subscribe: z.enum(WS_CHANNELS) }).strict(),
  z.object({ unsubscribe: z.enum(WS_CHANNELS) }).strict(),
  z.object({ ping: z.literal(true) }).strict(),
]);

interface Client {
  userId: string;
  role: RoleName;
  channels: Set<WsChannel>;
  alive: boolean;
}

export interface Publisher {
  publish<T>(channel: WsChannel, event: string, data: T): void;
}

/**
 * In-process pub/sub over WebSocket. One hub per API instance (sufficient for the
 * prototype; a multi-instance deployment would put Redis/pg NOTIFY behind `publish`).
 */
export class WsHub implements Publisher {
  private readonly clients = new Map<WebSocket, Client>();
  private readonly pingTimer: NodeJS.Timeout;

  constructor(
    private readonly log: FastifyBaseLogger,
    pingIntervalMs = 30_000,
  ) {
    // Drop connections that stopped answering pings (laptop sleep, network loss).
    this.pingTimer = setInterval(() => this.sweep(), pingIntervalMs);
    this.pingTimer.unref();
  }

  get size(): number {
    return this.clients.size;
  }

  add(socket: WebSocket, user: { id: string; role: RoleName }): void {
    const client: Client = { userId: user.id, role: user.role, channels: new Set(), alive: true };
    this.clients.set(socket, client);

    socket.on('pong', () => {
      client.alive = true;
    });
    socket.on('message', (raw) => this.onMessage(socket, client, raw.toString()));
    socket.on('close', () => this.clients.delete(socket));
    socket.on('error', (err) => {
      this.log.warn({ err: err.message }, 'ws client error');
      this.clients.delete(socket);
    });

    this.send(socket, {
      type: 'welcome',
      allowed_channels: [...WS_CHANNELS_BY_ROLE[user.role]],
      ts: new Date().toISOString(),
    });
  }

  publish<T>(channel: WsChannel, event: string, data: T): void {
    const message: WsMessage<T> = { channel, event, data, ts: new Date().toISOString() };
    const frame = JSON.stringify(message);
    for (const [socket, client] of this.clients) {
      if (client.channels.has(channel) && socket.readyState === WebSocket.OPEN) {
        socket.send(frame);
      }
    }
  }

  close(): void {
    clearInterval(this.pingTimer);
    for (const socket of this.clients.keys()) socket.close(1001, 'server shutting down');
    this.clients.clear();
  }

  private onMessage(socket: WebSocket, client: Client, raw: string): void {
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return this.error(socket, 'Mensaje no es JSON válido');
    }
    const parsed = ClientMessage.safeParse(json);
    if (!parsed.success) {
      return this.error(socket, 'Mensaje no reconocido. Usa {"subscribe": "<canal>"}');
    }
    const msg = parsed.data;
    const ts = new Date().toISOString();

    if ('ping' in msg) return this.send(socket, { type: 'pong', ts });

    if ('subscribe' in msg) {
      if (!WS_CHANNELS_BY_ROLE[client.role].includes(msg.subscribe)) {
        return this.error(socket, `Tu rol no puede suscribirse a ${msg.subscribe}`);
      }
      client.channels.add(msg.subscribe);
      return this.send(socket, { type: 'subscribed', channel: msg.subscribe, ts });
    }

    client.channels.delete(msg.unsubscribe);
    this.send(socket, { type: 'unsubscribed', channel: msg.unsubscribe, ts });
  }

  private sweep(): void {
    for (const [socket, client] of this.clients) {
      if (!client.alive) {
        socket.terminate();
        this.clients.delete(socket);
        continue;
      }
      client.alive = false;
      socket.ping();
    }
  }

  private error(socket: WebSocket, message: string): void {
    this.send(socket, { type: 'error', message, ts: new Date().toISOString() });
  }

  private send(socket: WebSocket, message: WsControlMessage): void {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }
}
