import { PageHeader } from '../components/PageHeader';
import { ApiStatusCard } from '../features/dashboard/ApiStatusCard';

export function DashboardPage() {
  return (
    <>
      <PageHeader title="Início" description="Visão geral das suas finanças." />
      <div className="grid gap-4 md:grid-cols-2">
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-5">
          <h2 className="text-sm font-medium text-slate-500">Quanto posso gastar?</h2>
          <p className="mt-2 text-sm text-slate-600">
            Este valor será calculado pelo backend a partir da FASE 3, considerando saldo, receitas
            e despesas previstas, recorrências e faturas do cartão.
          </p>
        </section>
        <ApiStatusCard />
      </div>
    </>
  );
}
