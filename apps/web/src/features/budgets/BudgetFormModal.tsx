import { type Budget } from '@fintrack/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { FormError } from '../../components/ui/Feedback';
import { MoneyField, SelectField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import { formErrorMessage } from '../../lib/form-errors';
import { centsToInput, parseMoneyInput } from '../../lib/money-input';
import { formatMonth } from '../ledger/labels';
import { useCategories } from '../ledger/queries';
import { useUpsertBudget } from './queries';

/** Define (ou altera) o limite de uma categoria de despesa no mês. */
export function BudgetFormModal({
  month,
  budget,
  budgetedCategoryIds,
  onClose,
}: {
  month: string;
  /** Presente ao editar; ausente ao criar. */
  budget?: Budget;
  budgetedCategoryIds: readonly string[];
  onClose: () => void;
}) {
  const editing = budget !== undefined;
  const categories = useCategories(false);
  const upsert = useUpsertBudget();
  const [categoryId, setCategoryId] = useState(budget?.categoryId ?? '');
  const [limit, setLimit] = useState(budget ? centsToInput(budget.limitCents) : '');
  const [categoryError, setCategoryError] = useState<string | undefined>();
  const [limitError, setLimitError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);

  const options = useMemo(
    () =>
      (categories.data ?? [])
        .filter(
          (category) => category.kind === 'expense' && !budgetedCategoryIds.includes(category.id),
        )
        .map((category) => ({ value: category.id, label: category.name })),
    [categories.data, budgetedCategoryIds],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = parseMoneyInput(limit);
    setLimitError(parsed.ok ? undefined : parsed.error);
    setCategoryError(categoryId ? undefined : 'Escolha a categoria.');
    if (!parsed.ok || !categoryId) return;

    try {
      await upsert.mutateAsync({ categoryId, month, limitCents: parsed.cents });
      onClose();
    } catch (error) {
      setFormError(formErrorMessage(error));
    }
  }

  return (
    <Modal
      title={editing ? `Editar orçamento — ${budget.categoryName}` : 'Novo orçamento'}
      onClose={onClose}
    >
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <p className="text-sm text-slate-600">Limite de gastos em {formatMonth(month)}.</p>
        {!editing ? (
          <SelectField
            label="Categoria"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            placeholder="Escolha…"
            options={options}
            error={categoryError}
          />
        ) : null}
        <MoneyField
          label="Limite do mês"
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          error={limitError}
        />
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={upsert.isPending}>
            {upsert.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
