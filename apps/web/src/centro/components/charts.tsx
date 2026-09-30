import { useId, useMemo, useState, type PointerEvent, type ReactNode } from 'react';
import type { Comparison, RunResult } from '../sim/intersection';

/**
 * Gráficas del centro (SVG a mano). Reglas del skill de visualización:
 * forma de énfasis (acento + gris), barras delgadas con punta redondeada y base recta,
 * retícula de línea fina sólida, un solo eje por gráfica (nada de doble eje),
 * etiquetas selectivas en tinta (nunca en el color de la serie), tooltip al pasar
 * el puntero y tabla equivalente para no depender del color.
 */

export const SERIES = {
  fixed: { label: 'Ciclo fijo', color: '#7d8aa0' },
  adaptive: { label: 'Adaptativo', color: '#1f5fa6' },
} as const;

const INK = '#143254';
const MUTED = '#8591a6';
const GRID = '#e6ebf2';
const BASE = '#c9d2de';

function Tooltip({
  x,
  y,
  children,
}: {
  x: number | string;
  y: number | string;
  children: ReactNode;
}) {
  return (
    <div
      className="pointer-events-none absolute z-10 min-w-[140px] -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-[12px] border border-cx-line bg-white px-3 py-2 text-[12px] shadow-cx-lg"
      style={{ left: x, top: y }}
      role="status"
    >
      {children}
    </div>
  );
}

export function Legend({
  items,
}: {
  items: ReadonlyArray<{ label: string; color: string; kind?: 'bar' | 'line' }>;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 text-[12.5px] text-cx-ink2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.kind === 'line' ? (
            <span className="h-[2px] w-4 rounded-full" style={{ background: i.color }} />
          ) : (
            <span className="size-2.5 rounded-[3px]" style={{ background: i.color }} />
          )}
          {i.label}
        </span>
      ))}
    </div>
  );
}

const METRICS: ReadonlyArray<{
  key: keyof RunResult;
  label: string;
  unit: string;
  better: 'low' | 'high';
}> = [
  { key: 'avgWait', label: 'Espera promedio por vehículo', unit: 's', better: 'low' },
  { key: 'maxQueue', label: 'Cola máxima en un acceso', unit: 'veh.', better: 'low' },
  { key: 'avgPedWait', label: 'Espera promedio de peatones', unit: 's', better: 'low' },
];

/** Múltiplos pequeños: una fila por métrica, cada una con su propia escala. */
export function ComparisonBars({ result }: { result: Comparison }) {
  const [tip, setTip] = useState<{
    x: number;
    y: number;
    title: string;
    mean: number;
    sd: number;
    unit: string;
  } | null>(null);
  const W = 440;
  const LABEL_W = 0;
  const ROW_H = 58;
  const BAR = 16;
  const H = METRICS.length * (ROW_H + 26);
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full"
        role="img"
        aria-label="Comparación ciclo fijo contra adaptativo"
      >
        {METRICS.map((m, row) => {
          const f = result.fixed[m.key];
          const a = result.adaptive[m.key];
          const max = Math.max(f.mean + f.sd, a.mean + a.sd) * 1.18 || 1;
          const top = row * (ROW_H + 26);
          const plotW = W - LABEL_W - 70;
          const x = (v: number) => LABEL_W + (v / max) * plotW;
          return (
            <g key={m.key} transform={`translate(0 ${top})`}>
              <text x="0" y="14" fontSize="13" fontWeight="700" fill={INK} fontFamily="inherit">
                {m.label}
              </text>
              <line
                x1={LABEL_W}
                x2={LABEL_W}
                y1="24"
                y2={24 + ROW_H - 8}
                stroke={BASE}
                strokeWidth="1"
              />
              {(['fixed', 'adaptive'] as const).map((k, i) => {
                const s = result[k][m.key];
                const y = 28 + i * (BAR + 6);
                const w = Math.max(2, x(s.mean) - LABEL_W);
                const r = Math.min(4, w / 2);
                return (
                  <g
                    key={k}
                    tabIndex={0}
                    onPointerMove={(e: PointerEvent<SVGGElement>) => {
                      const box = (
                        e.currentTarget.ownerSVGElement as SVGSVGElement
                      ).getBoundingClientRect();
                      setTip({
                        x: ((LABEL_W + w / 2) / W) * box.width,
                        y: ((top + y) / H) * box.height,
                        title: `${SERIES[k].label} · ${m.label.toLowerCase()}`,
                        mean: s.mean,
                        sd: s.sd,
                        unit: m.unit,
                      });
                    }}
                    onFocus={() =>
                      setTip({
                        x: 120,
                        y: top + y,
                        title: SERIES[k].label,
                        mean: s.mean,
                        sd: s.sd,
                        unit: m.unit,
                      })
                    }
                    onPointerLeave={() => setTip(null)}
                    onBlur={() => setTip(null)}
                    className="outline-none"
                  >
                    <rect
                      x={LABEL_W}
                      y={y - 3}
                      width={plotW + 60}
                      height={BAR + 6}
                      fill="transparent"
                    />
                    <path
                      d={`M${LABEL_W} ${y}H${LABEL_W + w - r}a${r} ${r} 0 0 1 ${r} ${r}V${y + BAR - r}a${r} ${r} 0 0 1 -${r} ${r}H${LABEL_W}Z`}
                      fill={SERIES[k].color}
                    />
                    {s.sd > 0 && (
                      <g stroke={INK} strokeOpacity="0.55" strokeWidth="1.2">
                        <line
                          x1={x(Math.max(0, s.mean - s.sd))}
                          x2={x(s.mean + s.sd)}
                          y1={y + BAR / 2}
                          y2={y + BAR / 2}
                        />
                        <line
                          x1={x(s.mean + s.sd)}
                          x2={x(s.mean + s.sd)}
                          y1={y + 4}
                          y2={y + BAR - 4}
                        />
                      </g>
                    )}
                    <text
                      x={x(s.mean + s.sd) + 8}
                      y={y + BAR / 2 + 4.5}
                      fontSize="12.5"
                      fontWeight={k === 'adaptive' ? 800 : 600}
                      fill={k === 'adaptive' ? INK : '#4a5872'}
                      fontFamily="inherit"
                    >
                      {s.mean.toFixed(m.unit === 's' ? 1 : 1)} {m.unit}
                    </text>
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>
      {tip && (
        <Tooltip x={tip.x} y={tip.y}>
          <div className="text-[15px] font-extrabold text-cx-ink">
            {tip.mean.toFixed(1)} {tip.unit}
            <span className="ml-1 text-[12px] font-semibold text-cx-ink3">
              ± {tip.sd.toFixed(1)}
            </span>
          </div>
          <div className="text-cx-ink3">{tip.title}</div>
        </Tooltip>
      )}
    </div>
  );
}

export function ComparisonTable({ result }: { result: Comparison }) {
  const rows: ReadonlyArray<{ key: keyof RunResult; label: string; unit: string }> = [
    { key: 'avgWait', label: 'Espera promedio (s)', unit: '' },
    { key: 'maxQueue', label: 'Cola máxima (veh.)', unit: '' },
    { key: 'served', label: 'Vehículos atendidos', unit: '' },
    { key: 'avgPedWait', label: 'Espera peatonal (s)', unit: '' },
  ];
  return (
    <table className="cx-tabular w-full text-left text-[12.5px]">
      <thead>
        <tr className="text-cx-ink3">
          <th className="py-1.5 font-semibold">Métrica (media ± d.e.)</th>
          <th className="py-1.5 text-right font-semibold">Ciclo fijo</th>
          <th className="py-1.5 text-right font-semibold">Adaptativo</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} className="border-t border-cx-line2 text-cx-ink">
            <td className="py-1.5">{r.label}</td>
            <td className="py-1.5 text-right">
              {result.fixed[r.key].mean.toFixed(1)} ± {result.fixed[r.key].sd.toFixed(1)}
            </td>
            <td className="py-1.5 text-right font-semibold">
              {result.adaptive[r.key].mean.toFixed(1)} ± {result.adaptive[r.key].sd.toFixed(1)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ───────────────────────── Curva de riesgo ─────────────────────────

export interface CurvePoint {
  t: number;
  p: number;
  rain: number;
}

const THRESHOLDS: ReadonlyArray<{ p: number; label: string; color: string }> = [
  { p: 0.3, label: 'Medio', color: '#eeb000' },
  { p: 0.55, label: 'Alto', color: '#f5812a' },
  { p: 0.8, label: 'Crítico', color: '#e5484d' },
];

/**
 * Probabilidad de afectación en los próximos 90 min (arriba) y lluvia esperada (abajo).
 * Son dos gráficas que comparten el eje X: nunca doble eje Y.
 */
export function RiskCurve({
  curve,
  horizon,
  baseline,
}: {
  curve: CurvePoint[];
  horizon: number;
  baseline?: CurvePoint[];
}) {
  const gid = useId();
  const [hover, setHover] = useState<number | null>(null);
  const W = 560;
  const L = 40;
  const R = 58;
  const TOP = 10;
  const PH = 150;
  const GAP = 46;
  const RH = 54;
  const H = TOP + PH + GAP + RH + 22;
  const maxT = 90;
  const x = (t: number) => L + (t / maxT) * (W - L - R);
  const y = (p: number) => TOP + (1 - p) * PH;
  const rainMax = Math.max(10, ...curve.map((c) => c.rain)) * 1.3;
  const ry = (mm: number) => TOP + PH + GAP + RH - (mm / rainMax) * RH;

  const line = useMemo(
    () => curve.map((c, i) => `${i ? 'L' : 'M'}${x(c.t).toFixed(1)} ${y(c.p).toFixed(1)}`).join(''),
    [curve],
  );
  const base = useMemo(
    () =>
      baseline
        ?.map((c, i) => `${i ? 'L' : 'M'}${x(c.t).toFixed(1)} ${y(c.p).toFixed(1)}`)
        .join('') ?? null,
    [baseline],
  );
  const area = `${line}L${x(maxT)} ${y(0)}L${x(0)} ${y(0)}Z`;
  const at = curve.find((c) => c.t === horizon) ?? curve[curve.length - 1];
  const hp = hover !== null ? curve[hover] : null;

  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="block w-full touch-none"
        role="img"
        aria-label="Probabilidad de afectación y lluvia esperada en los próximos 90 minutos"
        onPointerMove={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          const t = (((e.clientX - box.left) / box.width) * W - L) / (W - L - R);
          const idx = Math.round(Math.max(0, Math.min(1, t)) * (curve.length - 1));
          setHover(idx);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`${gid}-a`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1f5fa6" stopOpacity="0.16" />
            <stop offset="1" stopColor="#1f5fa6" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((p) => (
          <g key={p}>
            <line x1={L} x2={W - R} y1={y(p)} y2={y(p)} stroke={GRID} strokeWidth="1" />
            <text
              x={L - 8}
              y={y(p) + 4}
              textAnchor="end"
              fontSize="11"
              fill={MUTED}
              fontFamily="inherit"
              className="cx-tabular"
            >
              {Math.round(p * 100)}%
            </text>
          </g>
        ))}
        {THRESHOLDS.map((th) => (
          <g key={th.label}>
            <line
              x1={L}
              x2={W - R}
              y1={y(th.p)}
              y2={y(th.p)}
              stroke={th.color}
              strokeOpacity="0.55"
              strokeWidth="1"
            />
            <circle cx={W - R + 8} cy={y(th.p)} r="3" fill={th.color} />
            <text
              x={W - R + 15}
              y={y(th.p) + 4}
              fontSize="11"
              fontWeight="600"
              fill="#4a5872"
              fontFamily="inherit"
            >
              {th.label}
            </text>
          </g>
        ))}
        <path d={area} fill={`url(#${gid}-a)`} />
        {base && (
          <path d={base} fill="none" stroke="#7d8aa0" strokeWidth="1.5" strokeLinejoin="round" />
        )}
        <path
          d={line}
          fill="none"
          stroke="#1f5fa6"
          strokeWidth="2"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* Horizonte elegido */}
        <line
          x1={x(horizon)}
          x2={x(horizon)}
          y1={TOP}
          y2={TOP + PH}
          stroke={INK}
          strokeOpacity="0.35"
          strokeWidth="1"
        />
        {at && (
          <g>
            <circle cx={x(at.t)} cy={y(at.p)} r="5" fill="#1f5fa6" stroke="#fff" strokeWidth="2" />
            <text
              x={x(at.t) + 9}
              y={at.p > 0.85 ? y(at.p) + 20 : y(at.p) - 9}
              fontSize="12.5"
              fontWeight="800"
              fill={INK}
              fontFamily="inherit"
            >
              {Math.round(at.p * 100)}% en {horizon} min
            </text>
          </g>
        )}
        {/* Lluvia: gráfica aparte, mismo eje X */}
        <text
          x={L}
          y={TOP + PH + GAP - 16}
          fontSize="11.5"
          fontWeight="700"
          fill="#4a5872"
          fontFamily="inherit"
        >
          Lluvia esperada (mm/h)
        </text>
        <line
          x1={L}
          x2={W - R}
          y1={TOP + PH + GAP + RH}
          y2={TOP + PH + GAP + RH}
          stroke={BASE}
          strokeWidth="1"
        />
        {curve.map((c) => {
          const h = TOP + PH + GAP + RH - ry(c.rain);
          const bw = 12;
          const r = Math.min(3, h / 2);
          const bx = x(c.t) - bw / 2;
          const by = ry(c.rain);
          return h > 0.5 ? (
            <path
              key={c.t}
              d={`M${bx} ${by + h}V${by + r}a${r} ${r} 0 0 1 ${r} -${r}H${bx + bw - r}a${r} ${r} 0 0 1 ${r} ${r}V${by + h}Z`}
              fill="#8ab8f8"
            />
          ) : null;
        })}
        {(() => {
          const peak = curve.reduce(
            (m, c) => (c.rain > m.rain ? c : m),
            curve[0] ?? { t: 0, p: 0, rain: 0 },
          );
          return peak.rain > 0.5 ? (
            <text
              x={x(peak.t)}
              y={ry(peak.rain) - 5}
              textAnchor="middle"
              fontSize="11"
              fontWeight="700"
              fill={INK}
              fontFamily="inherit"
            >
              {Math.round(peak.rain)}
            </text>
          ) : null;
        })()}
        {[0, 15, 30, 45, 60, 75, 90].map((t) => (
          <text
            key={t}
            x={x(t)}
            y={H - 4}
            textAnchor="middle"
            fontSize="11"
            fill={MUTED}
            fontFamily="inherit"
            className="cx-tabular"
          >
            {t === 0 ? 'ahora' : `+${t}`}
          </text>
        ))}
        {hp && (
          <line
            x1={x(hp.t)}
            x2={x(hp.t)}
            y1={TOP}
            y2={TOP + PH + GAP + RH}
            stroke={INK}
            strokeOpacity="0.25"
            strokeWidth="1"
          />
        )}
      </svg>
      {hp && (
        <Tooltip x={`${(x(hp.t) / W) * 100}%`} y={0}>
          <div className="text-[15px] font-extrabold text-cx-ink">{Math.round(hp.p * 100)} %</div>
          <div className="text-cx-ink3">
            {hp.t === 0 ? 'Ahora' : `En ${hp.t} min`} · lluvia {hp.rain.toFixed(0)} mm/h
          </div>
        </Tooltip>
      )}
    </div>
  );
}
