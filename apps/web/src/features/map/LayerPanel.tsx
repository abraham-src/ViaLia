import { LAYER_KEYS, LAYER_META, type LayerKey, type LayerMeta } from './layers';
import { useMapUi } from './store';
import { COLORS } from './icons';

const GROUPS: LayerMeta['group'][] = ['Infraestructura', 'Riesgo', 'Accesibilidad', 'Estado'];

/** Legend rows: color always paired with a text label. */
const LEGEND: Array<{ title: string; items: Array<[string, string]> }> = [
  {
    title: 'Dispositivos',
    items: [
      [COLORS.ok, 'En línea'],
      [COLORS.warn, 'Degradado'],
      [COLORS.danger, 'Fuera de línea'],
      [COLORS.maintenance, 'Mantenimiento'],
    ],
  },
  {
    title: 'Coladeras',
    items: [
      [COLORS.accent, 'Normal < 50 %'],
      [COLORS.warn, 'Precaución 50–80 %'],
      [COLORS.danger, 'Alerta > 80 %'],
      [COLORS.critical, 'Crítico > 90 %'],
    ],
  },
  {
    title: 'Incidencias (rombo)',
    items: [
      [COLORS.muted, 'Baja'],
      [COLORS.accent, 'Media'],
      [COLORS.warn, 'Alta'],
      [COLORS.critical, 'Crítica'],
    ],
  },
];

export function LayerPanel({
  counts,
  staff,
}: {
  counts: Partial<Record<LayerKey, number>>;
  staff: boolean;
}) {
  const visible = useMapUi((s) => s.visible);
  const toggle = useMapUi((s) => s.toggle);

  return (
    <aside
      className="flex min-h-0 flex-col overflow-auto border-r border-line bg-surface"
      aria-label="Capas del mapa"
    >
      <div className="flex h-8 shrink-0 items-center border-b border-line bg-surface-2 px-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wider text-fg-muted">Capas</h2>
      </div>
      {GROUPS.map((group) => {
        const keys = LAYER_KEYS.filter(
          (k) => LAYER_META[k].group === group && (staff || !LAYER_META[k].staffOnly),
        );
        if (keys.length === 0) return null;
        return (
          <div
            key={group}
            role="group"
            aria-label={group}
            className="border-b border-line px-3 py-2"
          >
            <div className="mb-1 text-[10px] uppercase tracking-wider text-fg-muted" aria-hidden>
              {group}
            </div>
            {keys.map((key) => {
              const meta = LAYER_META[key];
              return (
                <label
                  key={key}
                  className="flex cursor-pointer items-center gap-2 py-0.5 hover:text-fg"
                >
                  <input
                    type="checkbox"
                    checked={visible[key]}
                    onChange={() => toggle(key)}
                    className="size-3.5 accent-[#1f6feb]"
                  />
                  <span className="size-2" style={{ background: meta.swatch }} aria-hidden />
                  <span className="flex-1 text-[12px]">{meta.label}</span>
                  <span className="font-mono text-[11px] text-fg-muted">{counts[key] ?? '—'}</span>
                </label>
              );
            })}
          </div>
        );
      })}
      <div className="space-y-2 px-3 py-2">
        {LEGEND.filter((l) => staff || l.title.startsWith('Incidencias')).map((l) => (
          <div key={l.title}>
            <div className="mb-0.5 text-[10px] uppercase tracking-wider text-fg-muted">
              {l.title}
            </div>
            <ul className="grid grid-cols-2 gap-x-2 gap-y-0.5">
              {l.items.map(([color, label]) => (
                <li key={label} className="flex items-center gap-1.5 text-[11px] text-fg-muted">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: color }}
                    aria-hidden
                  />
                  {label}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </aside>
  );
}
