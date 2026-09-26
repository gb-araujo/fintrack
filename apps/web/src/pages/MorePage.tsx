import { Link } from 'react-router';
import { Icon } from '../components/icons';
import { NAV_ITEMS } from '../components/layout/navigation';
import { PageHeader } from '../components/PageHeader';

export function MorePage() {
  return (
    <>
      <PageHeader title="Mais" />
      <ul className="divide-y divide-slate-200 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {NAV_ITEMS.filter((item) => !item.primary).map((item) => (
          <li key={item.to}>
            <Link
              to={item.to}
              className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-slate-50"
            >
              <Icon name={item.icon} className="size-5 text-slate-500" />
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
