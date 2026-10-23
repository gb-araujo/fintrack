import { creditCardNameSchema, type CreditCard } from '@fintrack/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { FormError } from '../../components/ui/Feedback';
import { InputField, MoneyField, SelectField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import { formErrorMessage } from '../../lib/form-errors';
import { centsToInput, parseMoneyInput } from '../../lib/money-input';
import { useAccounts } from '../ledger/queries';
import { useCreateCard, useUpdateCard } from './queries';

interface Errors {
  name?: string;
  limit?: string;
  closingDay?: string;
  dueDay?: string;
}

const validDay = (text: string) => {
  const day = Number(text);
  return Number.isInteger(day) && day >= 1 && day <= 31 ? day : null;
};

/** Cria ou edita um cartão. Fechamento/vencimento novos valem só para faturas ainda não criadas. */
export function CreditCardFormModal({ card, onClose }: { card?: CreditCard; onClose: () => void }) {
  const editing = card !== undefined;
  const accounts = useAccounts(false);
  const create = useCreateCard();
  const update = useUpdateCard();
  const [name, setName] = useState(card?.name ?? '');
  const [limit, setLimit] = useState(card ? centsToInput(card.limitCents) : '');
  const [closingDay, setClosingDay] = useState(card ? String(card.closingDay) : '');
  const [dueDay, setDueDay] = useState(card ? String(card.dueDay) : '');
  const [paymentAccountId, setPaymentAccountId] = useState(card?.paymentAccountId ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const submitting = create.isPending || update.isPending;

  const paymentAccounts = useMemo(
    () => (accounts.data ?? []).filter((account) => account.type !== 'investment'),
    [accounts.data],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Errors = {};
    const parsedName = creditCardNameSchema.safeParse(name);
    if (!parsedName.success) nextErrors.name = parsedName.error.issues[0]?.message;
    const parsedLimit = parseMoneyInput(limit);
    if (!parsedLimit.ok) nextErrors.limit = parsedLimit.error;
    const closing = validDay(closingDay);
    if (closing === null) nextErrors.closingDay = 'Informe um dia entre 1 e 31.';
    const due = validDay(dueDay);
    if (due === null) nextErrors.dueDay = 'Informe um dia entre 1 e 31.';
    setErrors(nextErrors);
    if (
      Object.keys(nextErrors).length > 0 ||
      !parsedName.success ||
      !parsedLimit.ok ||
      closing === null ||
      due === null
    ) {
      return;
    }

    const input = {
      name: parsedName.data,
      limitCents: parsedLimit.cents,
      closingDay: closing,
      dueDay: due,
    };
    try {
      if (editing) {
        await update.mutateAsync({
          id: card.id,
          input: { ...input, paymentAccountId: paymentAccountId || null },
        });
      } else {
        await create.mutateAsync({
          ...input,
          ...(paymentAccountId ? { paymentAccountId } : {}),
        });
      }
      onClose();
    } catch (error) {
      setFormError(formErrorMessage(error));
    }
  }

  return (
    <Modal title={editing ? 'Editar cartão' : 'Novo cartão'} onClose={onClose}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <InputField
          label="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          error={errors.name}
          placeholder="Ex.: Nubank"
          maxLength={60}
        />
        <MoneyField
          label="Limite"
          value={limit}
          onChange={(event) => setLimit(event.target.value)}
          error={errors.limit}
        />
        <div className="grid grid-cols-2 gap-3">
          <InputField
            label="Dia do fechamento"
            type="number"
            min={1}
            max={31}
            value={closingDay}
            onChange={(event) => setClosingDay(event.target.value)}
            error={errors.closingDay}
          />
          <InputField
            label="Dia do vencimento"
            type="number"
            min={1}
            max={31}
            value={dueDay}
            onChange={(event) => setDueDay(event.target.value)}
            error={errors.dueDay}
          />
        </div>
        <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
          Compras até o dia do fechamento entram na fatura do mês; depois, na seguinte. Em meses
          mais curtos vale o último dia.
        </p>
        <SelectField
          label="Conta para pagar a fatura"
          value={paymentAccountId}
          onChange={(event) => setPaymentAccountId(event.target.value)}
          placeholder="Escolho na hora de pagar"
          options={paymentAccounts.map((account) => ({ value: account.id, label: account.name }))}
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
