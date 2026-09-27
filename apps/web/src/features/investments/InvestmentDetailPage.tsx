import { formatBRL, type InvestmentValuation } from '@fintrack/shared';
import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { ConfirmDialog, EmptyState, QueryError, Spinner } from '../../components/ui/Feedback';
import { formErrorMessage } from '../../lib/form-errors';
import { amountTone, formatDate, formatSigned } from '../ledger/labels';
import { InvestmentDetailsFormModal } from './InvestmentDetailsFormModal';
import { useDeleteValuation, useInvestment, useValuations } from './queries';
import { ValuationFormModal } from './ValuationFormModal';

export function InvestmentDetailPage() {
  const { accountId = '' } = useParams();
  const investment = useInvestment(accountId);
  const [addingValuation, setAddingValuation] = useState(false);
  const [editingValuation, setEditingValuation] = useState<InvestmentValuation | null>(null);
  const [editingDetails, setEditingDetails] = useState(false);

  if (investment.isPending) return <Spinner />;
  if (investment.isError) {
    return <QueryError error={investment.error} onRetry={() => void investment.refetch()} />;
  }
  const data = investment.data;
  if (!data) return <EmptyState title="Conta de investimento não encontrada" />;

  const subtitle = [data.institution, data.product].filter(Boolean).join(' · ');

  return (
    <>
      <Link to="/investments" className="text-sm text-brand-700 hover:underline">
        ← Investimentos
      </Link>
      <div className="mt-2">
        <PageHeader
          title={data.accountName}
          description={subtitle || 'Instituição e produto não informados'}
        />
      </div>

      <section
        aria-label="Resumo"
        className="mb-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-slate-500">Saldo</dt>
            <dd className="text-lg font-semibold tabular-nums text-slate-900">
              {formatBRL(data.balanceCents)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Aportado (líquido)</dt>
            <dd className="tabular-nums">{formatBRL(data.netContributedCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Rendimento total</dt>
            {data.totalYieldCents === null ? (
              <dd className="text-slate-400">Sem avaliação</dd>
            ) : (
              <dd className={`tabular-nums ${amountTone(data.totalYieldCents)}`}>
                {formatSigned(data.totalYieldCents)}
              </dd>
            )}
          </div>
          <div>
            <dt className="text-xs text-slate-500">Rendimento (%)</dt>
            <dd className="tabular-nums">
              {data.totalYieldPercent === null
                ? '—'
                : `${data.totalYieldPercent > 0 ? '+' : ''}${data.totalYieldPercent}%`}
            </dd>
          </div>
        </dl>
        <div className="mt-3 flex flex-wrap gap-2">
          <Button onClick={() => setAddingValuation(true)}>Registrar avaliação</Button>
          <Button variant="secondary" onClick={() => setEditingDetails(true)}>
            Instituição / produto
          </Button>
        </div>
      </section>

      <ValuationsSection accountId={accountId} onEdit={setEditingValuation} />

      {addingValuation ? (
        <ValuationFormModal accountId={accountId} onClose={() => setAddingValuation(false)} />
      ) : null}
      {editingValuation ? (
        <ValuationFormModal
          accountId={accountId}
          valuation={editingValuation}
          onClose={() => setEditingValuation(null)}
        />
      ) : null}
      {editingDetails ? (
        <InvestmentDetailsFormModal
          accountId={accountId}
          institution={data.institution}
          product={data.product}
          onClose={() => setEditingDetails(false)}
        />
      ) : null}
    </>
  );
}

function ValuationsSection({
  accountId,
  onEdit,
}: {
  accountId: string;
  onEdit: (valuation: InvestmentValuation) => void;
}) {
  const valuations = useValuations(accountId);
  const remove = useDeleteValuation();
  const [removing, setRemoving] = useState<InvestmentValuation | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  async function confirmRemove() {
    if (!removing) return;
    setRemoveError(null);
    try {
      await remove.mutateAsync({ accountId, id: removing.id });
      setRemoving(null);
    } catch (error) {
      setRemoveError(formErrorMessage(error));
    }
  }

  return (
    <section
      aria-labelledby="valuations-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="valuations-title" className="mb-3 font-semibold text-slate-900">
        Histórico de avaliações
      </h2>
      {valuations.isPending ? (
        <Spinner />
      ) : valuations.isError ? (
        <QueryError error={valuations.error} onRetry={() => void valuations.refetch()} />
      ) : valuations.data.length === 0 ? (
        <EmptyState title="Nenhuma avaliação ainda">
          Registre o valor da posição no extrato da corretora para começar a medir o rendimento.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100" aria-label="Avaliações">
          {[...valuations.data].reverse().map((valuation) => (
            <li
              key={valuation.id}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-900">{formatDate(valuation.date)}</p>
                <p className="text-xs text-slate-500">
                  Saldo {formatBRL(valuation.balanceCents)}
                  {valuation.contributedCents !== 0
                    ? ` · aportes/resgates no período ${formatSigned(valuation.contributedCents)}`
                    : ''}
                  {valuation.note ? ` · ${valuation.note}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {valuation.yieldCents === null ? (
                  <span className="text-sm text-slate-400">1ª avaliação</span>
                ) : (
                  <span className={`text-sm tabular-nums ${amountTone(valuation.yieldCents)}`}>
                    {formatSigned(valuation.yieldCents)}
                    {valuation.yieldPercent !== null
                      ? ` (${valuation.yieldPercent > 0 ? '+' : ''}${valuation.yieldPercent}%)`
                      : ''}
                  </span>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Corrigir avaliação de ${formatDate(valuation.date)}`}
                  onClick={() => onEdit(valuation)}
                >
                  Corrigir
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remover avaliação de ${formatDate(valuation.date)}`}
                  onClick={() => {
                    setRemoveError(null);
                    setRemoving(valuation);
                  }}
                >
                  Remover
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {removing ? (
        <ConfirmDialog
          title="Remover avaliação"
          message={`Remover a avaliação de ${formatDate(removing.date)}? O rendimento das avaliações seguintes é recalculado sem ela.`}
          confirmLabel="Remover"
          pending={remove.isPending}
          error={removeError}
          onConfirm={() => void confirmRemove()}
          onCancel={() => setRemoving(null)}
        />
      ) : null}
    </section>
  );
}
