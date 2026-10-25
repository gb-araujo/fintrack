import { formatBRL, type CreditCard, type InvoiceSummary, type Purchase } from '@fintrack/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  QueryError,
  Spinner,
} from '../../components/ui/Feedback';
import { formErrorMessage } from '../../lib/form-errors';
import { INVOICE_STATUS_LABEL, formatDate, formatMonth } from '../ledger/labels';
import { useAccounts } from '../ledger/queries';
import { CreditCardFormModal } from './CreditCardFormModal';
import { LimitBar } from './CreditCardsPage';
import { PayInvoiceModal } from './PayInvoiceModal';
import { PurchaseFormModal } from './PurchaseFormModal';
import {
  useArchiveCard,
  useCancelPurchase,
  useCard,
  useInvoice,
  useInvoices,
  usePurchases,
} from './queries';

export function CreditCardDetailPage() {
  const { cardId = '' } = useParams();
  const card = useCard(cardId);
  const [purchasing, setPurchasing] = useState(false);
  const [editing, setEditing] = useState(false);
  const archive = useArchiveCard();
  const [actionError, setActionError] = useState<string | null>(null);

  if (card.isPending) return <Spinner />;
  if (card.isError) return <QueryError error={card.error} onRetry={() => void card.refetch()} />;
  const data = card.data;

  async function toggleArchive() {
    setActionError(null);
    try {
      await archive.mutateAsync({ id: data.id, archived: data.archivedAt === null });
    } catch (error) {
      setActionError(formErrorMessage(error));
    }
  }

  return (
    <>
      <Link to="/credit-cards" className="text-sm text-brand-700 dark:text-brand-400 hover:underline">
        ← Cartões
      </Link>
      <div className="mt-2">
        <PageHeader
          title={data.name}
          description={`Fecha dia ${data.closingDay} · vence dia ${data.dueDay}${data.archivedAt ? ' · arquivado' : ''}`}
        />
      </div>

      <section
        aria-label="Limite"
        className="mb-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
      >
        <LimitBar card={data} />
        <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Limite</dt>
            <dd className="tabular-nums">{formatBRL(data.limitCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Usado</dt>
            <dd className="tabular-nums" aria-label="Limite usado">
              {formatBRL(data.usedLimitCents)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500 dark:text-slate-400">Disponível</dt>
            <dd
              className={`tabular-nums ${data.availableLimitCents < 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}
              aria-label="Limite disponível"
            >
              {formatBRL(data.availableLimitCents)}
            </dd>
          </div>
        </dl>
        {data.availableLimitCents < 0 ? (
          <p role="status" className="mt-2 text-xs text-rose-700 dark:text-rose-300">
            As compras passam do limite cadastrado (o app só avisa; quem decide é o banco).
          </p>
        ) : null}
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => setPurchasing(true)} disabled={data.archivedAt !== null}>
            Nova compra
          </Button>
          <Button variant="secondary" onClick={() => setEditing(true)}>
            Editar
          </Button>
          <Button variant="ghost" disabled={archive.isPending} onClick={() => void toggleArchive()}>
            {data.archivedAt ? 'Reativar' : 'Arquivar'}
          </Button>
        </div>
        {actionError ? (
          <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">
            {actionError}
          </p>
        ) : null}
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <InvoicesSection card={data} />
        <PurchasesSection cardId={data.id} />
      </div>

      {purchasing ? (
        <PurchaseFormModal cardId={data.id} onClose={() => setPurchasing(false)} />
      ) : null}
      {editing ? <CreditCardFormModal card={data} onClose={() => setEditing(false)} /> : null}
    </>
  );
}

const STATUS_TONE = { open: 'sky', closed: 'amber', paid: 'emerald' } as const;

function InvoicesSection({ card }: { card: CreditCard }) {
  const invoices = useInvoices(card.id);
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <section
      aria-labelledby="invoices-title"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
    >
      <h2 id="invoices-title" className="mb-3 font-semibold text-slate-900 dark:text-slate-50">
        Faturas
      </h2>
      {invoices.isPending ? (
        <Spinner />
      ) : invoices.isError ? (
        <QueryError error={invoices.error} onRetry={() => void invoices.refetch()} />
      ) : invoices.data.length === 0 ? (
        <EmptyState title="Nenhuma fatura ainda">
          A fatura é criada quando a primeira compra cai nela.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Faturas do cartão">
          {invoices.data.map((invoice) => (
            <InvoiceRow
              key={invoice.id}
              invoice={invoice}
              expanded={selected === invoice.id}
              onToggle={() => setSelected(selected === invoice.id ? null : invoice.id)}
              card={card}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function InvoiceRow({
  invoice,
  expanded,
  onToggle,
  card,
}: {
  invoice: InvoiceSummary;
  expanded: boolean;
  onToggle: () => void;
  card: CreditCard;
}) {
  const label = formatMonth(invoice.referenceMonth);
  return (
    <li className="py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium capitalize text-slate-900 dark:text-slate-50">
            Fatura de {label}
            <span className="ml-2">
              <Badge tone={STATUS_TONE[invoice.status]}>
                {INVOICE_STATUS_LABEL[invoice.status]}
              </Badge>
            </span>
            {invoice.overdue ? (
              <span className="ml-2">
                <Badge tone="rose">Vencida</Badge>
              </span>
            ) : null}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Fecha {formatDate(invoice.closingDate)} · vence {formatDate(invoice.dueDate)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm tabular-nums" aria-label={`Total da fatura de ${label}`}>
            {formatBRL(invoice.totalCents)}
          </span>
          <Button
            variant="ghost"
            size="sm"
            aria-expanded={expanded}
            aria-label={`${expanded ? 'Ocultar' : 'Ver'} fatura de ${label}`}
            onClick={onToggle}
          >
            {expanded ? 'Ocultar' : 'Ver'}
          </Button>
        </div>
      </div>
      {expanded ? <InvoiceDetailPanel invoiceId={invoice.id} card={card} /> : null}
    </li>
  );
}

function InvoiceDetailPanel({ invoiceId, card }: { invoiceId: string; card: CreditCard }) {
  const invoice = useInvoice(invoiceId);
  const accounts = useAccounts(true);
  const [paying, setPaying] = useState(false);
  const accountName = (id: string) =>
    accounts.data?.find((account) => account.id === id)?.name ?? 'Conta';

  if (invoice.isPending) return <Spinner />;
  if (invoice.isError) {
    return <QueryError error={invoice.error} onRetry={() => void invoice.refetch()} />;
  }
  const data = invoice.data;
  // Quanto ainda pode ser pago/agendado (o servidor confere o mesmo limite ao receber o pagamento).
  const payable = Math.max(0, data.totalCents - data.paidCents - data.scheduledCents);

  return (
    <div className="mt-2 rounded-lg bg-slate-50 dark:bg-slate-800 p-3 text-sm" aria-label="Detalhe da fatura">
      <dl className="grid grid-cols-3 gap-2">
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Pago</dt>
          <dd className="tabular-nums">{formatBRL(data.paidCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">Agendado</dt>
          <dd className="tabular-nums">{formatBRL(data.scheduledCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate-500 dark:text-slate-400">
            {data.remainingCents < 0 ? 'Crédito' : 'Em aberto'}
          </dt>
          <dd className="tabular-nums" aria-label="Em aberto">
            {formatBRL(Math.abs(data.remainingCents))}
          </dd>
        </div>
      </dl>

      <h3 className="mt-3 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Compras nesta fatura</h3>
      {data.installments.length === 0 ? (
        <p className="text-xs text-slate-500 dark:text-slate-400">Nenhuma parcela.</p>
      ) : (
        <ul className="mt-1 divide-y divide-slate-200 dark:divide-slate-800" aria-label="Parcelas da fatura">
          {data.installments.map((item) => (
            <li
              key={`${item.purchaseId}-${item.installmentNumber}`}
              className="flex justify-between gap-2 py-1"
            >
              <span className="min-w-0 truncate">
                {item.description}
                {item.installmentsCount > 1 ? (
                  <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                    {item.installmentNumber}/{item.installmentsCount}
                  </span>
                ) : null}
                <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">{formatDate(item.purchaseDate)}</span>
              </span>
              <span className="tabular-nums">{formatBRL(item.amountCents)}</span>
            </li>
          ))}
        </ul>
      )}

      {data.payments.length > 0 ? (
        <>
          <h3 className="mt-3 text-xs font-medium uppercase text-slate-500 dark:text-slate-400">Pagamentos</h3>
          <ul className="mt-1 divide-y divide-slate-200 dark:divide-slate-800" aria-label="Pagamentos da fatura">
            {data.payments.map((payment) => (
              <li key={payment.id} className="flex justify-between gap-2 py-1">
                <span
                  className={payment.status === 'cancelled' ? 'text-slate-400 dark:text-slate-500 line-through' : ''}
                >
                  {formatDate(payment.date)} · {accountName(payment.accountId)}
                  {payment.status === 'pending' ? (
                    <span className="ml-2">
                      <Badge tone="amber">Agendado</Badge>
                    </span>
                  ) : null}
                  {payment.status === 'cancelled' ? (
                    <span className="ml-2">
                      <Badge>Cancelado</Badge>
                    </span>
                  ) : null}
                </span>
                <span className="tabular-nums">{formatBRL(payment.amountCents)}</span>
              </li>
            ))}
          </ul>
        </>
      ) : null}

      {payable > 0 ? (
        <div className="mt-3">
          <Button size="sm" onClick={() => setPaying(true)}>
            Pagar fatura
          </Button>
        </div>
      ) : null}
      {paying ? (
        <PayInvoiceModal
          invoice={data}
          paymentAccountId={card.paymentAccountId}
          payableCents={payable}
          onClose={() => setPaying(false)}
        />
      ) : null}
    </div>
  );
}

function PurchasesSection({ cardId }: { cardId: string }) {
  const purchases = usePurchases(cardId);
  const cancel = useCancelPurchase();
  const [cancelling, setCancelling] = useState<Purchase | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function confirmCancel() {
    if (!cancelling) return;
    setError(null);
    try {
      await cancel.mutateAsync(cancelling.id);
      setCancelling(null);
    } catch (mutationError) {
      setError(formErrorMessage(mutationError));
    }
  }

  return (
    <section
      aria-labelledby="purchases-title"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
    >
      <h2 id="purchases-title" className="mb-3 font-semibold text-slate-900 dark:text-slate-50">
        Compras
      </h2>
      {purchases.isPending ? (
        <Spinner />
      ) : purchases.isError ? (
        <QueryError error={purchases.error} onRetry={() => void purchases.refetch()} />
      ) : purchases.data.length === 0 ? (
        <EmptyState title="Nenhuma compra ainda" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Compras do cartão">
          {purchases.data.map((purchase) => (
            <li
              key={purchase.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div className="min-w-0">
                <p
                  className={`truncate text-sm ${purchase.cancelled ? 'text-slate-400 dark:text-slate-500 line-through' : 'text-slate-900 dark:text-slate-50'}`}
                >
                  {purchase.description}
                  {purchase.cancelled ? (
                    <span className="ml-2">
                      <Badge>Cancelada</Badge>
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(purchase.purchaseDate)}
                  {purchase.installmentsCount > 1
                    ? ` · ${purchase.installmentsCount}x`
                    : ' · à vista'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm tabular-nums">{formatBRL(purchase.totalAmountCents)}</span>
                {!purchase.cancelled ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Cancelar compra ${purchase.description}`}
                    onClick={() => {
                      setError(null);
                      setCancelling(purchase);
                    }}
                  >
                    Cancelar
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {cancelling ? (
        <ConfirmDialog
          title="Cancelar compra"
          message={`Cancelar "${cancelling.description}"? As parcelas saem das faturas, do limite e do orçamento (estorno).`}
          confirmLabel="Cancelar compra"
          pending={cancel.isPending}
          error={error}
          onConfirm={() => void confirmCancel()}
          onCancel={() => setCancelling(null)}
        />
      ) : null}
    </section>
  );
}
