/** Ilustraciones pequeñas para cada etapa del ciclo (memoria, figura 1). */

const BG = '#eef3fb';

export function PerceiveArt() {
  return (
    <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden>
      <rect width="160" height="96" rx="14" fill={BG} />
      <g transform="translate(22 20)">
        <rect x="0" y="8" width="44" height="28" rx="7" fill="#1b3d66" />
        <circle cx="22" cy="22" r="9" fill="#1f5fa6" />
        <circle cx="22" cy="22" r="4" fill="#c3d6ec" />
        <rect x="44" y="16" width="10" height="12" rx="3" fill="#1b3d66" />
        <rect x="16" y="36" width="12" height="18" rx="3" fill="#94a3b8" />
        <path
          d="M-4 4h10M-4 4v10M50 4h10M60 4v10"
          stroke="#22d3ee"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </g>
      <g transform="translate(98 44)">
        <rect x="0" y="12" width="40" height="24" rx="4" fill="#2b3038" />
        {[0, 1, 2, 3, 4].map((i) => (
          <rect key={i} x={4 + i * 7.4} y="15" width="4" height="18" fill="#59606b" />
        ))}
        <path
          d="M8 4a16 16 0 0 1 24 0M13 -2a24 24 0 0 1 14 0"
          stroke="#1f5fa6"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export function UnderstandArt() {
  return (
    <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden>
      <rect width="160" height="96" rx="14" fill={BG} />
      {[
        [26, 24, '#1f5fa6'],
        [26, 48, '#0ea5e9'],
        [26, 72, '#f5812a'],
      ].map(([x, y, c], i) => (
        <g key={i}>
          <path
            d={`M${Number(x) + 10} ${y} C 70 ${y}, 70 48, 102 48`}
            stroke={String(c)}
            strokeWidth="2.5"
            fill="none"
            className="cx-flow"
          />
          <circle cx={x} cy={y} r="9" fill={String(c)} />
        </g>
      ))}
      <circle cx="116" cy="48" r="20" fill="#143254" />
      <path
        d="M107 48l6 6 12-13"
        stroke="#34d399"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function PredictArt() {
  return (
    <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden>
      <rect width="160" height="96" rx="14" fill={BG} />
      <g transform="translate(18 14)">
        <path d="M14 30a14 14 0 0 1 4-27 18 18 0 0 1 33 5 11 11 0 0 1 3 22z" fill="#94a3b8" />
        {[10, 22, 34, 46].map((x, i) => (
          <line
            key={x}
            x1={x}
            y1={38 + (i % 2) * 4}
            x2={x - 4}
            y2={50 + (i % 2) * 4}
            stroke="#60a5fa"
            strokeWidth="2.5"
            strokeLinecap="round"
          />
        ))}
      </g>
      <path
        d="M86 74 L104 66 L118 58 L132 36 L144 24"
        stroke="#e5484d"
        strokeWidth="3"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="144" cy="24" r="5" fill="#e5484d" stroke="#fff" strokeWidth="2" />
      <path d="M84 80h64" stroke="#c9d2de" strokeWidth="2" />
    </svg>
  );
}

export function ActArt() {
  return (
    <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden>
      <rect width="160" height="96" rx="14" fill={BG} />
      <g transform="translate(34 12)">
        <rect x="0" y="0" width="30" height="72" rx="10" fill="#102a47" />
        <circle cx="15" cy="16" r="7" fill="#2a3a55" />
        <circle cx="15" cy="36" r="7" fill="#2a3a55" />
        <circle
          cx="15"
          cy="56"
          r="7"
          fill="#2ee37a"
          style={{ filter: 'drop-shadow(0 0 6px #2ee37a)' }}
        />
      </g>
      <path
        d="M84 48h46m-12-12 12 12-12 12"
        stroke="#1f5fa6"
        strokeWidth="4"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="84" y="66" width="52" height="10" rx="5" fill="#c3d6ec" />
      <rect x="84" y="66" width="34" height="10" rx="5" fill="#1f5fa6" />
    </svg>
  );
}

export function ResolveArt() {
  return (
    <svg viewBox="0 0 160 96" className="h-full w-full" aria-hidden>
      <rect width="160" height="96" rx="14" fill={BG} />
      <g transform="translate(24 26)">
        <path d="M4 34a26 26 0 0 1 52 0z" fill="#f5b400" />
        <rect x="0" y="32" width="60" height="8" rx="4" fill="#d99a00" />
        <rect x="26" y="8" width="8" height="24" rx="4" fill="#ffd24d" />
      </g>
      <g transform="translate(98 20)">
        <rect width="42" height="56" rx="8" fill="#fff" stroke="#c9d2de" strokeWidth="2" />
        {[0, 1, 2].map((i) => (
          <g key={i} transform={`translate(8 ${12 + i * 14})`}>
            <rect width="8" height="8" rx="2" fill={i < 2 ? '#1fa464' : '#e3e8f0'} />
            <rect x="12" y="2" width="16" height="4" rx="2" fill="#c9d2de" />
          </g>
        ))}
      </g>
    </svg>
  );
}
