import { formatBRL, type CashflowEntry, type Dashboard } from '@fintrack/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Badge } from '../../components/ui/Feedback';
import { formatDate } from '../ledger/labels';

export type HorizonChoice =
  { kind: 'month' } | { kind: 'days'; days: number } | { kind: 'date'; until: string };

const PRESETS: { label: string; choice: HorizonChoice }[] = [
  { label: 'Fim do mês', choice: { kind: 'month' } },
  { label: '30 dias', choice: { kind: 'days', days: 30 } },
  { label: '60 dias', choice: { kind: 'days', days: 60 } },
];

const sameChoice = (a: HorizonChoice, b: HorizonChoice) =>
  a.kind === b.kind && (a.kind !== 'days' || b.kind !== 'days' || a.days === b.days);

/** "08/10" a partir de "2026-10-08". */
const formatDayMonth = (date: string) => `${date.slice(8, 10)}/${date.slice(5, 7)}`;

function daysBetween(from: string, to: string): number {
  const utc = (date: string) => {
    const [y, m, d] = date.split('-').map(Number) as [number, number, number];
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(to) - utc(from)) / 86_400_000);
}

function relativeDay(date: string, today: string): string {
  const days = daysBetween(today, date);
  if (days < 0) return 'atrasado';
  if (days === 0) return 'hoje';
  if (days === 1) return 'amanhã';
  return `em ${days} dias`;
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

function HorizonPicker({
  data,
  horizon,
  onChange,
}: {
  data: Dashboard;
  horizon: HorizonChoice;
  onChange: (choice: HorizonChoice) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="group" aria-label="Período" className="flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5">
        {PRESETS.map(({ label, choice }) => {
          const active = sameChoice(horizon, choice);
          return (
            <button
              key={label}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(choice)}
              className={`rounded-md px-3 py-1 text-xs font-medium transition ${
                active ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-50 shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-50'
              }`}
            >
              {label}
            </button>
          );
        })}
      </div>
      <label className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300">
        Considerar até
        <input
          type="date"
          value={data.until}
          min={data.today}
          onChange={(event) => {
            if (event.target.value) onChange({ kind: 'date', until: event.target.value });
          }}
          className="rounded-md border border-slate-300 dark:border-slate-700 px-2 py-1 text-xs text-slate-900 dark:text-slate-50"
        />
      </label>
    </div>
  );
}

function Tile({
  label,
  cents,
  tone,
  children,
}: {
  label: string;
  cents: number;
  tone: string;
  children?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800 p-4">
      <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</p>
      <p
        aria-label={label}
        className={`mt-1 text-3xl font-semibold tracking-tight tabular-nums ${tone}`}
      >
        {formatBRL(cents)}
      </p>
      {children ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{children}</p> : null}
    </div>
  );
}

/**
 * As três respostas da página inicial — quanto está disponível hoje, quanto guardar para as contas e
 * quanto vai entrar — até o horizonte escolhido. Os números vêm prontos do backend (`cashflow`).
 */
export function MoneyPlan({
  data,
  horizon,
  onHorizonChange,
}: {
  data: Dashboard;
  horizon: HorizonChoice;
  onHorizonChange: (choice: HorizonChoice) => void;
}) {
  const { cashflow } = data;
  const liquid = data.availableToSpend.components.liquidBalanceCents;
  const available = data.availableToSpend.amountCents;
  const bills = cashflow.entries.filter((entry) => entry.direction === 'out');
  const incoming = cashflow.entries.filter((entry) => entry.direction === 'in');
  const shortfall = cashflow.lowestBalanceCents < 0;
  const firstUncovered = bills.find((entry) => entry.balanceAfterCents < 0);

  return (
    <section
      aria-labelledby="plan-title"
      className="rounded-2xl border border-brand-100 dark:border-brand-700 bg-white dark:bg-slate-900 p-5 shadow-sm"
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="plan-title" className="text-lg font-semibold text-slate-900 dark:text-slate-50">
            Seu plano até {formatDate(data.until)}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Hoje é {formatDate(data.today)} · faltam {daysBetween(data.today, data.until)} dia(s)
          </p>
        </div>
        <HorizonPicker data={data} horizon={horizon} onChange={onHorizonChange} />
      </div>

      {shortfall ? (
        <div
          role="alert"
          className="mt-4 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-3 text-sm text-rose-800 dark:text-rose-300"
        >
          <p className="font-semibold">
            Vai faltar {formatBRL(-cashflow.lowestBalanceCents)} até{' '}
            {formatDate(cashflow.lowestBalanceDate)}.
          </p>
          <p className="mt-0.5">
            {firstUncovered
              ? `O saldo deixa de cobrir as contas a partir de "${firstUncovered.description || 'Despesa'}" (${formatDayMonth(firstUncovered.date < data.today ? data.today : firstUncovered.date)}). `
              : ''}
            {data.investmentsCents > 0
              ? `Você tem ${formatBRL(data.investmentsCents)} guardados em investimentos.`
              : 'Antecipe uma entrada ou adie um gasto para não ficar no negativo.'}
          </p>
        </div>
      ) : null}

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Tile
          label="Disponível hoje"
          cents={cashflow.safeToSpendNowCents}
          tone={shortfall ? 'text-rose-600 dark:text-rose-400' : 'text-brand-700 dark:text-brand-400'}
        >
          {shortfall
            ? 'Todo o saldo já está comprometido com contas.'
            : `Sem faltar dinheiro para nenhuma conta até ${formatDayMonth(data.until)}.`}
        </Tile>
        <Tile label="Precisa guardar" cents={cashflow.outCents} tone="text-slate-900 dark:text-slate-50">
          {bills.length > 0
            ? `${plural(bills.length, 'conta', 'contas')} até ${formatDayMonth(data.until)}.`
            : 'Nenhuma conta no período.'}
        </Tile>
        <Tile label="Vai entrar" cents={cashflow.inCents} tone="text-emerald-700 dark:text-emerald-300">
          {incoming.length > 0
            ? `${plural(incoming.length, 'entrada', 'entradas')} até ${formatDayMonth(data.until)}.`
            : 'Nenhuma entrada prevista.'}
        </Tile>
      </div>

      <p
        aria-label="Resumo do período"
        className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-slate-600 dark:text-slate-300"
      >
        <span>
          Saldo hoje <strong className="tabular-nums text-slate-900 dark:text-slate-50">{formatBRL(liquid)}</strong>
        </span>
        <span>
          + entra{' '}
          <strong className="tabular-nums text-emerald-700 dark:text-emerald-300">{formatBRL(cashflow.inCents)}</strong>
        </span>
        <span>
          − sai{' '}
          <strong className="tabular-nums text-rose-600 dark:text-rose-400">{formatBRL(cashflow.outCents)}</strong>
        </span>
        <span>
          = sobra{' '}
          <strong className={`tabular-nums ${available < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-slate-50'}`}>
            {formatBRL(available)}
          </strong>{' '}
          em {formatDayMonth(data.until)}
        </span>
      </p>
    </section>
  );
}

function entryBadges(entry: CashflowEntry) {
  const badges: { label: string; tone: 'sky' | 'amber' | 'rose' | 'slate' }[] = [];
  if (entry.overdue) {
    badges.push(
      entry.direction === 'out'
        ? { label: 'Vencida', tone: 'rose' }
        : { label: 'Atrasada', tone: 'amber' },
    );
  }
  if (entry.kind === 'invoice') badges.push({ label: 'Fatura', tone: 'sky' });
  if (entry.kind === 'recurring') {
    badges.push(
      entry.estimated
        ? { label: 'Recorrente · estimado', tone: 'amber' }
        : { label: 'Recorrente', tone: 'sky' },
    );
  }
  if (entry.kind === 'transfer') {
    badges.push({ label: entry.direction === 'out' ? 'Aplicação' : 'Resgate', tone: 'slate' });
  }
  return badges;
}

function fallbackDescription(entry: CashflowEntry): string {
  if (entry.kind === 'transfer') return entry.direction === 'out' ? 'Aplicação' : 'Resgate';
  return entry.direction === 'out' ? 'Despesa' : 'Receita';
}

function EntryRow({ entry, today }: { entry: CashflowEntry; today: string }) {
  const isOut = entry.direction === 'out';
  const missing = Math.min(entry.amountCents, Math.max(0, -entry.balanceAfterCents));
  return (
    <li className="flex items-center gap-3 py-2.5">
      <div className="w-14 shrink-0 text-center">
        <p className="text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-50">
          {formatDayMonth(entry.date)}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400">{relativeDay(entry.date, today)}</p>
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">
          {entry.description || fallbackDescription(entry)}
        </p>
        <div className="mt-0.5 flex flex-wrap gap-1">
          {entryBadges(entry).map((badge) => (
            <Badge key={badge.label} tone={badge.tone}>
              {badge.label}
            </Badge>
          ))}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p
          className={`text-sm font-semibold tabular-nums ${isOut ? 'text-slate-900 dark:text-slate-50' : 'text-emerald-700 dark:text-emerald-300'}`}
        >
          {isOut ? '' : '+'}
          {formatBRL(entry.amountCents)}
        </p>
        {isOut ? (
          missing > 0 ? (
            <p className="text-[11px] font-medium text-rose-600 dark:text-rose-400">Falta {formatBRL(missing)}</p>
          ) : (
            <p className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">Coberta</p>
          )
        ) : null}
      </div>
    </li>
  );
}

/** Lista cronológica de um lado do fluxo: contas a pagar (saídas) ou dinheiro que vai entrar. */
export function CashflowList({ data, direction }: { data: Dashboard; direction: 'in' | 'out' }) {
  const entries = data.cashflow.entries.filter((entry) => entry.direction === direction);
  const isOut = direction === 'out';
  const title = isOut ? 'Contas a pagar' : 'Dinheiro que vai entrar';
  const total = isOut ? data.cashflow.outCents : data.cashflow.inCents;
  const titleId = isOut ? 'bills-title' : 'income-title';

  return (
    <section
      aria-labelledby={titleId}
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
    >
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={titleId} className="font-semibold text-slate-900 dark:text-slate-50">
          {title}
        </h2>
        <span
          className={`text-sm font-semibold tabular-nums ${isOut ? 'text-slate-900 dark:text-slate-50' : 'text-emerald-700 dark:text-emerald-300'}`}
        >
          {formatBRL(total)}
        </span>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400">Até {formatDate(data.until)}, em ordem de data.</p>

      {entries.length > 0 ? (
        <ul aria-label={title} className="mt-2 divide-y divide-slate-100 dark:divide-slate-800">
          {entries.map((entry) => (
            <EntryRow key={entry.id} entry={entry} today={data.today} />
          ))}
        </ul>
      ) : (
        <p className="mt-3 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm text-slate-600 dark:text-slate-300">
          {isOut
            ? 'Nenhuma conta a pagar no período.'
            : 'Nenhuma entrada prevista no período. Cadastre seu salário ou recebimentos como recorrência para saber quando o dinheiro entra.'}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-3 text-xs font-medium">
        {isOut ? (
          <>
            <Link to="/credit-cards" className="text-brand-700 dark:text-brand-400 hover:underline">
              Cartões
            </Link>
            <Link to="/recurring" className="text-brand-700 dark:text-brand-400 hover:underline">
              Contas fixas
            </Link>
          </>
        ) : (
          <Link to="/recurring" className="text-brand-700 dark:text-brand-400 hover:underline">
            Cadastrar recebimento
          </Link>
        )}
        <Link to="/transactions" className="text-brand-700 dark:text-brand-400 hover:underline">
          Lançamentos
        </Link>
      </div>
    </section>
  );
}
