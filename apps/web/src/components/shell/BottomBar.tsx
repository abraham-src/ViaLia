import type { WsChannel } from '@simu/shared-types';
import { Activity, ChevronDown, ChevronUp, Pause, Play, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { FeedItem, FeedSeverity } from '../../lib/describe-event';
import { formatTime } from '../../lib/format';
import { useLive } from '../../stores/live';
import { useUi } from '../../stores/ui';

export const SEVERITY_TEXT: Record<FeedSeverity, string> = {
  info: 'text-fg-muted',
  ok: 'text-ok',
  warn: 'text-warn',
  danger: 'text-critical',
  critical: 'text-critical',
};

const CHANNEL_LABEL: Record<WsChannel, string> = {
  alerts: 'Alertas',
  incidents: 'Incidencias',
  'drain-readings': 'Coladeras',
  'camera-events': 'Cámaras',
  'devices:status': 'Dispositivos',
  heartbeats: 'Heartbeats',
};
const FILTERABLE: WsChannel[] = [
  'alerts',
  'incidents',
  'drain-readings',
  'camera-events',
  'devices:status',
];

function Row({ item }: { item: FeedItem }) {
  return (
    <li className="grid animate-fade-in grid-cols-[64px_96px_84px_1fr] items-baseline gap-3 px-3 py-0.5">
      <time className="text-fg-muted" title={item.ts}>
        {formatTime(item.ts)}
      </time>
      <span className="truncate text-fg-muted">{CHANNEL_LABEL[item.channel]}</span>
      <span className="truncate text-fg">{item.subject}</span>
      <span className={`truncate ${SEVERITY_TEXT[item.severity]}`} title={item.text}>
        {item.text}
      </span>
    </li>
  );
}

/**
 * Live timeline (spec §7.1 bottom bar, §7.4). Collapsed: latest events in one strip.
 * Expanded: full scrollable timeline with channel filters, pause and clear.
 */
export function BottomBar() {
  const feed = useLive((s) => s.feed);
  const heartbeats = useLive((s) => s.heartbeatCount);
  const lastHeartbeat = useLive((s) => s.lastHeartbeatAt);
  const clear = useLive((s) => s.reset);
  const open = useUi((s) => s.timelineOpen);
  const setOpen = useUi((s) => s.setTimelineOpen);
  const [channels, setChannels] = useState<Set<WsChannel>>(new Set());
  const [frozen, setFrozen] = useState<FeedItem[] | null>(null);

  const source = frozen ?? feed;
  const visible = channels.size === 0 ? source : source.filter((i) => channels.has(i.channel));
  const toggle = (c: WsChannel) => {
    const next = new Set(channels);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setChannels(next);
  };

  const header = (
    <div className="flex h-7 shrink-0 items-center gap-3 px-3">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex shrink-0 items-center gap-1.5 uppercase tracking-wider text-fg-muted hover:text-fg"
      >
        <Activity size={12} strokeWidth={1.5} aria-hidden /> Eventos
        {open ? <ChevronDown size={12} aria-hidden /> : <ChevronUp size={12} aria-hidden />}
      </button>
      {open ? (
        <div className="flex min-w-0 flex-1 items-center gap-1">
          {FILTERABLE.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={channels.has(c)}
              onClick={() => toggle(c)}
              className={`rounded-sm border px-1.5 leading-4 ${
                channels.has(c)
                  ? 'border-accent bg-accent/15 text-fg'
                  : 'border-line text-fg-muted hover:text-fg'
              }`}
            >
              {CHANNEL_LABEL[c]}
            </button>
          ))}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => setFrozen(frozen ? null : feed)}
            className="inline-flex items-center gap-1 rounded-sm border border-line px-1.5 leading-4 text-fg-muted hover:text-fg"
          >
            {frozen ? <Play size={11} aria-hidden /> : <Pause size={11} aria-hidden />}
            {frozen ? `Reanudar (${feed.length - frozen.length} nuevos)` : 'Pausar'}
          </button>
          <button
            type="button"
            onClick={() => {
              clear();
              setFrozen(null);
            }}
            className="inline-flex items-center gap-1 rounded-sm border border-line px-1.5 leading-4 text-fg-muted hover:text-fg"
          >
            <Trash2 size={11} aria-hidden /> Limpiar
          </button>
        </div>
      ) : (
        <ol className="flex min-w-0 flex-1 items-center gap-5 overflow-hidden" aria-live="polite">
          {feed.length === 0 && <li className="text-fg-muted">Esperando eventos en vivo…</li>}
          {feed.slice(0, 4).map((item) => (
            <li
              key={item.id}
              className="flex shrink-0 animate-fade-in items-center gap-2 whitespace-nowrap"
            >
              <time className="text-fg-muted">{formatTime(item.ts)}</time>
              <span className="text-fg">{item.subject}</span>
              <span className={SEVERITY_TEXT[item.severity]}>{item.text}</span>
            </li>
          ))}
        </ol>
      )}
      <span className="shrink-0 text-fg-muted" title="Heartbeats recibidos en esta sesión">
        HB {heartbeats} · último {formatTime(lastHeartbeat)}
      </span>
    </div>
  );

  return (
    <footer
      className={`col-span-2 flex flex-col border-t border-line bg-surface font-mono text-[11px] ${open ? 'h-60' : 'h-7'}`}
    >
      {header}
      {open && (
        <ol className="min-h-0 flex-1 overflow-auto border-t border-line py-1" aria-live="polite">
          {visible.length === 0 ? (
            <li className="px-3 py-1 text-fg-muted">Sin eventos para estos filtros.</li>
          ) : (
            visible.map((item) => <Row key={item.id} item={item} />)
          )}
        </ol>
      )}
    </footer>
  );
}
