import type { Account, Category, Transaction } from '@fintrack/shared';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Feedback';
import { formatDate, formatSigned } from '../ledger/labels';
import { describeTransaction } from './describe-transaction';

export interface TransactionRowProps {
  transaction: Transaction;
  accountsById: Map<string, Account>;
  categoriesById: Map<string, Category>;
  busy: boolean;
  onComplete: (transaction: Transaction) => void;
  onEdit: (transaction: Transaction) => void;
  onCancel: (transaction: Transaction) => void;
}

/** Valor com sinal do ponto de vista da conta do lançamento (apenas apresentação). */
function signedAmount(transaction: Transaction): number {
  const positive =
    transaction.type === 'income' ||
    (transaction.type === 'transfer' && transaction.transfer?.direction === 'in');
  return positive ? transaction.amountCents : -transaction.amountCents;
}

export function TransactionRow({
  transaction,
  accountsById,
  categoriesById,
  busy,
  onComplete,
  onEdit,
  onCancel,
}: TransactionRowProps) {
  const { title, subtitle } = describeTransaction(transaction, accountsById, categoriesById);
  const cents = signedAmount(transaction);
  const cancelled = transaction.status === 'cancelled';
  const isTransfer = transaction.type === 'transfer';
  const isCardPayment = transaction.type === 'card_payment';
  // Transferência e pagamento de fatura não são despesa (a despesa já foi contada nas parcelas):
  // valor em cinza, para não parecer uma despesa nova.
  const tone =
    isTransfer || isCardPayment
      ? 'text-slate-600'
      : cents > 0
        ? 'text-emerald-700'
        : 'text-rose-600';

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p
          className={`truncate font-medium ${cancelled ? 'text-slate-400 line-through' : 'text-slate-900'}`}
        >
          {title}
        </p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
          <span>{formatDate(transaction.transactionDate)}</span>
          <span>{subtitle}</span>
          {transaction.status === 'pending' ? <Badge tone="amber">Pendente</Badge> : null}
          {cancelled ? <Badge>Cancelado</Badge> : null}
          {isTransfer ? <Badge tone="sky">Transferência</Badge> : null}
          {isCardPayment ? <Badge tone="sky">Pagamento de fatura</Badge> : null}
        </p>
      </div>

      <div className="flex items-center justify-between gap-3 sm:justify-end">
        <span
          className={`text-base font-semibold tabular-nums ${cancelled ? 'text-slate-400 line-through' : tone}`}
          aria-label={`Valor: ${formatSigned(cents)}`}
        >
          {formatSigned(cents)}
        </span>
        {!cancelled ? (
          <span className="flex gap-1">
            {transaction.status === 'pending' ? (
              <Button size="sm" disabled={busy} onClick={() => onComplete(transaction)}>
                {isTransfer ? 'Efetivar' : transaction.type === 'income' ? 'Recebi' : 'Paguei'}
              </Button>
            ) : null}
            {/* Pagamento de fatura não se edita: cancele e pague de novo (a API recusa a edição). */}
            {isCardPayment ? null : (
              <Button
                variant="secondary"
                size="sm"
                disabled={busy}
                onClick={() => onEdit(transaction)}
              >
                Editar
              </Button>
            )}
            <Button variant="ghost" size="sm" disabled={busy} onClick={() => onCancel(transaction)}>
              Cancelar
            </Button>
          </span>
        ) : null}
      </div>
    </li>
  );
}
