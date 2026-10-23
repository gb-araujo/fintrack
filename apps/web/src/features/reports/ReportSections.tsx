import { formatBRL } from '@fintrack/shared';
import { useState } from 'react';
import { Link } from 'react-router';
import { Badge, EmptyState, QueryError, Spinner } from '../../components/ui/Feedback';
import type { MonthsParams, PeriodParams } from '../../services/reports';
import { formatDate, formatMonth, formatSigned } from '../ledger/labels';
import { StatCard } from '../dashboard/AvailableToSpendCard';
import { BarList, type BarListItem } from './BarList';
import { SERIES_COLORS } from './colors';
import { MonthsControls, PeriodControls } from './controls';
import {
  useBudgetHistory,
  useCashFlow,
  useExpensesByAccount,
  useExpensesByCard,
  useExpensesByCategory,
  useIncomeVsExpenses,
  useInvestments,
  useMonthlyEvolution,
  useNetWorth,
} from './queries';
import { TrendChart } from './TrendChart';

/** "2026-09" → "09/26", para rótulos de eixo compactos (a tabela ao lado tem o valor exato). */
function shortMonth(month: string): string {
  return `${month.slice(5, 7)}/${month.slice(2, 4)}`;
}

function Line({ label, cents, sign }: { label: string; cents: number; sign: '+' | '−' | '=' }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1 text-sm">
      <span className="text-slate-600 dark:text-slate-300">
        <span className="mr-2 inline-block w-3 text-center font-medium text-slate-400 dark:text-slate-500">{sign}</span>
        {label}
      </span>
      <span className="tabular-nums text-slate-900 dark:text-slate-50">{formatBRL(cents)}</span>
    </li>
  );
}

export function ExpensesByCategorySection() {
  const [period, setPeriod] = useState<PeriodParams>({});
  const report = useExpensesByCategory(period);
  return (
    <section aria-label="Despesas por categoria">
      <PeriodControls value={period} onChange={setPeriod} />
      {report.isPending ? (
        <Spinner />
      ) : report.isError ? (
        <QueryError error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <>
          <p className="mb-3 text-sm text-slate-600 dark:text-slate-300">
            Total:{' '}
            <span className="font-semibold tabular-nums">{formatBRL(report.data.totalCents)}</span>
          </p>
          <BarList
            label="Despesas por categoria"
            emptyMessage="Nenhuma despesa efetivada neste período."
            items={report.data.items.map((item): BarListItem => ({
              key: item.categoryId ?? 'none',
              label: item.categoryName,
              cents: item.totalCents,
              percent: item.percent,
            }))}
          />
        </>
      )}
    </section>
  );
}

export function IncomeVsExpensesSection() {
  const [period, setPeriod] = useState<PeriodParams>({});
  const report = useIncomeVsExpenses(period);
  return (
    <section aria-label="Receitas × despesas">
      <PeriodControls value={period} onChange={setPeriod} />
      {report.isPending ? (
        <Spinner />
      ) : report.isError ? (
        <QueryError error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          <StatCard title="Receitas" cents={report.data.incomeCents} />
          <StatCard
            title="Despesas"
            cents={report.data.expenseCents}
            hint={
              report.data.cardExpenseCents > 0
                ? `Inclui ${formatBRL(report.data.cardExpenseCents)} em parcelas de cartão`
                : undefined
            }
          />
          <StatCard
            title="Resultado"
            cents={report.data.netCents}
            tone="auto"
            signed
            hint={
              report.data.savingsPercent !== null
                ? `${report.data.savingsPercent}% das receitas`
                : 'Sem receitas no período'
            }
          />
        </div>
      )}
    </section>
  );
}

export function MonthlyEvolutionSection() {
  const [months, setMonths] = useState<MonthsParams>({ months: 12 });
  const report = useMonthlyEvolution(months);
  return (
    <section aria-label="Evolução mensal">
      <MonthsControls value={months} onChange={setMonths} />
      {report.isPending ? (
        <Spinner />
      ) : report.isError ? (
        <QueryError error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <>
          <TrendChart
            labels={report.data.items.map((item) => shortMonth(item.month))}
            series={[
              {
                key: 'income',
                label: 'Receitas',
                color: SERIES_COLORS.income,
                values: report.data.items.map((i) => i.incomeCents),
              },
              {
                key: 'expense',
                label: 'Despesas',
                color: SERIES_COLORS.expense,
                values: report.data.items.map((i) => i.expenseCents),
              },
            ]}
          />
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">
              Ver tabela
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[420px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-1 pr-2">Mês</th>
                    <th className="py-1 pr-2 text-right">Receitas</th>
                    <th className="py-1 pr-2 text-right">Despesas</th>
                    <th className="py-1 text-right">Saldo</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.items.map((item) => (
                    <tr key={item.month} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1 pr-2 capitalize">{formatMonth(item.month)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {formatBRL(item.incomeCents)}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {formatBRL(item.expenseCents)}
                      </td>
                      <td
                        className={`py-1 text-right tabular-nums ${item.netCents < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-300'}`}
                      >
                        {formatBRL(item.netCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

export function ExpensesByAccountSection() {
  const [period, setPeriod] = useState<PeriodParams>({});
  const report = useExpensesByAccount(period);
  return (
    <section aria-label="Despesas por conta">
      <PeriodControls value={period} onChange={setPeriod} />
      {report.isPending ? (
        <Spinner />
      ) : report.isError ? (
        <QueryError error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <BarList
          label="Despesas por conta"
          emptyMessage="Nenhuma despesa em conta neste período."
          items={report.data.items.map((item): BarListItem => ({
            key: item.accountId,
            label: item.accountName,
            cents: item.totalCents,
            percent: item.percent,
          }))}
        />
      )}
    </section>
  );
}

export function ExpensesByCardSection() {
  const [period, setPeriod] = useState<PeriodParams>({});
  const report = useExpensesByCard(period);
  return (
    <section aria-label="Gastos por cartão">
      <PeriodControls value={period} onChange={setPeriod} />
      {report.isPending ? (
        <Spinner />
      ) : report.isError ? (
        <QueryError error={report.error} onRetry={() => void report.refetch()} />
      ) : report.data.items.length === 0 ? (
        <EmptyState title="Nenhum gasto de cartão neste período" />
      ) : (
        <ul className="space-y-3" aria-label="Gastos por cartão">
          {report.data.items.map((item) => (
            <li key={item.cardId} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
              <p className="font-medium text-slate-900 dark:text-slate-50">{item.cardName}</p>
              <dl className="mt-1 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Parcelas no período</dt>
                  <dd className="tabular-nums">{formatBRL(item.installmentsCents)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-slate-500 dark:text-slate-400">Comprado no período (informativo)</dt>
                  <dd className="tabular-nums text-slate-500 dark:text-slate-400">{formatBRL(item.purchasedCents)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function CashFlowSection() {
  const [period, setPeriod] = useState<PeriodParams>({});
  const report = useCashFlow(period);
  return (
    <section aria-label="Fluxo de caixa">
      <PeriodControls value={period} onChange={setPeriod} />
      {report.isPending ? (
        <Spinner />
      ) : report.isError ? (
        <QueryError error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Composição do fluxo de caixa">
          <Line
            label="Saldo das contas disponíveis no início"
            cents={report.data.openingBalanceCents}
            sign="+"
          />
          <Line label="Receitas efetivadas" cents={report.data.incomeCents} sign="+" />
          <Line
            label="Transferências recebidas (ex.: resgates)"
            cents={report.data.transfersInCents}
            sign="+"
          />
          <Line label="Despesas efetivadas" cents={report.data.expensesCents} sign="−" />
          <Line label="Pagamentos de fatura" cents={report.data.cardPaymentsCents} sign="−" />
          <Line
            label="Transferências enviadas (ex.: aplicações)"
            cents={report.data.transfersOutCents}
            sign="−"
          />
          <Line
            label="Saldo das contas disponíveis no fim"
            cents={report.data.closingBalanceCents}
            sign="="
          />
        </ul>
      )}
    </section>
  );
}

const BUDGET_STATUS_TONE = { ok: 'emerald', warning: 'amber', exceeded: 'rose' } as const;

export function BudgetHistorySection() {
  const [months, setMonths] = useState<MonthsParams>({ months: 12 });
  const report = useBudgetHistory(months);
  return (
    <section aria-label="Orçamento ao longo dos meses">
      <MonthsControls value={months} onChange={setMonths} />
      {report.isPending ? (
        <Spinner />
      ) : report.isError ? (
        <QueryError error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                <th className="py-1 pr-2">Mês</th>
                <th className="py-1 pr-2 text-right">Orçado</th>
                <th className="py-1 pr-2 text-right">Gasto</th>
                <th className="py-1 pr-2 text-right">Restante</th>
                <th className="py-1 text-right">Situação</th>
              </tr>
            </thead>
            <tbody>
              {report.data.items.map((item) => {
                const status =
                  item.budgetsCount === 0 ? null : item.exceededCount > 0 ? 'exceeded' : 'ok';
                return (
                  <tr key={item.month} className="border-t border-slate-100 dark:border-slate-800">
                    <td className="py-1 pr-2 capitalize">{formatMonth(item.month)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {formatBRL(item.limitCents)}
                    </td>
                    <td className="py-1 pr-2 text-right tabular-nums">
                      {formatBRL(item.spentCents)}
                    </td>
                    <td
                      className={`py-1 pr-2 text-right tabular-nums ${item.remainingCents < 0 ? 'text-rose-600 dark:text-rose-400' : ''}`}
                    >
                      {formatBRL(item.remainingCents)}
                    </td>
                    <td className="py-1 text-right">
                      {status ? (
                        <Badge tone={BUDGET_STATUS_TONE[status]}>
                          {status === 'exceeded'
                            ? `${item.exceededCount} estourado(s)`
                            : 'Dentro do limite'}
                        </Badge>
                      ) : (
                        <span className="text-xs text-slate-400 dark:text-slate-500">Sem orçamento</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

export function NetWorthSection() {
  const [months, setMonths] = useState<MonthsParams>({ months: 12 });
  const report = useNetWorth(months);
  return (
    <section aria-label="Patrimônio">
      <MonthsControls value={months} onChange={setMonths} />
      {report.isPending ? (
        <Spinner />
      ) : report.isError ? (
        <QueryError error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <>
          <TrendChart
            labels={report.data.items.map((item) => shortMonth(item.date.slice(0, 7)))}
            series={[
              {
                key: 'net',
                label: 'Patrimônio',
                color: SERIES_COLORS.net,
                values: report.data.items.map((i) => i.netWorthCents),
              },
            ]}
          />
          <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">
              Ver tabela
            </summary>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
                    <th className="py-1 pr-2">Data</th>
                    <th className="py-1 pr-2 text-right">Caixa</th>
                    <th className="py-1 pr-2 text-right">Investimentos</th>
                    <th className="py-1 pr-2 text-right">Cartões</th>
                    <th className="py-1 text-right">Patrimônio</th>
                  </tr>
                </thead>
                <tbody>
                  {report.data.items.map((item) => (
                    <tr key={item.date} className="border-t border-slate-100 dark:border-slate-800">
                      <td className="py-1 pr-2">{formatDate(item.date)}</td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {formatBRL(item.cashCents)}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums">
                        {formatBRL(item.investmentsCents)}
                      </td>
                      <td className="py-1 pr-2 text-right tabular-nums text-rose-600 dark:text-rose-400">
                        {formatBRL(item.cardLiabilitiesCents)}
                      </td>
                      <td className="py-1 text-right font-medium tabular-nums">
                        {formatBRL(item.netWorthCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

export function InvestmentsSection() {
  const [period, setPeriod] = useState<PeriodParams>({});
  const report = useInvestments(period);
  return (
    <section aria-label="Investimentos">
      <PeriodControls value={period} onChange={setPeriod} />
      {report.isPending ? (
        <Spinner />
      ) : report.isError ? (
        <QueryError error={report.error} onRetry={() => void report.refetch()} />
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-4">
            <StatCard title="Saldo em investimentos" cents={report.data.totalBalanceCents} />
            <StatCard title="Aplicado no período" cents={report.data.appliedCents} />
            <StatCard
              title="Resgatado no período"
              cents={report.data.redeemedCents}
              hint="Resgate não é receita"
            />
            {report.data.yieldCents === null ? (
              <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
                <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">Rendimento no período</h2>
                <p className="mt-1 text-sm text-slate-400 dark:text-slate-500">Sem avaliação registrada</p>
              </section>
            ) : (
              <StatCard
                title="Rendimento no período"
                cents={report.data.yieldCents}
                signed
                tone="auto"
              />
            )}
          </div>
          {report.data.items.length === 0 ? (
            <EmptyState title="Nenhuma conta de investimento" />
          ) : (
            <ul className="space-y-3" aria-label="Contas de investimento">
              {report.data.items.map((item) => (
                <li key={item.accountId} className="rounded-lg border border-slate-200 dark:border-slate-800 p-3">
                  <p className="font-medium text-slate-900 dark:text-slate-50">{item.accountName}</p>
                  <dl className="mt-1 grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Saldo</dt>
                      <dd className="tabular-nums">{formatBRL(item.balanceCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Aplicado</dt>
                      <dd className="tabular-nums">{formatBRL(item.appliedCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Resgatado</dt>
                      <dd className="tabular-nums">{formatBRL(item.redeemedCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Aportado (líquido)</dt>
                      <dd className="tabular-nums">{formatBRL(item.netContributedCents)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-slate-500 dark:text-slate-400">Rendimento</dt>
                      <dd className={item.yieldCents === null ? 'text-slate-400 dark:text-slate-500' : 'tabular-nums'}>
                        {item.yieldCents === null ? 'Sem avaliação' : formatSigned(item.yieldCents)}
                      </dd>
                    </div>
                  </dl>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            Rendimento é derivado das avaliações registradas em cada conta —{' '}
            <Link to="/investments" className="text-brand-700 dark:text-brand-400 hover:underline">
              gerencie as avaliações em Investimentos
            </Link>
            .
          </p>
        </>
      )}
    </section>
  );
}
