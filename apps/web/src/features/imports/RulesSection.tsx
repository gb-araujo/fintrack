import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { EmptyState, FormError, QueryError, Spinner } from '../../components/ui/Feedback';
import { InputField, SelectField } from '../../components/ui/Fields';
import { formErrorMessage } from '../../lib/form-errors';
import { useAccounts, useCategories } from '../ledger/queries';
import { useCreateRule, useDeleteRule, useRules } from './queries';

type RuleType = 'expense' | 'income' | 'transfer';

const TYPE_LABEL: Record<RuleType, string> = {
  expense: 'Despesa',
  income: 'Receita',
  transfer: 'Transferência',
};

/** Regras "descrição parecida com X → categoria/tipo/conta": orientam as sugestões da importação. */
export function RulesSection() {
  const rules = useRules();
  const categories = useCategories(true);
  const accounts = useAccounts(true);
  const create = useCreateRule();
  const remove = useDeleteRule();
  const [pattern, setPattern] = useState('');
  const [type, setType] = useState<RuleType>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [targetAccountId, setTargetAccountId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const categoryOptions = useMemo(
    () =>
      (categories.data ?? [])
        .filter((category) => category.kind === type && category.archivedAt === null)
        .map((category) => ({ value: category.id, label: category.name })),
    [categories.data, type],
  );
  const accountOptions = (accounts.data ?? [])
    .filter((account) => account.archivedAt === null)
    .map((account) => ({ value: account.id, label: account.name }));
  const nameOf = (id: string | null, list: { id: string; name: string }[] | undefined) =>
    id ? (list?.find((item) => item.id === id)?.name ?? '—') : '—';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (pattern.trim().length < 2) {
      setError('Informe o texto a procurar (ao menos 2 caracteres).');
      return;
    }
    if (type === 'transfer' && !targetAccountId) {
      setError('Escolha a conta da transferência.');
      return;
    }
    try {
      await create.mutateAsync({
        pattern,
        suggestedType: type,
        ...(type === 'transfer' ? { targetAccountId } : categoryId ? { categoryId } : {}),
      });
      setPattern('');
      setCategoryId('');
    } catch (mutationError) {
      setError(formErrorMessage(mutationError));
    }
  }

  return (
    <section
      aria-labelledby="rules-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="rules-title" className="font-semibold text-slate-900">
        Regras de importação
      </h2>
      <p className="mb-3 text-xs text-slate-500">
        Quando a descrição contiver o texto, o app sugere a categoria (ou a transferência). Suas
        regras valem antes das regras padrão.
      </p>
      <form
        noValidate
        onSubmit={(event) => void handleSubmit(event)}
        className="grid gap-3 sm:grid-cols-4"
      >
        <InputField
          className="sm:col-span-2"
          label="Se a descrição contiver"
          value={pattern}
          onChange={(event) => setPattern(event.target.value)}
          placeholder="Ex.: Padaria do Zé"
          maxLength={100}
        />
        <SelectField
          label="Tipo"
          value={type}
          onChange={(event) => {
            setType(event.target.value as RuleType);
            setCategoryId('');
          }}
          options={(Object.keys(TYPE_LABEL) as RuleType[]).map((value) => ({
            value,
            label: TYPE_LABEL[value],
          }))}
        />
        {type === 'transfer' ? (
          <SelectField
            label="Conta de destino"
            value={targetAccountId}
            onChange={(event) => setTargetAccountId(event.target.value)}
            placeholder="Escolha…"
            options={accountOptions}
          />
        ) : (
          <SelectField
            label="Categoria"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            placeholder="Sem categoria"
            options={categoryOptions}
          />
        )}
        <div className="sm:col-span-4">
          <FormError message={error} />
          <Button type="submit" size="sm" className="mt-2" disabled={create.isPending}>
            Adicionar regra
          </Button>
        </div>
      </form>

      <div className="mt-4">
        {rules.isPending ? (
          <Spinner />
        ) : rules.isError ? (
          <QueryError error={rules.error} onRetry={() => void rules.refetch()} />
        ) : rules.data.length === 0 ? (
          <EmptyState title="Nenhuma regra própria" />
        ) : (
          <ul className="divide-y divide-slate-100" aria-label="Regras de importação">
            {rules.data.map((rule) => (
              <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span className="min-w-0 text-sm">
                  <span className="font-medium text-slate-900">{rule.pattern}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    → {TYPE_LABEL[rule.suggestedType]}
                    {rule.suggestedType === 'transfer'
                      ? ` para ${nameOf(rule.targetAccountId, accounts.data)}`
                      : rule.categoryId
                        ? ` · ${nameOf(rule.categoryId, categories.data)}`
                        : ''}
                  </span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remover regra ${rule.pattern}`}
                  disabled={remove.isPending}
                  onClick={() => void remove.mutateAsync(rule.id)}
                >
                  Remover
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
