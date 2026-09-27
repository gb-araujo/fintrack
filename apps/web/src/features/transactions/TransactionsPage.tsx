import { isFutureDate, type ManualTransactionType, type Transaction } from '@fintrack/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import {
  ConfirmDialog,
  EmptyState,
  FormError,
  QueryError,
  Spinner,
} from '../../components/ui/Feedback';
import { InputField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import { formErrorMessage } from '../../lib/form-errors';
import type { TransactionFilters as Filters } from '../../services/ledger';
import {
  useAccounts,
  useCancelTransaction,
  useCancelTransfer,
  useCategories,
  useCompleteTransaction,
  useCompleteTransfer,
  useTransactions,
} from '../ledger/queries';
import { useToday } from '../ledger/useToday';
import { TransactionFilters } from './TransactionFilters';
import { TransactionFormModal } from './TransactionFormModal';
import { describeTransaction } from './describe-transaction';
import { TransactionRow } from './TransactionRow';
import { TransferFormModal } from './TransferFormModal';

type Dialog =
  | { kind: 'form'; type: ManualTransactionType; transaction?: Transaction }
  | { kind: 'transfer'; leg?: Transaction }
  | { kind: 'complete'; transaction: Transaction }
  | { kind: 'cancel'; transaction: Transaction };

export function TransactionsPage() {
  const [filters, setFilters] = useState<Filters>({});
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const today = useToday();

  const accounts = useAccounts(true);
  const categories = useCategories(true);
  const transactions = useTransactions(filters);
  const completeTransaction = useCompleteTransaction();
  const completeTransfer = useCompleteTransfer();

  const accountsById = useMemo(
    () => new Map((accounts.data ?? []).map((a) => [a.id, a])),
    [accounts.data],
  );
  const categoriesById = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.id, c])),
    [categories.data],
  );
  const busy = completeTransaction.isPending || completeTransfer.isPending;

  async function complete(transaction: Transaction, transactionDate?: string) {
    setActionError(null);
    const input = {
      id: transaction.transfer?.id ?? transaction.id,
      ...(transactionDate ? { transactionDate } : {}),
    };
    try {
      if (transaction.transfer) await completeTransfer.mutateAsync(input);
      else await completeTransaction.mutateAsync(input);
      setDialog(null);
    } catch (error) {
      setActionError(formErrorMessage(error));
    }
  }

  function requestComplete(transaction: Transaction) {
    // Pendente com data futura: pergunta em que dia foi pago/recebido (nada é efetivado no futuro).
    if (isFutureDate(transaction.transactionDate, today))
      setDialog({ kind: 'complete', transaction });
    else void complete(transaction);
  }

  function requestEdit(transaction: Transaction) {
    setDialog(
      transaction.transfer
        ? { kind: 'transfer', leg: transaction }
        : { kind: 'form', type: transaction.type as ManualTransactionType, transaction },
    );
  }

  const items = transactions.data ?? [];
  const filtered = Object.keys(filters).length > 0;

  return (
    <>
      <PageHeader
        title="Transações"
        description="Receitas, despesas e transferências. Pendentes são previsões: só alteram o saldo depois de efetivadas."
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <Button onClick={() => setDialog({ kind: 'form', type: 'income' })}>Nova receita</Button>
        <Button variant="secondary" onClick={() => setDialog({ kind: 'form', type: 'expense' })}>
          Nova despesa
        </Button>
        <Button variant="secondary" onClick={() => setDialog({ kind: 'transfer' })}>
          Nova transferência
        </Button>
      </div>

      <TransactionFilters
        accounts={(accounts.data ?? []).filter((a) => !a.archivedAt)}
        filters={filters}
        onChange={setFilters}
      />

      {actionError && dialog?.kind !== 'complete' ? (
        <p role="alert" className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {actionError}
        </p>
      ) : null}

      {transactions.isPending ? (
        <Spinner />
      ) : transactions.isError ? (
        <QueryError error={transactions.error} onRetry={() => void transactions.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState title={filtered ? 'Nenhum lançamento encontrado' : 'Nenhum lançamento ainda'}>
          {filtered
            ? 'Ajuste ou limpe os filtros.'
            : 'Use os botões acima para lançar sua primeira receita, despesa ou transferência.'}
        </EmptyState>
      ) : (
        <>
          <ul
            aria-label="Lançamentos"
            className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm"
          >
            {items.map((transaction) => (
              <TransactionRow
                key={transaction.id}
                transaction={transaction}
                accountsById={accountsById}
                categoriesById={categoriesById}
                busy={busy}
                onComplete={requestComplete}
                onEdit={requestEdit}
                onCancel={(t) => {
                  setActionError(null);
                  setDialog({ kind: 'cancel', transaction: t });
                }}
              />
            ))}
          </ul>
          {transactions.hasNextPage ? (
            <div className="mt-4 text-center">
              <Button
                variant="secondary"
                disabled={transactions.isFetchingNextPage}
                onClick={() => void transactions.fetchNextPage()}
              >
                {transactions.isFetchingNextPage ? 'Carregando…' : 'Carregar mais'}
              </Button>
            </div>
          ) : null}
        </>
      )}

      {dialog?.kind === 'form' ? (
        <TransactionFormModal
          type={dialog.type}
          {...(dialog.transaction ? { transaction: dialog.transaction } : {})}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'transfer' ? (
        <TransferFormModal
          {...(dialog.leg ? { leg: dialog.leg } : {})}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'complete' ? (
        <CompleteDateModal
          transaction={dialog.transaction}
          today={today}
          pending={busy}
          error={actionError}
          onSubmit={(date) => void complete(dialog.transaction, date)}
          onClose={() => setDialog(null)}
        />
      ) : null}
      {dialog?.kind === 'cancel' ? (
        <CancelDialog
          transaction={dialog.transaction}
          description={describeTransaction(dialog.transaction, accountsById, categoriesById).title}
          onDone={() => setDialog(null)}
        />
      ) : null}
    </>
  );
}

function CancelDialog({
  transaction,
  description,
  onDone,
}: {
  transaction: Transaction;
  description: string;
  onDone: () => void;
}) {
  const cancelTransaction = useCancelTransaction();
  const cancelTransfer = useCancelTransfer();
  const [error, setError] = useState<string | null>(null);
  const isTransfer = transaction.transfer !== null;

  async function confirm() {
    setError(null);
    try {
      if (transaction.transfer) await cancelTransfer.mutateAsync(transaction.transfer.id);
      else await cancelTransaction.mutateAsync(transaction.id);
      onDone();
    } catch (mutationError) {
      setError(formErrorMessage(mutationError));
    }
  }

  return (
    <ConfirmDialog
      title={isTransfer ? 'Cancelar transferência?' : 'Cancelar lançamento?'}
      message={
        isTransfer
          ? `"${description}" será cancelada nas duas contas. O histórico é mantido, mas ela deixa de contar no saldo.`
          : `"${description}" deixa de contar no saldo, nos relatórios e no orçamento. O histórico é mantido.`
      }
      confirmLabel="Cancelar lançamento"
      pending={cancelTransaction.isPending || cancelTransfer.isPending}
      error={error}
      onConfirm={() => void confirm()}
      onCancel={onDone}
    />
  );
}

function CompleteDateModal({
  transaction,
  today,
  pending,
  error,
  onSubmit,
  onClose,
}: {
  transaction: Transaction;
  today: string;
  pending: boolean;
  error: string | null;
  onSubmit: (date: string) => void;
  onClose: () => void;
}) {
  const [date, setDate] = useState(today);
  const [localError, setLocalError] = useState<string | null>(null);

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!date || isFutureDate(date, today)) {
      setLocalError('Informe a data em que aconteceu (até hoje).');
      return;
    }
    setLocalError(null);
    onSubmit(date);
  }

  return (
    <Modal
      title={transaction.type === 'income' ? 'Quando você recebeu?' : 'Quando você pagou?'}
      onClose={onClose}
    >
      <form noValidate onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-slate-600">
          O vencimento é futuro. Informe o dia em que realmente aconteceu para efetivar o
          lançamento.
        </p>
        <InputField
          label="Data"
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
          max={today}
        />
        <FormError message={localError ?? error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Voltar
          </Button>
          <Button type="submit" disabled={pending}>
            Efetivar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
