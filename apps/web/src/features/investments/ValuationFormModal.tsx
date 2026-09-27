import { type InvestmentValuation } from '@fintrack/shared';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { FormError } from '../../components/ui/Feedback';
import { InputField, MoneyField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import { formErrorMessage } from '../../lib/form-errors';
import { centsToInput, parseMoneyInput } from '../../lib/money-input';
import { useToday } from '../ledger/useToday';
import { useUpsertValuation } from './queries';

interface Errors {
  date?: string;
  balance?: string;
}

/**
 * Registra "minha posição valia X nesta data" — o extrato da corretora, checado pelo usuário.
 * Já existe uma avaliação na mesma data? Corrige o valor dela (nunca duplica — ADR 0020).
 */
export function ValuationFormModal({
  accountId,
  valuation,
  onClose,
}: {
  accountId: string;
  /** Presente ao corrigir uma avaliação existente. */
  valuation?: InvestmentValuation;
  onClose: () => void;
}) {
  const today = useToday();
  const upsert = useUpsertValuation();
  const [date, setDate] = useState(valuation?.date ?? today);
  const [balance, setBalance] = useState(valuation ? centsToInput(valuation.balanceCents) : '');
  const [note, setNote] = useState(valuation?.note ?? '');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Errors = {};
    const parsedBalance = parseMoneyInput(balance, { allowZero: true });
    if (!parsedBalance.ok) nextErrors.balance = parsedBalance.error;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) nextErrors.date = 'Informe a data.';
    else if (date > today) nextErrors.date = 'A data não pode ser no futuro.';
    setErrors(nextErrors);
    if (!parsedBalance.ok || Object.keys(nextErrors).length > 0) return;

    try {
      await upsert.mutateAsync({
        accountId,
        input: { date, balanceCents: parsedBalance.cents, note: note.trim() || null },
      });
      onClose();
    } catch (error) {
      setFormError(formErrorMessage(error));
    }
  }

  return (
    <Modal title="Registrar avaliação" onClose={onClose}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
          Informe o valor total da posição no extrato da corretora nesta data. Já existe uma
          avaliação nesta data? Ela é corrigida — o histórico das outras datas não muda.
        </p>
        <InputField
          label="Data"
          type="date"
          max={today}
          value={date}
          onChange={(event) => setDate(event.target.value)}
          error={errors.date}
        />
        <MoneyField
          label="Valor total da posição"
          value={balance}
          onChange={(event) => setBalance(event.target.value)}
          error={errors.balance}
        />
        <InputField
          label="Observação (opcional)"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          maxLength={200}
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
