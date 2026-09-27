import { formatBRL, isFutureDate, type InvoiceDetail } from '@fintrack/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { FormError } from '../../components/ui/Feedback';
import { InputField, MoneyField, SelectField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import { formErrorMessage } from '../../lib/form-errors';
import { centsToInput, parseMoneyInput } from '../../lib/money-input';
import { formatDate } from '../ledger/labels';
import { useAccounts } from '../ledger/queries';
import { useToday } from '../ledger/useToday';
import { usePayInvoice } from './queries';

/**
 * Paga (ou agenda) a fatura. Sai do saldo da conta escolhida, mas NÃO é despesa: as parcelas já
 * foram contadas. O valor sugerido é o que resta pagar (o servidor confere o limite do devido).
 */
export function PayInvoiceModal({
  invoice,
  paymentAccountId,
  payableCents,
  onClose,
}: {
  invoice: InvoiceDetail;
  paymentAccountId: string | null;
  payableCents: number;
  onClose: () => void;
}) {
  const today = useToday();
  const accounts = useAccounts(false);
  const pay = usePayInvoice();
  const [accountId, setAccountId] = useState(paymentAccountId ?? '');
  const [amount, setAmount] = useState(centsToInput(payableCents));
  const [date, setDate] = useState(today);
  const [errors, setErrors] = useState<{ account?: string; amount?: string; date?: string }>({});
  const [formError, setFormError] = useState<string | null>(null);

  const usable = useMemo(
    () => (accounts.data ?? []).filter((account) => account.type !== 'investment'),
    [accounts.data],
  );
  const effectiveAccountId = accountId || usable[0]?.id || '';
  const scheduled = date !== '' && isFutureDate(date, today);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    const parsed = parseMoneyInput(amount);
    const nextErrors: typeof errors = {};
    if (!parsed.ok) nextErrors.amount = parsed.error;
    if (!effectiveAccountId) nextErrors.account = 'Escolha a conta pagadora.';
    if (!date) nextErrors.date = 'Informe a data do pagamento.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !parsed.ok) return;

    try {
      await pay.mutateAsync({
        id: invoice.id,
        input: { accountId: effectiveAccountId, amountCents: parsed.cents, paymentDate: date },
      });
      onClose();
    } catch (error) {
      setFormError(formErrorMessage(error));
    }
  }

  return (
    <Modal title="Pagar fatura" onClose={onClose}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <p className="text-sm text-slate-600">
          {invoice.cardName} — vence em {formatDate(invoice.dueDate)}. Ainda resta pagar{' '}
          <strong>{formatBRL(payableCents)}</strong>.
        </p>
        <SelectField
          label="Conta pagadora"
          value={effectiveAccountId}
          onChange={(event) => setAccountId(event.target.value)}
          error={errors.account}
          options={usable.map((account) => ({ value: account.id, label: account.name }))}
        />
        <MoneyField
          label="Valor"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={errors.amount}
          hint="Pode ser parcial."
        />
        <InputField
          label="Data do pagamento"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          error={errors.date}
          hint={
            scheduled
              ? 'Data futura: o pagamento fica agendado e só sai da conta quando for efetivado.'
              : 'Sai da conta nesta data.'
          }
        />
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pay.isPending}>
            {pay.isPending ? 'Pagando…' : scheduled ? 'Agendar' : 'Pagar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
