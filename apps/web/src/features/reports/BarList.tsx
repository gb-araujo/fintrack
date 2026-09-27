import { formatBRL } from '@fintrack/shared';

export interface BarListItem {
  key: string;
  label: string;
  cents: number;
  /** 0–100 (pode passar de 100 em orçamentos estourados); a barra fica limitada visualmente. */
  percent: number;
}

/**
 * Lista de barras horizontais: uma cor só (magnitude), ordenada do maior para o menor. O valor e o
 * percentual são sempre escritos ao lado — a cor nunca é a única forma de ler o número.
 */
export function BarList({
  items,
  label,
  emptyMessage = 'Nada neste período.',
}: {
  items: BarListItem[];
  label: string;
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return <p className="py-6 text-center text-sm text-slate-500">{emptyMessage}</p>;
  }
  return (
    <ul className="space-y-2" aria-label={label}>
      {items.map((item) => (
        <li key={item.key}>
          <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0 truncate text-slate-700">{item.label}</span>
            <span className="shrink-0 tabular-nums text-slate-900">
              {formatBRL(item.cents)}
              <span className="ml-1.5 text-xs text-slate-500">{item.percent}%</span>
            </span>
          </div>
          <div
            role="progressbar"
            aria-label={item.label}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.min(100, Math.round(item.percent))}
            className="h-2 overflow-hidden rounded-full bg-slate-100"
          >
            <div
              className="h-full rounded-full bg-brand-600"
              style={{ width: `${Math.min(100, Math.max(0, item.percent))}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
