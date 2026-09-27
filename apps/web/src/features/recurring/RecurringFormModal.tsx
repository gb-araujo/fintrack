import {
  RECURRENCE_FREQUENCIES,
  createRecurringRequestSchema,
  recurringNameSchema,
  type ManualTransactionType,
  type RecurrenceFrequency,
  type Recurring,
} from '@fintrack/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { FormError } from '../../components/ui/Feedback';
import { CheckboxField, InputField, MoneyField, SelectField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import { formErrorMessage } from '../../lib/form-errors';
import { centsToInput, parseMoneyInput } from '../../lib/money-input';
import { FREQUENCY_LABEL } from '../ledger/labels';
import { useAccounts, useCategories } from '../ledger/queries';
import { useToday } from '../ledger/useToday';
import { useCreateRecurring, useUpdateRecurring } from './queries';

interface Errors {
  name?: string;
  amount?: string;
  account?: string;
  day?: string;
  endDate?: string;
}

/**
 * Cria ou edita uma recorrência. Tipo, frequência e início só são escolhidos na criação (mudá-los
 * reescreveria as ocorrências já confirmadas); o resto vale para as próximas ocorrências.
 */
export function RecurringFormModal({ rule, onClose }: { rule?: Recurring; onClose: () => void }) {
  const editing = rule !== undefined;
  const today = useToday();
  const accounts = useAccounts(false);
  const categories = useCategories(false);
  const create = useCreateRecurring();
  const update = useUpdateRecurring();

  const [name, setName] = useState(rule?.name ?? '');
  const [type, setType] = useState<ManualTransactionType>(rule?.type ?? 'expense');
  const [amount, setAmount] = useState(rule?.amountCents ? centsToInput(rule.amountCents) : '');
  const [isVariable, setIsVariable] = useState(rule?.isVariableAmount ?? false);
  const [accountId, setAccountId] = useState(rule?.accountId ?? '');
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>(rule?.frequency ?? 'monthly');
  const [dayOfMonth, setDayOfMonth] = useState(
    String(rule?.dayOfMonth ?? Number(today.slice(8, 10))),
  );
  const [startDate, setStartDate] = useState(rule?.startDate ?? today);
  const [endDate, setEndDate] = useState(rule?.endDate ?? '');
  const [autoConfirm, setAutoConfirm] = useState(rule?.autoConfirm ?? false);
  const [includeInForecast, setIncludeInForecast] = useState(rule?.includeInForecast ?? true);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const submitting = create.isPending || update.isPending;

  const usableAccounts = useMemo(
    () => (accounts.data ?? []).filter((account) => account.type !== 'investment'),
    [accounts.data],
  );
  const categoryOptions = useMemo(
    () =>
      (categories.data ?? [])
        .filter((category) => category.kind === type)
        .map((category) => ({ value: category.id, label: category.name })),
    [categories.data, type],
  );
  const effectiveAccountId = accountId || usableAccounts[0]?.id || '';

  function onVariableChange(next: boolean) {
    setIsVariable(next);
    // Confirmação automática só faz sentido com valor fixo (a API aplica a mesma regra).
    if (next) setAutoConfirm(false);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Errors = {};
    const parsedName = recurringNameSchema.safeParse(name);
    if (!parsedName.success) nextErrors.name = parsedName.error.issues[0]?.message;

    // Valor variável: o valor é só uma estimativa (opcional). Fixo: obrigatório.
    const parsedAmount =
      isVariable && amount.trim() === ''
        ? ({ ok: true, cents: null } as const)
        : parseMoneyInput(amount);
    if (!parsedAmount.ok) nextErrors.amount = parsedAmount.error;
    if (!effectiveAccountId) nextErrors.account = 'Escolha a conta.';

    const day = Number(dayOfMonth);
    const needsDay = frequency === 'monthly';
    if (needsDay && (!Number.isInteger(day) || day < 1 || day > 31)) {
      nextErrors.day = 'Informe um dia entre 1 e 31.';
    }
    if (endDate && endDate < startDate) nextErrors.endDate = 'O fim deve ser depois do início.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !parsedName.success || !parsedAmount.ok) return;

    try {
      if (editing) {
        await update.mutateAsync({
          id: rule.id,
          input: {
            name: parsedName.data,
            amountCents: parsedAmount.cents,
            isVariableAmount: isVariable,
            accountId: effectiveAccountId,
            categoryId: categoryId || null,
            ...(needsDay ? { dayOfMonth: day } : {}),
            endDate: endDate || null,
            autoConfirm,
            includeInForecast,
          },
        });
      } else {
        const request = createRecurringRequestSchema.parse({
          name: parsedName.data,
          type,
          amountCents: parsedAmount.cents,
          isVariableAmount: isVariable,
          accountId: effectiveAccountId,
          categoryId: categoryId || null,
          frequency,
          ...(needsDay ? { dayOfMonth: day } : {}),
          startDate,
          endDate: endDate || null,
          autoConfirm,
          includeInForecast,
        });
        await create.mutateAsync(request);
      }
      onClose();
    } catch (error) {
      setFormError(formErrorMessage(error));
    }
  }

  return (
    <Modal title={editing ? 'Editar recorrência' : 'Nova recorrência'} onClose={onClose}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <InputField
          label="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          placeholder="Ex.: Aluguel, Netflix, Salário"
          maxLength={80}
        />
        {!editing ? (
          <SelectField
            label="Tipo"
            value={type}
            onChange={(event) => {
              setType(event.target.value as ManualTransactionType);
              setCategoryId('');
            }}
            options={[
              { value: 'expense', label: 'Despesa' },
              { value: 'income', label: 'Receita' },
            ]}
          />
        ) : null}
        <MoneyField
          label={isVariable ? 'Valor estimado (opcional)' : 'Valor'}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={errors.amount}
        />
        <CheckboxField
          label="Valor variável"
          checked={isVariable}
          onChange={(event) => onVariableChange(event.target.checked)}
          hint="Ex.: conta de energia. A previsão usa o último valor confirmado."
        />
        <SelectField
          label="Conta"
          value={effectiveAccountId}
          onChange={(event) => setAccountId(event.target.value)}
          error={errors.account}
          options={usableAccounts.map((account) => ({ value: account.id, label: account.name }))}
        />
        <SelectField
          label="Categoria"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          placeholder="Sem categoria"
          options={categoryOptions}
        />
        {!editing ? (
          <SelectField
            label="Frequência"
            value={frequency}
            onChange={(event) => setFrequency(event.target.value as RecurrenceFrequency)}
            options={RECURRENCE_FREQUENCIES.map((value) => ({
              value,
              label: FREQUENCY_LABEL[value],
            }))}
          />
        ) : null}
        {frequency === 'monthly' ? (
          <InputField
            label="Dia do vencimento"
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(event) => setDayOfMonth(event.target.value)}
            error={errors.day}
            hint="Em meses mais curtos, vale o último dia do mês."
          />
        ) : null}
        {!editing ? (
          <InputField
            label="Começa em"
            type="date"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
            hint={
              frequency === 'weekly'
                ? 'Repete no mesmo dia da semana desta data.'
                : frequency === 'yearly'
                  ? 'Repete todo ano no mesmo dia e mês desta data.'
                  : undefined
            }
          />
        ) : null}
        <InputField
          label="Termina em (opcional)"
          type="date"
          value={endDate}
          onChange={(event) => setEndDate(event.target.value)}
          error={errors.endDate}
        />
        <CheckboxField
          label="Confirmar automaticamente quando chegar o dia"
          checked={autoConfirm}
          disabled={isVariable}
          onChange={(event) => setAutoConfirm(event.target.checked)}
          hint="Só para valor fixo. Sem isso, a ocorrência fica como previsão até você confirmar."
        />
        <CheckboxField
          label="Considerar nas previsões do dinheiro disponível"
          checked={includeInForecast}
          onChange={(event) => setIncludeInForecast(event.target.checked)}
        />
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
