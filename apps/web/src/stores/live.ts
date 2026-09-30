import type { AlertEvent } from '@simu/shared-types';
import { create } from 'zustand';
import type { FeedItem } from '../lib/describe-event';

const MAX_FEED = 300;
const MAX_ALERTS = 50;

export interface ReceivedAlert extends AlertEvent {
  ts: string;
}

interface LiveState {
  /** Newest first. Heartbeats are counted but only non-routine events are kept. */
  feed: FeedItem[];
  alerts: ReceivedAlert[];
  heartbeatCount: number;
  lastHeartbeatAt: string | null;
  push(item: FeedItem): void;
  pushAlert(alert: ReceivedAlert): void;
  heartbeat(ts: string): void;
  reset(): void;
}

export const useLive = create<LiveState>((set) => ({
  feed: [],
  alerts: [],
  heartbeatCount: 0,
  lastHeartbeatAt: null,
  push: (item) => set((s) => ({ feed: [item, ...s.feed].slice(0, MAX_FEED) })),
  pushAlert: (alert) => set((s) => ({ alerts: [alert, ...s.alerts].slice(0, MAX_ALERTS) })),
  heartbeat: (ts) => set((s) => ({ heartbeatCount: s.heartbeatCount + 1, lastHeartbeatAt: ts })),
  reset: () => set({ feed: [], alerts: [], heartbeatCount: 0, lastHeartbeatAt: null }),
}));
