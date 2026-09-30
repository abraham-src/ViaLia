import { NavLink } from 'react-router-dom';
import { useAuth } from '../../stores/auth';
import { NAV_ITEMS } from './nav';

const base =
  'group relative flex size-9 items-center justify-center rounded-sm border text-fg-muted hover:text-fg';

export function NavRail() {
  const role = useAuth((s) => s.user?.role);
  const items = NAV_ITEMS.filter((i) => role && i.roles.includes(role));

  return (
    <nav
      className="flex flex-col items-center gap-1 border-r border-line bg-surface py-2"
      aria-label="Navegación"
    >
      {items.map(({ to, label, icon: Icon, external }) => {
        const tooltip = (
          <span className="pointer-events-none absolute left-full z-30 ml-2 hidden whitespace-nowrap border border-line bg-surface-2 px-2 py-0.5 text-[12px] text-fg group-hover:block">
            {label}
          </span>
        );
        return external ? (
          <a
            key={to}
            href={to}
            target="_blank"
            rel="noreferrer"
            className={`${base} border-transparent`}
            aria-label={label}
          >
            <Icon size={17} strokeWidth={1.5} aria-hidden />
            {tooltip}
          </a>
        ) : (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            aria-label={label}
            className={({ isActive }) =>
              `${base} ${isActive ? 'border-accent/60 bg-accent/10 text-fg' : 'border-transparent'}`
            }
          >
            <Icon size={17} strokeWidth={1.5} aria-hidden />
            {tooltip}
          </NavLink>
        );
      })}
    </nav>
  );
}
