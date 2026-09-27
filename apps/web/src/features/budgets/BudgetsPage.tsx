import { BUDGET_WARNING_PERCENT, formatBRL, type Budget } from '@fintrack/shared';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  QueryError,
  Spinner,
} from '../../components/ui/Feedback';
import { formErrorMessage } from '../../lib/form-errors';
import { formatMonth, shiftMonth } from '../ledger/labels';
import { useToday } from '../ledger/useToday';
import { BudgetFormModal } from './BudgetFormModal';
import { useBudgets, useDeleteBudget } from './queries';

const STATUS: Record<
  Budget['status'],
  { label: string; tone: 'emerald' | 'amber' | 'rose'; bar: string }
> = {
  ok: { label: 'Dentro do limite', tone: 'emerald', bar: 'bg-emerald-500' },
  warning: { label: 'Atenção', tone: 'amber', bar: 'bg-amber-500' },
  exceeded: { label: 'Estourado', tone: 'rose', bar: 'bg-rose-500' },
};

export function BudgetsPage() {
  const today = useToday();
  const [month, setMonth] = useState(today.slice(0, 7));
  const [editing, setEditing] = useState<Budget | 'new' | null>(null);
  const [removing, setRemoving] = useState<Budget | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const budgets = useBudgets(month);
  const remove = useDeleteBudget();

  async function confirmRemove() {
    if (!removing) return;
    setRemoveError(null);
    try {
      await remove.mutateAsync(removing.id);
      setRemoving(null);
    } catch (error) {
      setRemoveError(formErrorMessage(error));
    }
  }

  return (
    <>
      <PageHeader
        title="Orçamentos"
        description="Limite mensal por categoria de despesa. O gasto conta só despesas efetivadas — transferências e investimentos ficam de fora."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            size="sm"
            aria-label="Mês anterior"
            onClick={() => setMonth(shiftMonth(month, -1))}
          >
            ‹
          </Button>
          <h2
            className="min-w-40 text-center font-semibold capitalize text-slate-900"
            aria-live="polite"
          >
            {formatMonth(month)}
          </h2>
          <Button
            variant="secondary"
            size="sm"
            aria-label="Próximo mês"
            onClick={() => setMonth(shiftMonth(month, 1))}
          >
            ›
          </Button>
        </div>
        <Button onClick={() => setEditing('new')}>Novo orçamento</Button>
      </div>

      {budgets.isPending ? (
        <Spinner />
      ) : budgets.isError ? (
        <QueryError error={budgets.error} onRetry={() => void budgets.refetch()} />
      ) : (
        <>
          <section
            aria-label="Resumo do mês"
            className="mb-4 grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:grid-cols-3"
          >
            <Summary label="Orçado" cents={budgets.data.totals.limitCents} />
            <Summary label="Gasto" cents={budgets.data.totals.spentCents} />
            <Summary
              label="Restante"
              cents={budgets.data.totals.remainingCents}
              tone={budgets.data.totals.remainingCents < 0 ? 'text-rose-600' : 'text-slate-900'}
            />
          </section>

          {budgets.data.items.length === 0 ? (
            <EmptyState title="Nenhum orçamento neste mês">
              Defina quanto quer gastar em cada categoria (Alimentação, Lazer…) e acompanhe o quanto
              já foi usado.
            </EmptyState>
          ) : (
            <ul className="grid gap-3 md:grid-cols-2" aria-label="Orçamentos">
              {budgets.data.items.map((budget) => (
                <BudgetCard
                  key={budget.id}
                  budget={budget}
                  onEdit={() => setEditing(budget)}
                  onRemove={() => {
                    setRemoveError(null);
                    setRemoving(budget);
                  }}
                />
              ))}
            </ul>
          )}

          {budgets.data.unbudgetedSpentCents > 0 ? (
            <p className="mt-4 text-sm text-slate-600">
              Gasto em categorias sem orçamento:{' '}
              <span className="font-medium tabular-nums">
                {formatBRL(budgets.data.unbudgetedSpentCents)}
              </span>
            </p>
          ) : null}

          {editing ? (
            <BudgetFormModal
              month={month}
              {...(editing !== 'new' ? { budget: editing } : {})}
              budgetedCategoryIds={budgets.data.items.map((item) => item.categoryId)}
              onClose={() => setEditing(null)}
            />
          ) : null}
        </>
      )}

      {removing ? (
        <ConfirmDialog
          title="Remover orçamento"
          message={`Remover o orçamento de ${removing.categoryName} em ${formatMonth(month)}? Seus lançamentos não são afetados.`}
          confirmLabel="Remover"
          pending={remove.isPending}
          error={removeError}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </>
  );
}

function Summary({
  label,
  cents,
  tone = 'text-slate-900',
}: {
  label: string;
  cents: number;
  tone?: string;
}) {
  return (
    <div>
      <p className="text-sm text-slate-500">{label}</p>
      <p className={`text-xl font-semibold tabular-nums ${tone}`} aria-label={label}>
        {formatBRL(cents)}
      </p>
    </div>
  );
}

function BudgetCard({
  budget,
  onEdit,
  onRemove,
}: {
  budget: Budget;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const status = STATUS[budget.status];
  // Só a barra é limitada a 100% visualmente; o percentual mostrado é o real.
  const barWidth = Math.min(100, budget.percentUsed);

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="truncate font-medium text-slate-900">{budget.categoryName}</h3>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Editar orçamento de ${budget.categoryName}`}
            onClick={onEdit}
          >
            Editar
          </Button>
          <Button
            variant="ghost"
            size="sm"
            aria-label={`Remover orçamento de ${budget.categoryName}`}
            onClick={onRemove}
          >
            Remover
          </Button>
        </div>
      </div>

      <div
        role="progressbar"
        aria-label={`Uso do orçamento de ${budget.categoryName}`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.min(100, budget.percentUsed)}
        aria-valuetext={`${budget.percentUsed}% do limite`}
        className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100"
      >
        <div className={`h-full rounded-full ${status.bar}`} style={{ width: `${barWidth}%` }} />
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div>
          <dt className="text-xs text-slate-500">Limite</dt>
          <dd className="tabular-nums">{formatBRL(budget.limitCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Gasto ({budget.percentUsed}%)</dt>
          <dd className="tabular-nums">{formatBRL(budget.spentCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500">Restante</dt>
          <dd
            className={`tabular-nums ${budget.remainingCents < 0 ? 'text-rose-600' : 'text-slate-900'}`}
          >
            {formatBRL(budget.remainingCents)}
          </dd>
        </div>
      </dl>

      {budget.pendingCents > 0 ? (
        <p className="mt-2 text-xs text-slate-500">
          + {formatBRL(budget.pendingCents)} previstos/pendentes neste mês (ainda não contam como
          gasto).
        </p>
      ) : null}
      {budget.status === 'warning' ? (
        <p className="mt-1 text-xs text-amber-700">
          Você já usou {BUDGET_WARNING_PERCENT}% ou mais do limite.
        </p>
      ) : null}
    </li>
  );
}
