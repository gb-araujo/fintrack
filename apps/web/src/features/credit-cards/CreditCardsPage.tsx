import { formatBRL, type CreditCard } from '@fintrack/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge, EmptyState, QueryError, Spinner } from '../../components/ui/Feedback';
import { CheckboxField } from '../../components/ui/Fields';
import { formatDate } from '../ledger/labels';
import { CreditCardFormModal } from './CreditCardFormModal';
import { useCards } from './queries';

/** Barra de limite usado. O percentual é só visual: o valor usado/disponível vem do backend. */
export function LimitBar({ card }: { card: CreditCard }) {
  const percent = Math.min(100, Math.round((card.usedLimitCents * 100) / card.limitCents));
  return (
    <div
      role="progressbar"
      aria-label={`Limite usado de ${card.name}`}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      className="h-2 overflow-hidden rounded-full bg-slate-100"
    >
      <div
        className={`h-full rounded-full ${card.availableLimitCents < 0 ? 'bg-rose-500' : 'bg-brand-600'}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}

export function CreditCardsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const cards = useCards(showArchived);

  return (
    <>
      <PageHeader
        title="Cartões"
        description="Compras no cartão viram parcelas em faturas. A despesa é contada por parcela; pagar a fatura só movimenta a conta."
      />
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CheckboxField
          label="Mostrar cartões arquivados"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        <Button onClick={() => setCreating(true)}>Novo cartão</Button>
      </div>

      {cards.isPending ? (
        <Spinner />
      ) : cards.isError ? (
        <QueryError error={cards.error} onRetry={() => void cards.refetch()} />
      ) : cards.data.length === 0 ? (
        <EmptyState title="Nenhum cartão ainda">
          Cadastre seus cartões para acompanhar limite, faturas e parcelas.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Cartões">
          {cards.data.map((card) => (
            <li key={card.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-2">
                <Link
                  to={`/credit-cards/${card.id}`}
                  className="min-w-0 truncate font-semibold text-brand-700 hover:underline"
                >
                  {card.name}
                </Link>
                {card.archivedAt ? <Badge tone="amber">Arquivado</Badge> : null}
              </div>
              <div className="mt-3">
                <LimitBar card={card} />
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-slate-500">Usado</dt>
                  <dd className="tabular-nums">{formatBRL(card.usedLimitCents)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500">Disponível</dt>
                  <dd
                    className={`tabular-nums ${card.availableLimitCents < 0 ? 'text-rose-600' : ''}`}
                  >
                    {formatBRL(card.availableLimitCents)}
                  </dd>
                </div>
              </dl>
              <p className="mt-2 text-xs text-slate-500">
                {card.openInvoice
                  ? `Fatura aberta: ${formatBRL(card.openInvoice.totalCents)} · fecha ${formatDate(card.openInvoice.closingDate)} · vence ${formatDate(card.openInvoice.dueDate)}`
                  : 'Sem fatura aberta.'}
              </p>
            </li>
          ))}
        </ul>
      )}

      {creating ? <CreditCardFormModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}
