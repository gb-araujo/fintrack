import { formatBRL } from '@fintrack/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { PageHeader } from '../components/PageHeader';
import { Badge, QueryError, Spinner } from '../components/ui/Feedback';
import { useAuth } from '../features/auth/auth-context';
import { AvailableToSpendCard, StatCard } from '../features/dashboard/AvailableToSpendCard';
import { ApiStatusCard } from '../features/dashboard/ApiStatusCard';
import { CashflowList, MoneyPlan, type HorizonChoice } from '../features/dashboard/MoneyPlan';
import { formatDate } from '../features/ledger/labels';
import { useAccounts, useDashboard } from '../features/ledger/queries';
import type { DashboardHorizon } from '../services/dashboard';

function toHorizon(choice: HorizonChoice): DashboardHorizon {
  if (choice.kind === 'days') return { days: choice.days };
  if (choice.kind === 'date') return { until: choice.until };
  return {};
}

export function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name.split(' ')[0];
  // 30 dias por padrão: no fim do mês, "até o fim do mês" esconderia a próxima fatura e o salário.
  const [horizon, setHorizon] = useState<HorizonChoice>({ kind: 'days', days: 30 });
  const dashboard = useDashboard(toHorizon(horizon));
  const accounts = useAccounts(true);
  const accountName = (id: string) =>
    accounts.data?.find((account) => account.id === id)?.name ?? 'Conta';

  return (
    <>
      <PageHeader
        title="Início"
        description={
          firstName
            ? `Olá, ${firstName}! Quanto dá para gastar, o que guardar e o que vem por aí.`
            : 'Quanto dá para gastar, o que guardar e o que vem por aí.'
        }
      />

      {dashboard.isPending ? (
        <Spinner />
      ) : dashboard.isError ? (
        <QueryError error={dashboard.error} onRetry={() => void dashboard.refetch()} />
      ) : (
        <>
          <MoneyPlan data={dashboard.data} horizon={horizon} onHorizonChange={setHorizon} />

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <CashflowList data={dashboard.data} direction="out" />
            <CashflowList data={dashboard.data} direction="in" />
          </div>

          <h2 className="mt-8 mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Mais detalhes
          </h2>
          <div className="grid gap-4 md:grid-cols-2">
            <AvailableToSpendCard
              data={dashboard.data}
              title={`Quanto sobra até ${formatDate(dashboard.data.until)}?`}
            />

            <StatCard
              title="Saldo total"
              cents={dashboard.data.totalBalanceCents}
              tone="auto"
              hint="Bancos e carteiras"
            />
            <StatCard
              title="Investimentos"
              cents={dashboard.data.investmentsCents}
              hint="Não entra no dinheiro disponível"
            />
            <StatCard
              title="Receitas do mês"
              cents={dashboard.data.month.incomeCents}
              hint={`${formatDate(dashboard.data.month.from)} a ${formatDate(dashboard.data.month.to)}`}
            />
            <StatCard
              title="Despesas do mês"
              cents={dashboard.data.month.expenseCents}
              hint={
                dashboard.data.month.cardExpenseCents > 0
                  ? `Inclui ${formatBRL(dashboard.data.month.cardExpenseCents)} em parcelas de cartão · transferências e pagamento de fatura não contam`
                  : 'Transferências e investimentos não contam'
              }
            />
            <StatCard
              title="Cartões em aberto"
              cents={dashboard.data.cardLiabilitiesCents}
              hint="Todas as faturas a pagar, inclusive parcelas futuras"
            />

            <section
              aria-labelledby="pending-title"
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 id="pending-title" className="text-sm font-medium text-slate-500">
                  Contas pendentes
                </h2>
                <span className="flex gap-3">
                  <Link
                    to="/credit-cards"
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    Cartões
                  </Link>
                  <Link
                    to="/recurring"
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    Recorrências
                  </Link>
                  <Link
                    to="/transactions"
                    className="text-xs font-medium text-brand-700 hover:underline"
                  >
                    Ver transações
                  </Link>
                </span>
              </div>
              <p
                className="mt-1 text-xl font-semibold tabular-nums"
                aria-label="Total de contas pendentes"
              >
                {formatBRL(dashboard.data.pendingBills.totalCents)}
              </p>
              <p className="text-xs text-slate-500">
                {dashboard.data.pendingBills.count} até {formatDate(dashboard.data.until)}
                {dashboard.data.pendingBills.overdueCount > 0 ? (
                  <>
                    {' · '}
                    <span className="font-medium text-rose-600">
                      {dashboard.data.pendingBills.overdueCount} vencida(s)
                    </span>
                  </>
                ) : null}
              </p>
              {dashboard.data.pendingBills.next.length > 0 ? (
                <ul className="mt-3 divide-y divide-slate-100" aria-label="Próximas contas a pagar">
                  {dashboard.data.pendingBills.next.map((bill) => (
                    <li
                      key={bill.id}
                      className="flex items-center justify-between gap-2 py-1.5 text-sm"
                    >
                      <span className="min-w-0 truncate">
                        {bill.description || 'Despesa'}
                        <span className="ml-2 text-xs text-slate-500">
                          {formatDate(bill.date)}
                          {bill.accountId ? ` · ${accountName(bill.accountId)}` : ''}
                        </span>
                        {bill.overdue ? (
                          <span className="ml-2">
                            <Badge tone="rose">Vencida</Badge>
                          </span>
                        ) : null}
                        {bill.kind === 'invoice' ? (
                          <span className="ml-2">
                            <Badge tone="sky">Fatura</Badge>
                          </span>
                        ) : null}
                        {bill.kind === 'recurring' ? (
                          <span className="ml-2">
                            <Badge tone={bill.estimated ? 'amber' : 'sky'}>
                              {bill.estimated ? 'Recorrente · estimado' : 'Recorrente'}
                            </Badge>
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 tabular-nums text-rose-600">
                        {formatBRL(bill.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>

            <StatCard
              title="Compromissos futuros"
              cents={dashboard.data.futureCommitments.totalCents}
              hint={`${dashboard.data.futureCommitments.count} previsto(s) depois de ${formatDate(dashboard.data.until)}`}
            />
          </div>
        </>
      )}

      <div className="mt-4">
        <ApiStatusCard />
      </div>
    </>
  );
}
