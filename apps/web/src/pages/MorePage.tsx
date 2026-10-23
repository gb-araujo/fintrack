import { Link } from 'react-router';
import { Icon } from '../components/icons';
import { NAV_ITEMS } from '../components/layout/navigation';
import { PageHeader } from '../components/PageHeader';

export function MorePage() {
  return (
    <>
      <PageHeader title="Mais" />
      <ul className="divide-y divide-slate-200 dark:divide-slate-800 overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
        {NAV_ITEMS.filter((item) => !item.primary).map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <Icon name={item.icon} className="size-5 text-slate-500 dark:text-slate-400" />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
