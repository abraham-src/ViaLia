import { BRAND } from '../brand';

/** Marca: una vía que se curva hacia un punto de destino (movilidad + ubicación). */
export function LogoMark({ size = 40 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <defs>
        <linearGradient id="cx-logo-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#4f8dff" />
          <stop offset="0.55" stopColor="#2563eb" />
          <stop offset="1" stopColor="#0ea5e9" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill="url(#cx-logo-g)" />
      <path
        d="M9 34c0-8 5-11 11-13s10-5 10-11"
        fill="none"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M9 34c0-8 5-11 11-13s10-5 10-11"
        fill="none"
        stroke="#2563eb"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeDasharray="2 2.6"
      />
      <circle cx="30" cy="9.5" r="4.2" fill="#34d399" stroke="#fff" strokeWidth="2" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="leading-tight">
        <div className="text-[18px] font-extrabold tracking-[-0.02em] text-white">{BRAND.name}</div>
        <div className="text-[12.5px] font-medium text-[#93a4c3]">{BRAND.tagline}</div>
      </div>
    </div>
  );
}
