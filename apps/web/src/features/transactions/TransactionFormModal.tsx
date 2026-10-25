import {
  PAYMENT_METHODS,
  descriptionSchema,
  isFutureDate,
  type ManualTransactionType,
  type PaymentMethod,
  type Transaction,
} from '@fintrack/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { FormError, Spinner } from '../../components/ui/Feedback';
import { CheckboxField, InputField, MoneyField, SelectField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import { formErrorMessage } from '../../lib/form-errors';
import { centsToInput, parseMoneyInput } from '../../lib/money-input';
import { PAYMENT_METHOD_LABEL } from '../ledger/labels';
import {
  useAccounts,
  useCategories,
  useCreateTransaction,
  useUpdateTransaction,
} from '../ledger/queries';
import { useToday } from '../ledger/useToday';

interface Errors {
  account?: string;
  amount?: string;
  date?: string;
  description?: string;
}

/** Cria ou edita uma receita/despesa. Transferências têm formulário próprio. */
export function TransactionFormModal({
  transaction,
  type: initialType = 'expense',
  onClose,
}: {
  transaction?: Transaction;
  type?: ManualTransactionType;
  onClose: () => void;
}) {
  const editing = transaction !== undefined;
  const type: ManualTransactionType = editing
    ? (transaction.type as ManualTransactionType)
    : initialType;
  const today = useToday();
  const accounts = useAccounts(false);
  const categories = useCategories(false);
  const create = useCreateTransaction();
  const update = useUpdateTransaction();

  const [accountId, setAccountId] = useState(transaction?.accountId ?? '');
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '');
  const [amount, setAmount] = useState(transaction ? centsToInput(transaction.amountCents) : '');
  const [date, setDate] = useState(transaction?.transactionDate ?? today);
  const [description, setDescription] = useState(transaction?.description ?? '');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>(
    transaction?.paymentMethod ?? '',
  );
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Receitas e despesas não são lançadas em contas de investimento (aplicação/resgate = transferência).
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

  const futureDate = isFutureDate(date, today);
  const effectiveAccountId = accountId || usableAccounts[0]?.id || '';
  const submitting = create.isPending || update.isPending;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);

    const nextErrors: Errors = {};
    const parsedAmount = parseMoneyInput(amount);
    if (!parsedAmount.ok) nextErrors.amount = parsedAmount.error;
    if (!effectiveAccountId) nextErrors.account = 'Escolha a conta.';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) nextErrors.date = 'Informe a data.';
    const parsedDescription = descriptionSchema.safeParse(description);
    if (!parsedDescription.success)
      nextErrors.description = parsedDescription.error.issues[0]?.message;
    setErrors(nextErrors);
    if (!parsedAmount.ok || !parsedDescription.success || Object.keys(nextErrors).length > 0)
      return;

    try {
      if (editing) {
        await update.mutateAsync({
          id: transaction.id,
          input: {
            accountId: effectiveAccountId,
            categoryId: categoryId || null,
            amountCents: parsedAmount.cents,
            description: parsedDescription.data,
            transactionDate: date,
            paymentMethod: paymentMethod || null,
          },
        });
      } else {
        await create.mutateAsync({
          accountId: effectiveAccountId,
          type,
          categoryId: categoryId || null,
          amountCents: parsedAmount.cents,
          description: parsedDescription.data,
          transactionDate: date,
          paymentMethod: paymentMethod || null,
          // Sem status: a API decide pela data (até hoje = efetivado, futuro = pendente).
          ...(pending ? { status: 'pending' as const } : {}),
        });
      }
      onClose();
    } catch (error) {
      setFormError(formErrorMessage(error));
    }
  }

  const title = `${editing ? 'Editar' : 'Nova'} ${type === 'income' ? 'receita' : 'despesa'}`;

  return (
    <Modal title={title} onClose={onClose}>
      {accounts.isPending || categories.isPending ? (
        <Spinner />
      ) : usableAccounts.length === 0 ? (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Cadastre uma conta bancária ou carteira antes de lançar receitas e despesas.
        </p>
      ) : (
        <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
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
            label="Descrição"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            error={errors.description}
            maxLength={200}
            placeholder={type === 'income' ? 'Ex.: Salário' : 'Ex.: Supermercado'}
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
          <SelectField
            label="Forma de pagamento"
            value={paymentMethod}
            onChange={(event) => setPaymentMethod(event.target.value as PaymentMethod | '')}
            placeholder="Não informar"
            options={PAYMENT_METHODS.map((value) => ({
              value,
              label: PAYMENT_METHOD_LABEL[value],
            }))}
          />
          {!editing ? (
            <CheckboxField
              label={
                type === 'income' ? 'Ainda não recebi (pendente)' : 'Ainda não paguei (pendente)'
              }
              checked={pending || futureDate}
              disabled={futureDate}
              onChange={(event) => setPending(event.target.checked)}
              hint={
                futureDate
                  ? 'Data futura: fica como pendente até você marcar como pago ou recebido.'
                  : 'Pendentes não alteram o saldo até serem efetivados.'
              }
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
