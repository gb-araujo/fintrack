import { NavLink } from 'react-router';
import { Icon } from '../icons';
import { NAV_ITEMS } from './navigation';
import { ThemeToggle } from './ThemeToggle';
import { UserMenu } from './UserMenu';

export function Sidebar() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:flex">
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
                  ? 'bg-brand-50 dark:bg-brand-900 text-brand-700 dark:text-brand-400'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 hover:text-slate-900 dark:hover:text-slate-50',
              ].join(' ')
            }
          >
            <Icon name={item.icon} className="size-5" />
            {item.label}
          </NavLink>
        ))}
      </nav>
      <div className="border-t border-slate-200 dark:border-slate-800 px-4 py-4">
        <ThemeToggle />
        <div className="mt-3">
          <UserMenu />
        </div>
      </div>
    </aside>
  );
}
