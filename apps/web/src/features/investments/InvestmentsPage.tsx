import { formatBRL, type InvestmentSummary } from '@fintrack/shared';
import { Link } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { EmptyState, QueryError, Spinner } from '../../components/ui/Feedback';
import { amountTone, formatSigned } from '../ledger/labels';
import { useInvestments } from './queries';

export function InvestmentsPage() {
  const investments = useInvestments();

  return (
    <>
      <PageHeader
        title="Investimentos"
        description="Saldo, aportes e rendimento — o rendimento só aparece depois que você registra a primeira avaliação (o valor da posição no extrato da corretora)."
      />

      {investments.isPending ? (
        <Spinner />
      ) : investments.isError ? (
        <QueryError error={investments.error} onRetry={() => void investments.refetch()} />
      ) : investments.data.length === 0 ? (
        <EmptyState title="Nenhuma conta de investimento">
          Crie uma conta do tipo "Investimento" em Contas para acompanhar aportes, resgates e
          rendimento aqui.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2" aria-label="Contas de investimento">
          {investments.data.map((item) => (
            <InvestmentCard key={item.accountId} investment={item} />
          ))}
        </ul>
      )}
    </>
  );
}

function InvestmentCard({ investment }: { investment: InvestmentSummary }) {
  const subtitle = [investment.institution, investment.product].filter(Boolean).join(' · ');
  return (
    <li>
      <Link
        to={`/investments/${investment.accountId}`}
        className="block rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-brand-300 hover:shadow"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="truncate font-medium text-slate-900">{investment.accountName}</h3>
            {subtitle ? <p className="truncate text-xs text-slate-500">{subtitle}</p> : null}
          </div>
          <span className="shrink-0 text-lg font-semibold tabular-nums text-slate-900">
            {formatBRL(investment.balanceCents)}
          </span>
        </div>

        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Aportado (líquido)</dt>
            <dd className="tabular-nums">{formatBRL(investment.netContributedCents)}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Rendimento desde a 1ª avaliação</dt>
            {investment.totalYieldCents === null ? (
              <dd className="text-slate-400">Sem avaliação</dd>
            ) : (
              <dd className={`tabular-nums ${amountTone(investment.totalYieldCents)}`}>
                {formatSigned(investment.totalYieldCents)}
                {investment.totalYieldPercent !== null
                  ? ` (${investment.totalYieldPercent > 0 ? '+' : ''}${investment.totalYieldPercent}%)`
                  : ''}
              </dd>
            )}
          </div>
        </dl>
      </Link>
    </li>
  );
}
