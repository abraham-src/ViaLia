import type { LucideIcon } from 'lucide-react';
import type { ReactElement } from 'react';

/** Tipo común para íconos de lucide y los propios. */
export type IconType =
  | LucideIcon
  | ((props: { size?: number; strokeWidth?: number; className?: string }) => ReactElement);

/** Ícono de semáforo (lucide no trae uno). */
export function TrafficLightIcon({
  size = 20,
  strokeWidth = 2,
  className,
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden
    >
      <rect x="7" y="2.5" width="10" height="19" rx="3" />
      <circle cx="12" cy="7" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="12" cy="17" r="1.6" />
      <path d="M7 7H4.5M7 12H4.5M17 7h2.5M17 12h2.5" />
    </svg>
  );
}
