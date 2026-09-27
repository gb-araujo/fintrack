import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import {
  BudgetHistorySection,
  CashFlowSection,
  ExpensesByAccountSection,
  ExpensesByCardSection,
  ExpensesByCategorySection,
  IncomeVsExpensesSection,
  InvestmentsSection,
  MonthlyEvolutionSection,
  NetWorthSection,
} from './ReportSections';

const TABS = [
  {
    key: 'expenses-by-category',
    label: 'Despesas por categoria',
    render: ExpensesByCategorySection,
  },
  { key: 'income-vs-expenses', label: 'Receitas × despesas', render: IncomeVsExpensesSection },
  { key: 'monthly-evolution', label: 'Evolução mensal', render: MonthlyEvolutionSection },
  { key: 'expenses-by-account', label: 'Despesas por conta', render: ExpensesByAccountSection },
  { key: 'expenses-by-card', label: 'Gastos por cartão', render: ExpensesByCardSection },
  { key: 'cash-flow', label: 'Fluxo de caixa', render: CashFlowSection },
  { key: 'budget-history', label: 'Orçamento', render: BudgetHistorySection },
  { key: 'net-worth', label: 'Patrimônio', render: NetWorthSection },
  { key: 'investments', label: 'Investimentos', render: InvestmentsSection },
] as const;

export function ReportsPage() {
  const [active, setActive] = useState<(typeof TABS)[number]['key']>('expenses-by-category');
  const Current = TABS.find((tab) => tab.key === active)?.render ?? ExpensesByCategorySection;

  return (
    <>
      <PageHeader
        title="Relatórios"
        description="Tudo calculado pelo backend com as mesmas regras do painel, do orçamento e das faturas."
      />
      <div
        role="tablist"
        aria-label="Relatórios"
        className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200 pb-px"
      >
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            aria-selected={active === tab.key}
            onClick={() => setActive(tab.key)}
            className={`shrink-0 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              active === tab.key
                ? 'border-brand-700 text-brand-700'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <Current />
      </div>
    </>
  );
}
