import type { Account } from '@fintrack/shared';
import { useEffect, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { InputField, SelectField } from '../../components/ui/Fields';
import type { TransactionFilters as Filters } from '../../services/ledger';

const TYPE_OPTIONS = [
  { value: 'income', label: 'Receitas' },
  { value: 'expense', label: 'Despesas' },
  { value: 'transfer', label: 'Transferências' },
  { value: 'card_payment', label: 'Pagamentos de fatura' },
];

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pendentes' },
  { value: 'completed', label: 'Efetivados' },
  { value: 'cancelled', label: 'Cancelados' },
];

/** Espera o usuário parar de digitar antes de refazer a busca. */
function useDebounced<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function TransactionFilters({
  accounts,
  filters,
  onChange,
}: {
  accounts: Account[];
  filters: Filters;
  onChange: (filters: Filters) => void;
}) {
  const [search, setSearch] = useState(filters.q ?? '');
  const debouncedSearch = useDebounced(search, 300);

  useEffect(() => {
    const q = debouncedSearch.trim();
    if ((filters.q ?? '') !== q) {
      const { q: _previous, ...rest } = filters;
      onChange(q ? { ...rest, q } : rest);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reage apenas ao texto já estabilizado
  }, [debouncedSearch]);

  function set<K extends keyof Filters>(key: K, value: Filters[K] | '') {
    const next = { ...filters };
    if (value === '' || value === undefined) delete next[key];
    else next[key] = value;
    onChange(next);
  }

  const hasFilters = Object.keys(filters).length > 0;

  return (
    <form
      role="search"
      aria-label="Filtros de lançamentos"
      onSubmit={(event) => event.preventDefault()}
      className="mb-4 grid gap-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <InputField
        label="Buscar na descrição"
        type="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Ex.: mercado"
      />
      <SelectField
        label="Conta"
        value={filters.accountId ?? ''}
        onChange={(event) => set('accountId', event.target.value)}
        placeholder="Todas as contas"
        options={accounts.map((account) => ({ value: account.id, label: account.name }))}
      />
      <SelectField
        label="Tipo"
        value={filters.type ?? ''}
        onChange={(event) => set('type', event.target.value as Filters['type'])}
        placeholder="Todos os tipos"
        options={TYPE_OPTIONS}
      />
      <SelectField
        label="Situação"
        value={filters.status ?? ''}
        onChange={(event) => set('status', event.target.value as Filters['status'])}
        placeholder="Todas (sem cancelados)"
        options={STATUS_OPTIONS}
      />
      <InputField
        label="De"
        type="date"
        value={filters.from ?? ''}
        onChange={(event) => set('from', event.target.value)}
      />
      <InputField
        label="Até"
        type="date"
        value={filters.to ?? ''}
        onChange={(event) => set('to', event.target.value)}
      />
      {hasFilters ? (
        <div className="sm:col-span-2 lg:col-span-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setSearch('');
              onChange({});
            }}
          >
            Limpar filtros
          </Button>
        </div>
      ) : null}
    </form>
  );
}
