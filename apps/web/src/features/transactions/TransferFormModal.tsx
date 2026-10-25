import { descriptionSchema, isFutureDate, type Transaction } from '@fintrack/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { FormError, Spinner } from '../../components/ui/Feedback';
import { CheckboxField, InputField, MoneyField, SelectField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import { formErrorMessage } from '../../lib/form-errors';
import { centsToInput, parseMoneyInput } from '../../lib/money-input';
import { useAccounts, useCreateTransfer, useUpdateTransfer } from '../ledger/queries';
import { useToday } from '../ledger/useToday';

interface Errors {
  from?: string;
  to?: string;
  amount?: string;
  date?: string;
  description?: string;
}

/**
 * Transferência entre contas (ex.: Banco Inter → Mercado Pago). Não é receita nem despesa e não
 * altera o total. Para editar, recebe uma das pernas da transferência.
 */
export function TransferFormModal({ leg, onClose }: { leg?: Transaction; onClose: () => void }) {
  const editing = Boolean(leg?.transfer);
  const today = useToday();
  const accounts = useAccounts(false);
  const create = useCreateTransfer();
  const update = useUpdateTransfer();

  const [fromId, setFromId] = useState(leg?.transfer?.fromAccountId ?? '');
  const [toId, setToId] = useState(leg?.transfer?.toAccountId ?? '');
  const [amount, setAmount] = useState(leg ? centsToInput(leg.amountCents) : '');
  const [date, setDate] = useState(leg?.transactionDate ?? today);
  const [description, setDescription] = useState(leg?.description ?? '');
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const options = (accounts.data ?? []).map((account) => ({
    value: account.id,
    label: account.name,
  }));
  const from = fromId || options[0]?.value || '';
  const to = toId || options.find((option) => option.value !== from)?.value || '';
  const futureDate = isFutureDate(date, today);
  const submitting = create.isPending || update.isPending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Errors = {};
    const parsedAmount = parseMoneyInput(amount);
    if (!parsedAmount.ok) nextErrors.amount = parsedAmount.error;
    if (!from) nextErrors.from = 'Escolha a conta de origem.';
    if (!to) nextErrors.to = 'Escolha a conta de destino.';
    else if (from === to) nextErrors.to = 'A conta de origem e a de destino devem ser diferentes.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) nextErrors.date = 'Informe a data.';
    const parsedDescription = descriptionSchema.safeParse(description);
    if (!parsedDescription.success)
      nextErrors.description = parsedDescription.error.issues[0]?.message;
    setErrors(nextErrors);
    if (!parsedAmount.ok || !parsedDescription.success || Object.keys(nextErrors).length > 0)
      return;

    try {
      if (leg?.transfer) {
        await update.mutateAsync({
          id: leg.transfer.id,
          input: {
            fromAccountId: from,
            toAccountId: to,
            amountCents: parsedAmount.cents,
            transferDate: date,
            description: parsedDescription.data,
          },
        });
      } else {
        await create.mutateAsync({
          fromAccountId: from,
          toAccountId: to,
          amountCents: parsedAmount.cents,
          transferDate: date,
          description: parsedDescription.data,
          ...(pending ? { status: 'pending' as const } : {}),
        });
      }
      onClose();
    } catch (error) {
      setFormError(formErrorMessage(error));
    }
  }

  return (
    <Modal title={editing ? 'Editar transferência' : 'Nova transferência'} onClose={onClose}>
      {accounts.isPending ? (
        <Spinner />
      ) : options.length < 2 ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Cadastre pelo menos duas contas para transferir entre elas.
        </p>
      ) : (
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <p className="rounded-lg bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs text-slate-600 dark:text-slate-300">
            Transferir entre suas contas não é receita nem despesa e não muda o seu total. Para
            aplicar em investimento ou resgatar, transfira de/para a conta de investimento.
          </p>
          <SelectField
            label="De (origem)"
            value={from}
            onChange={(event) => setFromId(event.target.value)}
            error={errors.from}
            options={options}
          />
          <SelectField
            label="Para (destino)"
            value={to}
            onChange={(event) => setToId(event.target.value)}
            error={errors.to}
            options={options}
          />
          <MoneyField
            label="Valor"
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            error={errors.amount}
          />
          <InputField
            label="Data"
            type="date"
            value={date}
            onChange={(event) => setDate(event.target.value)}
            error={errors.date}
          />
          <InputField
            label="Descrição (opcional)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            error={errors.description}
            maxLength={200}
          />
          {!editing ? (
            <CheckboxField
              label="Ainda não aconteceu (pendente)"
              checked={pending || futureDate}
              disabled={futureDate}
              onChange={(event) => setPending(event.target.checked)}
              hint={futureDate ? 'Data futura: fica pendente até você efetivar.' : undefined}
            />
          ) : null}
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
      )}
    </Modal>
  );
}
