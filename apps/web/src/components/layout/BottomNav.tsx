import { NavLink } from 'react-router';
import { Icon } from '../icons';
import { MORE_NAV_ITEM, NAV_ITEMS } from './navigation';

const items = [...NAV_ITEMS.filter((item) => item.primary), MORE_NAV_ITEM];

export function BottomNav() {
  return (
    <nav
      aria-label="Navegação inferior"
      className="fixed inset-x-0 bottom-0 z-10 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <ul className="grid grid-cols-5">
        {items.map((item) => (
          <li key={item.to}>
            <NavLink
              to={item.to}
              end={item.to === '/'}
              className={({ isActive }) =>
                [
                  'flex flex-col items-center gap-1 py-2 text-[11px] font-medium',
                  isActive ? 'text-brand-700' : 'text-slate-500',
                ].join(' ')
              }
            >
              <Icon name={item.icon} className="size-6" />
              {item.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
