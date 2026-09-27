import { isFutureDate, type Occurrence } from '@fintrack/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { FormError } from '../../components/ui/Feedback';
import { InputField, MoneyField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import { formErrorMessage } from '../../lib/form-errors';
import { centsToInput, parseMoneyInput } from '../../lib/money-input';
import { formatDate } from '../ledger/labels';
import { useToday } from '../ledger/useToday';
import { useConfirmOccurrence } from './queries';

/**
 * Confirma uma ocorrência prevista: vira um lançamento efetivado. O valor vem preenchido (fixo ou
 * estimado) mas pode ser corrigido; ocorrência futura só pode ser efetivada com data até hoje.
 */
export function ConfirmOccurrenceModal({
  occurrence,
  onClose,
}: {
  occurrence: Occurrence;
  onClose: () => void;
}) {
  const today = useToday();
  const confirm = useConfirmOccurrence();
  const [amount, setAmount] = useState(
    occurrence.amountCents > 0 ? centsToInput(occurrence.amountCents) : '',
  );
  const [date, setDate] = useState(isFutureDate(occurrence.date, today) ? today : occurrence.date);
  const [amountError, setAmountError] = useState<string | undefined>();
  const [dateError, setDateError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const verb = occurrence.type === 'income' ? 'recebida' : 'paga';

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = parseMoneyInput(amount);
    setAmountError(parsed.ok ? undefined : parsed.error);
    const futureDate = isFutureDate(date, today);
    setDateError(futureDate ? 'A data não pode ser futura.' : undefined);
    if (!parsed.ok || futureDate || !date) return;

    try {
      await confirm.mutateAsync({
        id: occurrence.recurringId,
        date: occurrence.date,
        input: { amountCents: parsed.cents, transactionDate: date },
      });
      onClose();
    } catch (error) {
      setFormError(formErrorMessage(error));
    }
  }

  return (
    <Modal title="Confirmar ocorrência" onClose={onClose}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <p className="text-sm text-slate-600">
          {occurrence.name} — prevista para {formatDate(occurrence.date)}.
        </p>
        <MoneyField
          label={occurrence.type === 'income' ? 'Valor recebido' : 'Valor pago'}
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={amountError}
          hint={occurrence.estimated ? 'Valor estimado: ajuste para o valor real.' : undefined}
        />
        <InputField
          label={`Data em que foi ${verb}`}
          type="date"
          value={date}
          max={today}
          onChange={(event) => setDate(event.target.value)}
          error={dateError}
        />
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={confirm.isPending}>
            {confirm.isPending ? 'Confirmando…' : 'Confirmar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
