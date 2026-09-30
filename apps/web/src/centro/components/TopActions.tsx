import { Bell, Droplets, MapPinned, Search, TriangleAlert, Video, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { formatAge } from '../../lib/format';
import { DEVICE_TYPE_LABEL, ROLE_LABEL } from '../../lib/labels';
import { useLive } from '../../stores/live';
import { useCxData } from '../data/useCxData';
import { ringCenter } from '../lib/geo';
import { INCIDENT_VISUAL, PRIORITY_COLOR, initials } from '../lib/visuals';
import { useMapFocus } from './focus';

interface Result {
  key: string;
  label: string;
  hint: string;
  icon: typeof Search;
  color: string;
  go: () => void;
}

/** Búsqueda local sobre lo que ya está cargado: incidencias, dispositivos y zonas. */
export function SearchBox({ className = '' }: { className?: string }) {
  const data = useCxData();
  const navigate = useNavigate();
  const focus = useMapFocus((s) => s.focus);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  const results = useMemo<Result[]>(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2) return [];
    const has = (...xs: Array<string | null | undefined>) =>
      xs.some((x) => x?.toLowerCase().includes(term));
    const out: Result[] = [];
    for (const i of data.incidents) {
      if (has(INCIDENT_VISUAL[i.type].title, i.description, i.device_code, i.id.slice(0, 8))) {
        out.push({
          key: `i-${i.id}`,
          label: INCIDENT_VISUAL[i.type].title,
          hint: `${i.device_code ?? 'Reporte ciudadano'} · ${formatAge(i.created_at)}`,
          icon: TriangleAlert,
          color: PRIORITY_COLOR[i.priority],
          go: () => navigate(`/centro/incidencias/${i.id}`),
        });
      }
    }
    for (const d of data.devices) {
      if (has(d.device_code, d.name, d.camera?.location_description)) {
        out.push({
          key: `d-${d.device_code}`,
          label: `${d.device_code} · ${d.name}`,
          hint: DEVICE_TYPE_LABEL[d.type],
          icon: d.type === 'camera' ? Video : d.type === 'drain' ? Droplets : MapPinned,
          color: '#2563eb',
          go: () => {
            focus({ center: [d.longitude, d.latitude], zoom: 17, label: d.device_code });
            navigate('/centro');
          },
        });
      }
    }
    for (const z of data.zoneList) {
      if (has(z.name, z.code, z.alcaldia)) {
        const c = ringCenter(z.ring);
        out.push({
          key: `z-${z.code}`,
          label: z.name,
          hint: `Zona ${z.code}${z.alcaldia ? ` · ${z.alcaldia}` : ''}`,
          icon: MapPinned,
          color: '#0b1b34',
          go: () => {
            focus({ center: [c[0], c[1]], zoom: 15, label: z.name });
            navigate('/centro');
          },
        });
      }
    }
    return out.slice(0, 8);
  }, [q, data, navigate, focus]);

  return (
    <div ref={box} className={`relative ${className}`}>
      <label className="flex h-11 w-[300px] items-center gap-2.5 rounded-[14px] border border-cx-line bg-white px-3.5 shadow-cx focus-within:border-cx-blue/50">
        <Search size={18} strokeWidth={2.1} className="shrink-0 text-cx-ink3" aria-hidden />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && results[0]) {
              results[0].go();
              setOpen(false);
            }
            if (e.key === 'Escape') setOpen(false);
          }}
          placeholder="Buscar calle, colonia o ID…"
          className="min-w-0 flex-1 bg-transparent text-[13.5px] text-cx-ink outline-none placeholder:text-cx-ink3"
          aria-label="Buscar"
        />
        {q && (
          <button type="button" onClick={() => setQ('')} aria-label="Limpiar búsqueda">
            <X size={15} className="text-cx-ink3" />
          </button>
        )}
      </label>
      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[360px] overflow-hidden rounded-[16px] border border-cx-line bg-white p-1.5 shadow-cx-lg">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-[13px] text-cx-ink3">
              Sin resultados para “{q}”.
            </p>
          ) : (
            results.map((r) => (
              <button
                key={r.key}
                type="button"
                onClick={() => {
                  r.go();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left hover:bg-cx-line2"
              >
                <span
                  className="grid size-8 shrink-0 place-items-center rounded-full"
                  style={{ background: `${r.color}16`, color: r.color }}
                >
                  <r.icon size={16} strokeWidth={2.2} />
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-[13.5px] font-semibold text-cx-ink">
                    {r.label}
                  </span>
                  <span className="block truncate text-[12px] text-cx-ink3">{r.hint}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function AlertsBell() {
  const alerts = useLive((s) => s.alerts);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const unseen = Math.max(0, alerts.length - seen);
  const navigate = useNavigate();
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => {
          setOpen(!open);
          setSeen(alerts.length);
        }}
        className="relative grid size-11 place-items-center rounded-full border border-cx-line bg-white text-cx-ink shadow-cx hover:text-cx-blue"
        aria-label={`Alertas${unseen ? `: ${unseen} nuevas` : ''}`}
      >
        <Bell size={19} strokeWidth={2.1} />
        {unseen > 0 && (
          <span className="absolute right-2 top-2 size-2.5 rounded-full border-2 border-white bg-cx-critical" />
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[340px] rounded-[16px] border border-cx-line bg-white p-2 shadow-cx-lg">
          <div className="px-2 pb-1 pt-1 text-[12px] font-semibold uppercase tracking-wide text-cx-ink3">
            Alertas en vivo
          </div>
          {alerts.length === 0 ? (
            <p className="px-2 py-4 text-[13px] text-cx-ink3">
              Sin alertas desde que abriste el centro. Las del motor de reglas llegan aquí al
              momento.
            </p>
          ) : (
            alerts.slice(0, 6).map((a) => (
              <button
                key={`${a.incident_id}-${a.ts}`}
                type="button"
                onClick={() => {
                  setOpen(false);
                  navigate(`/centro/incidencias/${a.incident_id}`);
                }}
                className="flex w-full gap-3 rounded-[12px] px-2 py-2 text-left hover:bg-cx-line2"
              >
                <span
                  className="mt-1 size-2.5 shrink-0 rounded-full"
                  style={{ background: PRIORITY_COLOR[a.priority] }}
                />
                <span className="min-w-0">
                  <span className="block text-[13px] font-semibold text-cx-ink">{a.label}</span>
                  <span className="line-clamp-2 block text-[12px] text-cx-ink2">{a.message}</span>
                  <span className="block text-[11px] text-cx-ink3">{formatAge(a.ts)}</span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function Avatar() {
  const { user } = useCxData();
  return (
    <div
      className="grid size-11 place-items-center rounded-full bg-gradient-to-br from-[#13284b] to-[#0b1b34] text-[14px] font-bold text-white shadow-cx"
      title={user ? `${user.name} · ${ROLE_LABEL[user.role]}` : undefined}
    >
      {initials(user?.name)}
    </div>
  );
}

export function TopActions({ search = true }: { search?: boolean }) {
  return (
    <>
      {search && <SearchBox />}
      <AlertsBell />
      <Avatar />
    </>
  );
}
