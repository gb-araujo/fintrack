import { MAX_INSTALLMENTS, descriptionSchema, isFutureDate } from '@fintrack/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { FormError } from '../../components/ui/Feedback';
import { InputField, MoneyField, SelectField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import { formErrorMessage } from '../../lib/form-errors';
import { parseMoneyInput } from '../../lib/money-input';
import { useCategories } from '../ledger/queries';
import { useToday } from '../ledger/useToday';
import { useCreatePurchase } from './queries';

interface Errors {
  description?: string;
  amount?: string;
  installments?: string;
  date?: string;
}

/**
 * Lança uma compra no cartão. O servidor divide em parcelas (o resto dos centavos vai na primeira) e
 * escolhe a fatura de cada uma pela data e pelo fechamento — o app não recalcula nada disso.
 */
export function PurchaseFormModal({ cardId, onClose }: { cardId: string; onClose: () => void }) {
  const today = useToday();
  const categories = useCategories(false);
  const create = useCreatePurchase();
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [installments, setInstallments] = useState('1');
  const [date, setDate] = useState(today);
  const [categoryId, setCategoryId] = useState('');
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const categoryOptions = useMemo(
    () =>
      (categories.data ?? [])
        .filter((category) => category.kind === 'expense')
        .map((category) => ({ value: category.id, label: category.name })),
    [categories.data],
  );

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Errors = {};
    const parsedDescription = descriptionSchema
      .min(1, { error: 'Informe a descrição da compra.' })
      .safeParse(description);
    if (!parsedDescription.success) {
      nextErrors.description = parsedDescription.error.issues[0]?.message;
    }
    const parsedAmount = parseMoneyInput(amount);
    if (!parsedAmount.ok) nextErrors.amount = parsedAmount.error;
    const count = Number(installments);
    if (!Number.isInteger(count) || count < 1 || count > MAX_INSTALLMENTS) {
      nextErrors.installments = `Informe de 1 a ${MAX_INSTALLMENTS} parcelas.`;
    }
    if (!date) nextErrors.date = 'Informe a data da compra.';
    else if (isFutureDate(date, today)) nextErrors.date = 'A data da compra não pode ser futura.';
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0 || !parsedDescription.success || !parsedAmount.ok)
      return;

    try {
      await create.mutateAsync({
        cardId,
        input: {
          description: parsedDescription.data,
          purchaseDate: date,
          totalAmountCents: parsedAmount.cents,
          installmentsCount: count,
          ...(categoryId ? { categoryId } : {}),
        },
      });
      onClose();
    } catch (error) {
      setFormError(formErrorMessage(error));
    }
  }

  return (
    <Modal title="Nova compra no cartão" onClose={onClose}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <InputField
          label="Descrição"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          error={errors.description}
          placeholder="Ex.: Notebook"
          maxLength={200}
        />
        <MoneyField
          label="Valor total"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
          error={errors.amount}
        />
        <InputField
          label="Parcelas"
          type="number"
          min={1}
          max={MAX_INSTALLMENTS}
          value={installments}
          onChange={(event) => setInstallments(event.target.value)}
          error={errors.installments}
          hint="Cada parcela entra em uma fatura, mês a mês."
        />
        <InputField
          label="Data da compra"
          type="date"
          value={date}
          max={today}
          onChange={(event) => setDate(event.target.value)}
          error={errors.date}
        />
        <SelectField
          label="Categoria"
          value={categoryId}
          onChange={(event) => setCategoryId(event.target.value)}
          placeholder="Sem categoria"
          options={categoryOptions}
        />
        <FormError message={formError} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={create.isPending}>
            {create.isPending ? 'Salvando…' : 'Salvar'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
