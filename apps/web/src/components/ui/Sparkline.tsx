import { useId, useMemo, useState, type MouseEvent } from 'react';

export interface SparkPoint {
  /** ISO timestamp or label shown in the tooltip. */
  label: string;
  value: number;
}

/**
 * Single-series trend (dataviz contract): 1.5px line in the de-emphasis ink, the current
 * value as an accent dot, no legend (the tile title names the series). Hover shows a
 * crosshair and the exact value; the aria-label carries min / max / current.
 */
export function Sparkline({
  points,
  width = 96,
  height = 24,
  format = (v) => String(v),
  domain,
}: {
  points: readonly SparkPoint[];
  width?: number;
  height?: number;
  format?: (v: number) => string;
  /** Fixed y-domain (e.g. [0, 100] for percentages); defaults to data range. */
  domain?: [number, number];
}) {
  const [hover, setHover] = useState<number | null>(null);
  const clipId = useId();

  const geom = useMemo(() => {
    if (points.length === 0) return null;
    const values = points.map((p) => p.value);
    const min = domain?.[0] ?? Math.min(...values);
    const max = domain?.[1] ?? Math.max(...values);
    const span = max - min || 1;
    const pad = 2;
    const x = (i: number) =>
      points.length === 1 ? width / 2 : pad + (i * (width - pad * 2)) / (points.length - 1);
    const y = (v: number) => pad + (1 - (v - min) / span) * (height - pad * 2);
    const d = points
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`)
      .join('');
    return { x, y, d, min: Math.min(...values), max: Math.max(...values) };
  }, [points, width, height, domain]);

  if (!geom) {
    return <span className="inline-block font-mono text-[11px] text-fg-muted">sin datos</span>;
  }

  const last = points[points.length - 1]!;
  const active = hover !== null ? points[hover] : undefined;

  const onMove = (e: MouseEvent<SVGRectElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(points.length - 1, Math.round(ratio * (points.length - 1)))));
  };

  return (
    <span className="relative inline-block align-middle" style={{ width, height }}>
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={`Tendencia: mínimo ${format(geom.min)}, máximo ${format(geom.max)}, actual ${format(last.value)}`}
        className="overflow-visible"
      >
        <clipPath id={clipId}>
          <rect width={width} height={height} />
        </clipPath>
        <path
          d={geom.d}
          fill="none"
          stroke="var(--color-fg-muted)"
          strokeWidth={1.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          clipPath={`url(#${clipId})`}
        />
        {hover !== null && (
          <line
            x1={geom.x(hover)}
            x2={geom.x(hover)}
            y1={0}
            y2={height}
            stroke="var(--color-line)"
            strokeWidth={1}
          />
        )}
        <circle
          cx={geom.x(hover ?? points.length - 1)}
          cy={geom.y((active ?? last).value)}
          r={2.5}
          fill="var(--color-accent)"
          stroke="var(--color-surface)"
          strokeWidth={1}
        />
        {/* Hit target larger than the marks. */}
        <rect
          width={width}
          height={height}
          fill="transparent"
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {active && (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 whitespace-nowrap border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[11px] text-fg">
          {format(active.value)} <span className="text-fg-muted">· {active.label}</span>
        </span>
      )}
    </span>
  );
}
