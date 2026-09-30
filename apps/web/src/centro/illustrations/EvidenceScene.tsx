import type { ReactNode } from 'react';
import type { SceneKind } from '../lib/visuals';

/**
 * Evidencia ilustrada por tipo de incidencia (vector, sin fotos). Comunica qué vio la
 * cámara y dónde está el recuadro de detección. Cuando la cámara tenga stream real,
 * la vista de detalle muestra el video en lugar de esta ilustración.
 */

const W = 800;
const H = 500;

function Defs() {
  return (
    <defs>
      <linearGradient id="ev-asphalt" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#4a515d" />
        <stop offset="0.55" stopColor="#3a404b" />
        <stop offset="1" stopColor="#2c313a" />
      </linearGradient>
      <linearGradient id="ev-puddle" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#9fb3cc" stopOpacity="0.55" />
        <stop offset="0.5" stopColor="#6f8199" stopOpacity="0.45" />
        <stop offset="1" stopColor="#4a5a70" stopOpacity="0.5" />
      </linearGradient>
      <linearGradient id="ev-sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#dbe7f5" stopOpacity="0.55" />
        <stop offset="1" stopColor="#dbe7f5" stopOpacity="0" />
      </linearGradient>
      <linearGradient id="ev-concrete" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" stopColor="#cfd3d8" />
        <stop offset="1" stopColor="#b3b9c1" />
      </linearGradient>
      <linearGradient id="ev-curb" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stopColor="#f0c34a" />
        <stop offset="1" stopColor="#c89220" />
      </linearGradient>
      <radialGradient id="ev-vignette" cx="0.5" cy="0.5" r="0.75">
        <stop offset="0.55" stopColor="#000" stopOpacity="0" />
        <stop offset="1" stopColor="#000" stopOpacity="0.45" />
      </radialGradient>
      <filter id="ev-grain" x="0" y="0" width="100%" height="100%">
        <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="4" />
        <feColorMatrix values="0 0 0 0 0.9  0 0 0 0 0.9  0 0 0 0 0.9  0 0 0 0.55 -0.2" />
      </filter>
      <filter id="ev-soft" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="1.2" />
      </filter>
      <filter id="ev-shadow" x="-20%" y="-20%" width="140%" height="160%">
        <feDropShadow dx="0" dy="3" stdDeviation="3" floodColor="#000" floodOpacity="0.35" />
      </filter>
    </defs>
  );
}

function Leaf({
  x,
  y,
  r = 0,
  s = 1,
  c = '#c8792e',
}: {
  x: number;
  y: number;
  r?: number;
  s?: number;
  c?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} filter="url(#ev-shadow)">
      <path d="M0 0C10-14 34-14 46 0C34 14 10 14 0 0Z" fill={c} />
      <path d="M2 0H44" stroke="#000" strokeOpacity="0.22" strokeWidth="1.4" />
      <path
        d="M14 0l8-6M24 0l8-6M14 0l8 6M24 0l8 6"
        stroke="#000"
        strokeOpacity="0.14"
        strokeWidth="1"
      />
    </g>
  );
}

function Asphalt({ children }: { children?: ReactNode }) {
  return (
    <>
      <rect width={W} height={H} fill="url(#ev-asphalt)" />
      <rect width={W} height={H} filter="url(#ev-grain)" opacity="0.28" />
      {children}
    </>
  );
}

function Rain() {
  return (
    <g opacity="0.55">
      {Array.from({ length: 70 }, (_, i) => {
        const x = (i * 97) % W;
        const y = (i * 53) % H;
        return (
          <line
            key={i}
            className="cx-rain"
            style={{
              animationDelay: `${-(i % 9) * 0.1}s`,
              animationDuration: `${0.7 + (i % 5) * 0.08}s`,
            }}
            x1={x}
            y1={y}
            x2={x - 7}
            y2={y + 22}
            stroke="#dbeafe"
            strokeWidth="1.3"
            strokeLinecap="round"
          />
        );
      })}
    </g>
  );
}

function DetectionBox({
  x,
  y,
  w,
  h,
  label,
  confidence,
  color = '#ef3b40',
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  label: string;
  confidence: number;
  color?: string;
}) {
  const c = 22;
  const text = `${label} · ${Math.round(confidence * 100)} %`;
  const tw = text.length * 9.2 + 46;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={w}
        height={h}
        fill={color}
        fillOpacity="0.07"
        stroke={color}
        strokeWidth="3"
      />
      {[
        `M${x} ${y + c}V${y}H${x + c}`,
        `M${x + w - c} ${y}H${x + w}V${y + c}`,
        `M${x + w} ${y + h - c}V${y + h}H${x + w - c}`,
        `M${x + c} ${y + h}H${x}V${y + h - c}`,
      ].map((d) => (
        <path key={d} d={d} fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" />
      ))}
      <g transform={`translate(${x + w / 2 - tw / 2} ${y - 46})`}>
        <rect width={tw} height="34" rx="8" fill={color} />
        <path d="M14 11l8 13H6z" fill="#fff" />
        <rect x="13.2" y="15" width="1.6" height="5" fill={color} />
        <rect x="13.2" y="21" width="1.6" height="1.6" fill={color} />
        <text x="32" y="22.5" fill="#fff" fontSize="15.5" fontWeight="800" fontFamily="inherit">
          {text}
        </text>
      </g>
    </g>
  );
}

function DrainScene({
  rain,
  label,
  confidence,
}: {
  rain: boolean;
  label: string;
  confidence: number;
}) {
  return (
    <>
      <Asphalt />
      {/* Banqueta y guarnición amarilla */}
      <polygon points="230,0 800,0 800,262" fill="url(#ev-concrete)" />
      <polygon points="230,0 800,262 800,300 206,0" fill="url(#ev-curb)" />
      <polygon points="206,0 800,300 800,312 196,0" fill="#000" opacity="0.25" />
      {Array.from({ length: 7 }, (_, i) => (
        <polygon
          key={i}
          points={`${300 + i * 80},${32 + i * 36.5} ${330 + i * 80},${46 + i * 36.5} ${316 + i * 80},${58 + i * 36.5} ${286 + i * 80},${44 + i * 36.5}`}
          fill="#3b2f15"
          opacity="0.18"
        />
      ))}
      {/* Charcos */}
      <path
        d="M-20 330C60 300 170 318 230 360C290 402 260 470 160 500H-20Z"
        fill="url(#ev-puddle)"
      />
      <path
        d="M20 360C80 350 150 360 190 390"
        stroke="url(#ev-sky)"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M560 420C640 395 760 400 820 430V510H540C520 470 530 440 560 420Z"
        fill="url(#ev-puddle)"
      />
      {/* Coladera en perspectiva */}
      <g transform="translate(300 176) rotate(24.4) skewX(-10)">
        <rect
          x="-10"
          y="-10"
          width="292"
          height="170"
          rx="10"
          fill="#1d2127"
          opacity="0.55"
          filter="url(#ev-soft)"
        />
        <rect width="272" height="150" rx="8" fill="#2b3038" stroke="#15181d" strokeWidth="3" />
        <rect x="14" y="14" width="244" height="122" rx="3" fill="#0b0d10" />
        {Array.from({ length: 11 }, (_, i) => (
          <g key={i}>
            <rect x={16 + i * 22} y="14" width="11" height="122" fill="#3d434d" />
            <rect x={16 + i * 22} y="14" width="3" height="122" fill="#59606b" />
          </g>
        ))}
        <rect x="14" y="68" width="244" height="10" fill="#3d434d" />
        {/* Basura y sedimento sobre la rejilla */}
        <path
          d="M24 96C60 80 90 110 130 100C170 90 210 118 250 104L256 136H18Z"
          fill="#6b5237"
          opacity="0.85"
        />
        <path
          d="M40 120C80 110 150 124 230 116"
          stroke="#8a6a44"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.6"
        />
        <g transform="translate(150 40) rotate(-18)">
          <rect width="78" height="26" rx="12" fill="#cfe4f6" opacity="0.92" />
          <rect x="6" y="6" width="44" height="14" rx="6" fill="#7fb2dc" opacity="0.8" />
          <rect x="78" y="7" width="12" height="12" rx="3" fill="#1f5fa6" />
          <rect x="8" y="4" width="60" height="4" rx="2" fill="#fff" opacity="0.7" />
        </g>
        <path d="M60 30l26-10 20 14-8 22-30 4-14-16z" fill="#e5484d" />
        <path d="M66 34l18-6 12 9-6 13-18 2z" fill="#fff" opacity="0.85" />
        <path
          d="M200 22c14 4 30 20 34 36"
          stroke="#6b4a2b"
          strokeWidth="4"
          strokeLinecap="round"
          fill="none"
        />
      </g>
      <Leaf x={338} y={236} r={-20} s={1.3} c="#c8792e" />
      <Leaf x={392} y={262} r={35} s={1.1} c="#a3542b" />
      <Leaf x={470} y={236} r={-65} s={1.2} c="#d9a441" />
      <Leaf x={512} y={306} r={12} s={1.25} c="#6b8e3a" />
      <Leaf x={430} y={318} r={-35} s={1} c="#b8652a" />
      <Leaf x={560} y={268} r={80} s={1} c="#c8792e" />
      <Leaf x={300} y={300} r={10} s={0.9} c="#d9a441" />
      <Leaf x={610} y={330} r={-10} s={0.85} c="#a3542b" />
      <Leaf x={180} y={250} r={48} s={0.8} c="#c8792e" />
      <Leaf x={640} y={210} r={25} s={0.75} c="#6b8e3a" />
      <Leaf x={250} y={420} r={-40} s={0.9} c="#d9a441" />
      {rain && <Rain />}
      <rect width={W} height={H} fill="url(#ev-vignette)" />
      <DetectionBox x={262} y={150} w={392} h={250} label={label} confidence={confidence} />
    </>
  );
}

function WaterScene({ label, confidence }: { label: string; confidence: number }) {
  return (
    <>
      <Asphalt />
      {/* Carriles en perspectiva */}
      <polygon points="0,0 800,0 800,40 0,90" fill="url(#ev-concrete)" />
      <polygon points="0,90 800,40 800,52 0,104" fill="url(#ev-curb)" />
      {Array.from({ length: 8 }, (_, i) => (
        <polygon
          key={i}
          points={`${40 + i * 100},${300 - i * 4} ${100 + i * 100},${296 - i * 4} ${100 + i * 100},${306 - i * 4} ${40 + i * 100},${310 - i * 4}`}
          fill="#f1f5f9"
          opacity="0.85"
        />
      ))}
      {/* Encharcamiento que cubre el carril */}
      <path
        d="M70 150C170 120 330 130 470 150C610 170 720 200 740 260C760 320 640 360 480 350C320 340 160 360 90 320C20 280 -10 180 70 150Z"
        fill="url(#ev-puddle)"
      />
      <path
        d="M130 190C250 170 390 180 520 200"
        stroke="url(#ev-sky)"
        strokeWidth="18"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M200 260C320 250 460 262 600 280"
        stroke="url(#ev-sky)"
        strokeWidth="10"
        strokeLinecap="round"
        fill="none"
      />
      {[
        [260, 230, 30],
        [430, 210, 44],
        [560, 270, 26],
        [340, 300, 22],
      ].map(([x = 0, y = 0, r = 0], i) => (
        <g key={i} fill="none" stroke="#e2ecf8" strokeOpacity="0.5">
          <ellipse cx={x} cy={y} rx={r} ry={r * 0.32} strokeWidth="1.6" />
          <ellipse cx={x} cy={y} rx={r * 0.55} ry={r * 0.18} strokeWidth="1.2" />
        </g>
      ))}
      {/* Auto que entra al agua */}
      <g transform="translate(560 330)" filter="url(#ev-shadow)">
        <rect width="190" height="90" rx="26" fill="#e5e7eb" />
        <rect x="40" y="12" width="110" height="40" rx="12" fill="#1f2937" opacity="0.85" />
        <circle cx="40" cy="88" r="20" fill="#111827" />
        <circle cx="150" cy="88" r="20" fill="#111827" />
      </g>
      <path
        d="M540 410C590 400 700 404 780 416"
        stroke="#c7d6ea"
        strokeOpacity="0.5"
        strokeWidth="6"
        fill="none"
        strokeLinecap="round"
      />
      <Rain />
      <rect width={W} height={H} fill="url(#ev-vignette)" />
      <DetectionBox
        x={60}
        y={128}
        w={690}
        h={240}
        label={label}
        confidence={confidence}
        color="#f5812a"
      />
    </>
  );
}

function RoadObject({ kind }: { kind: Exclude<SceneKind, 'drain' | 'water'> }) {
  switch (kind) {
    case 'accident':
      return (
        <g filter="url(#ev-shadow)">
          <g transform="translate(250 190) rotate(-18)">
            <rect width="190" height="92" rx="24" fill="#ef4444" />
            <rect x="46" y="12" width="96" height="40" rx="12" fill="#1f2937" opacity="0.85" />
            <path d="M176 10l20 30-12 40" stroke="#7f1d1d" strokeWidth="6" fill="none" />
          </g>
          <g transform="translate(430 230) rotate(24)">
            <rect width="120" height="46" rx="18" fill="#1f2937" />
            <circle cx="20" cy="46" r="16" fill="#0b0d10" />
            <circle cx="100" cy="46" r="16" fill="#0b0d10" />
            <rect x="30" y="-18" width="50" height="20" rx="8" fill="#374151" />
          </g>
          {[
            [420, 330],
            [470, 350],
            [390, 360],
            [510, 320],
          ].map(([x = 0, y = 0], i) => (
            <polygon
              key={i}
              points={`${x},${y} ${x + 12},${y + 4} ${x + 4},${y + 12}`}
              fill="#cbd5e1"
            />
          ))}
          <g transform="translate(610 330)">
            <polygon points="0,60 34,0 68,60" fill="#f97316" stroke="#fff" strokeWidth="4" />
            <rect x="31" y="20" width="6" height="22" fill="#fff" />
          </g>
        </g>
      );
    case 'obstacle':
      return (
        <g filter="url(#ev-shadow)">
          <path
            d="M150 330C260 300 420 280 640 220"
            stroke="#6b4a2b"
            strokeWidth="26"
            strokeLinecap="round"
          />
          <path
            d="M380 280C400 240 430 220 470 210M520 250C540 300 580 320 620 330M280 305C270 350 240 380 210 390"
            stroke="#6b4a2b"
            strokeWidth="11"
            strokeLinecap="round"
            fill="none"
          />
          {[
            [470, 205, 44],
            [620, 330, 40],
            [210, 392, 36],
            [650, 214, 34],
            [560, 250, 30],
          ].map(([x = 0, y = 0, r = 0], i) => (
            <g key={i}>
              <circle cx={x} cy={y} r={r} fill="#4c9a58" />
              <circle cx={x - r * 0.3} cy={y - r * 0.3} r={r * 0.55} fill="#6cbf72" />
            </g>
          ))}
        </g>
      );
    case 'infrastructure':
      return (
        <g>
          <path
            d="M300 220C360 190 470 200 520 240C570 280 540 340 470 350C400 360 320 350 290 310C260 270 260 240 300 220Z"
            fill="#15181d"
          />
          <path
            d="M310 230C360 212 450 218 494 250C530 276 510 320 460 326"
            stroke="#2c313a"
            strokeWidth="10"
            fill="none"
          />
          {[
            'M520 240l70-30 40 20',
            'M290 300l-80 30-30 50',
            'M470 350l20 70 50 30',
            'M300 220l-40-70',
          ].map((d) => (
            <path
              key={d}
              d={d}
              stroke="#15181d"
              strokeWidth="5"
              fill="none"
              strokeLinecap="round"
            />
          ))}
          <path
            d="M340 290C380 300 430 300 470 290"
            stroke="url(#ev-sky)"
            strokeWidth="8"
            fill="none"
            opacity="0.6"
          />
        </g>
      );
    case 'accessibility':
      return (
        <g filter="url(#ev-shadow)">
          <polygon points="0,380 800,300 800,500 0,500" fill="url(#ev-concrete)" />
          <polygon points="300,340 440,326 470,420 280,440" fill="#aeb6c0" />
          <path
            d="M320 360l110-12M316 380l118-13M312 400l124-14"
            stroke="#98a1ad"
            strokeWidth="3"
          />
          {[0, 1, 2].map((i) => (
            <g key={i} transform={`translate(${250 + i * 110} ${250 - i * 10})`}>
              <rect width="100" height="18" fill="#fff" />
              {[0, 1, 2, 3, 4].map((k) => (
                <rect key={k} x={k * 20} width="10" height="18" fill="#f97316" />
              ))}
              <rect x="6" y="18" width="6" height="80" fill="#e5e7eb" />
              <rect x="88" y="18" width="6" height="80" fill="#e5e7eb" />
            </g>
          ))}
          {[
            [210, 360],
            [560, 330],
          ].map(([x = 0, y = 0], i) => (
            <g key={i} transform={`translate(${x} ${y})`}>
              <polygon points="0,70 22,0 44,70" fill="#f97316" />
              <rect x="10" y="30" width="24" height="9" fill="#fff" />
              <rect x="-6" y="68" width="56" height="10" rx="3" fill="#ea580c" />
            </g>
          ))}
          <g transform="translate(380 150)">
            <circle r="34" fill="#1f5fa6" stroke="#fff" strokeWidth="4" />
            <circle cx="-2" cy="-16" r="5" fill="#fff" />
            <path
              d="M-4-8v14h14l6 12M-10 0a14 14 0 1 0 18 16"
              stroke="#fff"
              strokeWidth="4"
              fill="none"
              strokeLinecap="round"
            />
            <path d="M-26 26L26-26" stroke="#ef4444" strokeWidth="6" strokeLinecap="round" />
          </g>
        </g>
      );
  }
}

const BOX: Record<Exclude<SceneKind, 'drain' | 'water'>, [number, number, number, number]> = {
  accident: [220, 150, 420, 250],
  obstacle: [140, 160, 560, 260],
  infrastructure: [240, 170, 360, 230],
  accessibility: [190, 200, 440, 260],
};

export function EvidenceScene({
  kind,
  label,
  confidence,
  rain = false,
  className = '',
}: {
  kind: SceneKind;
  label: string;
  confidence: number;
  rain?: boolean;
  className?: string;
}) {
  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className={className}
      role="img"
      aria-label={`Evidencia ilustrada: ${label}`}
    >
      <Defs />
      {kind === 'drain' ? (
        <DrainScene rain={rain} label={label} confidence={confidence} />
      ) : kind === 'water' ? (
        <WaterScene label={label} confidence={confidence} />
      ) : (
        <>
          <Asphalt>
            {Array.from({ length: 8 }, (_, i) => (
              <rect
                key={i}
                x={i * 110 - 20}
                y="240"
                width="60"
                height="10"
                rx="2"
                fill="#f1f5f9"
                opacity="0.8"
              />
            ))}
          </Asphalt>
          <RoadObject kind={kind} />
          {rain && <Rain />}
          <rect width={W} height={H} fill="url(#ev-vignette)" />
          <DetectionBox
            x={BOX[kind][0]}
            y={BOX[kind][1]}
            w={BOX[kind][2]}
            h={BOX[kind][3]}
            label={label}
            confidence={confidence}
            color={kind === 'accessibility' ? '#1f5fa6' : '#ef3b40'}
          />
        </>
      )}
    </svg>
  );
}
