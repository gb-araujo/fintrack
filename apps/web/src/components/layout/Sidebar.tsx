import { NavLink } from 'react-router';
import { Icon } from '../icons';
import { NAV_ITEMS } from './navigation';

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white md:flex">
      <div className="flex h-16 items-center gap-2 px-6">
        <span className="grid size-8 place-items-center rounded-lg bg-brand-700 text-sm font-bold text-white">
          F
        </span>
        <span className="text-lg font-semibold tracking-tight">FINTRACK</span>
      </div>
      <nav aria-label="Navegação principal" className="flex-1 space-y-1 px-3 py-2">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              [
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              ].join(' ')
            }
          >
            <Icon name={item.icon} className="size-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
