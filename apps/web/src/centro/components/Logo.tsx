import { BRAND } from '../brand';

/**
 * Marca: dos vías que se cruzan en un nodo (movilidad + intersección inteligente).
 * Un solo archivo, `public/vialia-mark.svg`, sirve también de favicon.
 */
export function LogoMark({ size = 40 }: { size?: number }) {
  return <img src="/vialia-mark.svg" width={size} height={size} alt="" aria-hidden />;
}

export function Logo() {
  return (
    <div className="flex items-center gap-3">
      <LogoMark />
      <div className="leading-tight">
        <div className="text-[18px] font-extrabold tracking-[-0.02em] text-white">{BRAND.name}</div>
        <div className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#aebccd]">
          {BRAND.tagline}
        </div>
      </div>
    </div>
  );
}
