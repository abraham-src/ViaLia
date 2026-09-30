import type { CSSProperties } from 'react';

/**
 * Vista aérea ilustrada de una calle con detecciones de la IA (autos y peatones).
 * Se usa cuando la cámara no tiene stream_url: comunica qué hace la cámara sin
 * aparentar video real. Los autos se mueven con CSS (sin JavaScript por cuadro).
 */

const CAR_COLORS = ['#f8fafc', '#1f2937', '#ef4444', '#3b82f6', '#94a3b8', '#f59e0b', '#10b981'];

function Car({
  x,
  color,
  dir,
  dur,
  delay,
  label,
}: {
  x: number;
  color: string;
  dir: 'down' | 'up';
  dur: number;
  delay: number;
  label?: string;
}) {
  const style: CSSProperties = {
    animation: `cx-drive-${dir} ${dur}s linear infinite`,
    animationDelay: `${delay}s`,
  };
  const dark = color === '#1f2937';
  return (
    <g style={style}>
      <g transform={`translate(${x} 0) ${dir === 'up' ? 'rotate(180 11 20)' : ''}`}>
        <rect x="1.5" y="3" width="21" height="38" rx="6" fill="#143254" opacity="0.18" />
        <rect x="0" y="0" width="22" height="40" rx="6" fill={color} />
        <rect
          x="2.5"
          y="25"
          width="17"
          height="9"
          rx="2.5"
          fill={dark ? '#475569' : '#1e293b'}
          opacity="0.85"
        />
        <rect
          x="3"
          y="8"
          width="16"
          height="6"
          rx="2"
          fill={dark ? '#475569' : '#1e293b'}
          opacity="0.7"
        />
        <rect
          x="3.5"
          y="14.5"
          width="15"
          height="10"
          rx="2"
          fill={color}
          stroke="#143254"
          strokeOpacity="0.08"
        />
        <rect x="1" y="0.5" width="4" height="2" rx="1" fill="#fde68a" />
        <rect x="17" y="0.5" width="4" height="2" rx="1" fill="#fde68a" />
      </g>
      {label && (
        <g transform={`translate(${x - 4} -4)`}>
          <rect width="30" height="48" rx="3" fill="none" stroke="#22d3ee" strokeWidth="1.4" />
          <rect y="-11" width={label.length * 5.2 + 8} height="11" rx="2" fill="#22d3ee" />
          <text x="4" y="-2.6" fontSize="8" fontWeight="700" fill="#06202a" fontFamily="inherit">
            {label}
          </text>
        </g>
      )}
    </g>
  );
}

function Tree({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <g>
      <circle cx={x + 2} cy={y + 3} r={r} fill="#143254" opacity="0.14" />
      <circle cx={x} cy={y} r={r} fill="#4c9a58" />
      <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.55} fill="#6cbf72" />
    </g>
  );
}

export function CameraScene({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 320 190"
      className={className}
      role="img"
      aria-label="Vista ilustrativa de la cámara"
    >
      <defs>
        <linearGradient id="cx-cam-vignette" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#143254" stopOpacity="0.28" />
          <stop offset="0.35" stopColor="#143254" stopOpacity="0" />
          <stop offset="1" stopColor="#143254" stopOpacity="0.32" />
        </linearGradient>
        <linearGradient id="cx-cam-scan" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#22d3ee" stopOpacity="0" />
          <stop offset="1" stopColor="#22d3ee" stopOpacity="0.35" />
        </linearGradient>
        <clipPath id="cx-cam-clip">
          <rect width="320" height="190" />
        </clipPath>
      </defs>
      <g clipPath="url(#cx-cam-clip)">
        {/* Manzanas y banquetas */}
        <rect width="320" height="190" fill="#d7dde5" />
        <rect x="0" y="0" width="98" height="190" fill="#cfd6df" />
        <rect x="222" y="0" width="98" height="190" fill="#cfd6df" />
        <rect x="6" y="8" width="70" height="52" rx="3" fill="#bfc8d4" />
        <rect x="10" y="12" width="62" height="44" rx="2" fill="#c9d1dc" />
        <rect x="6" y="72" width="70" height="60" rx="3" fill="#b8c2cf" />
        <rect x="6" y="144" width="70" height="40" rx="3" fill="#c3ccd8" />
        <rect x="240" y="10" width="74" height="70" rx="3" fill="#bdc6d2" />
        <rect x="246" y="16" width="30" height="24" rx="2" fill="#aeb9c7" />
        <rect x="240" y="92" width="74" height="92" rx="3" fill="#c6cedb" />
        {/* Calle */}
        <rect x="104" y="0" width="112" height="190" fill="#5b6574" />
        <rect x="98" y="0" width="6" height="190" fill="#e8ecf1" />
        <rect x="216" y="0" width="6" height="190" fill="#e8ecf1" />
        {Array.from({ length: 10 }, (_, i) => (
          <rect
            key={i}
            x="158.5"
            y={i * 20 - 2}
            width="3"
            height="11"
            rx="1"
            fill="#f8fafc"
            opacity="0.9"
          />
        ))}
        {/* Paso peatonal */}
        {Array.from({ length: 9 }, (_, i) => (
          <rect
            key={i}
            x={108 + i * 12}
            y="30"
            width="7"
            height="20"
            fill="#f1f5f9"
            opacity="0.92"
          />
        ))}
        {/* Coladera en la orilla */}
        <rect x="200" y="118" width="12" height="18" rx="1.5" fill="#1f2937" />
        {Array.from({ length: 4 }, (_, i) => (
          <rect key={i} x="201.5" y={120 + i * 4} width="9" height="1.6" fill="#6b7280" />
        ))}
        {/* Autos: carril derecho baja, izquierdo sube */}
        <Car
          x={177}
          color={CAR_COLORS[0] ?? '#fff'}
          dir="down"
          dur={6.5}
          delay={-1.2}
          label="auto 0.94"
        />
        <Car x={182} color={CAR_COLORS[2] ?? '#f00'} dir="down" dur={6.5} delay={-4.4} />
        <Car
          x={122}
          color={CAR_COLORS[1] ?? '#000'}
          dir="up"
          dur={7.4}
          delay={-2.1}
          label="auto 0.91"
        />
        <Car x={126} color={CAR_COLORS[3] ?? '#00f'} dir="up" dur={7.4} delay={-5.6} />
        <Car x={129} color={CAR_COLORS[4] ?? '#888'} dir="up" dur={7.4} delay={-0.2} />
        {/* Árboles */}
        <Tree x={88} y={20} r={9} />
        <Tree x={88} y={70} r={10} />
        <Tree x={88} y={128} r={9} />
        <Tree x={232} y={48} r={10} />
        <Tree x={232} y={150} r={9} />
        {/* Peatón con detección */}
        <g transform="translate(226 96)">
          <ellipse cx="4" cy="12" rx="5" ry="2" fill="#143254" opacity="0.2" />
          <circle cx="4" cy="3" r="3.2" fill="#1f2937" />
          <rect x="1" y="6" width="6" height="7" rx="2.5" fill="#f97316" />
          <rect
            x="-4"
            y="-5"
            width="16"
            height="22"
            rx="2"
            fill="none"
            stroke="#a3e635"
            strokeWidth="1.3"
          />
          <rect x="-4" y="-15" width="36" height="10" rx="2" fill="#a3e635" />
          <text x="-1" y="-7.6" fontSize="7.5" fontWeight="700" fill="#1a2e05" fontFamily="inherit">
            peatón
          </text>
        </g>
        {/* Zona de conteo */}
        <rect
          x="108"
          y="56"
          width="104"
          height="120"
          rx="4"
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1"
          strokeDasharray="4 3"
          opacity="0.8"
        />
        <rect width="320" height="190" fill="url(#cx-cam-vignette)" />
        <rect className="cx-scan" x="0" y="0" width="320" height="38" fill="url(#cx-cam-scan)" />
      </g>
    </svg>
  );
}
