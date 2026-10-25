import { formatBRL, type Dashboard } from '@fintrack/shared';
import { InputField } from '../../components/ui/Fields';
import { amountTone, formatDate, formatSigned } from '../ledger/labels';

/** Linha da decomposição: sinal explícito para o usuário "fechar a conta" de cabeça. */
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

/**
 * Dinheiro disponível — o valor vem pronto do backend; aqui só é exibido junto com os
 * componentes do cálculo (transparência) e o horizonte escolhido.
 */
export function AvailableToSpendCard({
  data,
  title = 'Dinheiro disponível',
  until,
  onUntilChange,
}: {
  data: Dashboard;
  title?: string;
  /** Sem `onUntilChange`, o card não mostra o seletor de data (o horizonte é escolhido fora). */
  until?: string;
  onUntilChange?: (value: string) => void;
}) {
  const { amountCents, components } = data.availableToSpend;
  const isDefaultHorizon = !until;

  return (
    <section
      aria-labelledby="available-title"
      className="rounded-2xl border border-brand-100 dark:border-brand-700 bg-brand-50 dark:bg-brand-900 p-5 shadow-sm md:col-span-2"
    >
      <h2 id="available-title" className="text-sm font-medium text-brand-900 dark:text-brand-100">
        {title}
      </h2>
      <p
        aria-label="Dinheiro disponível"
        className={`mt-1 text-4xl font-semibold tabular-nums tracking-tight ${amountCents < 0 ? 'text-rose-600 dark:text-rose-400' : 'text-brand-900 dark:text-brand-100'}`}
      >
        {formatBRL(amountCents)}
      </p>
      <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
        {amountCents < 0
          ? 'Seus compromissos até essa data passam do que você tem em conta.'
          : `Já descontando o que está previsto até ${formatDate(data.until)}.`}
      </p>

      {onUntilChange ? (
        <div className="mt-4 max-w-xs">
          <InputField
            label="Considerar até"
            type="date"
            value={until || data.until}
            min={data.today}
            onChange={(event) =>
              onUntilChange(event.target.value === data.until ? '' : event.target.value)
            }
            hint={isDefaultHorizon ? 'Padrão: fim do mês.' : 'Horizonte personalizado.'}
          />
        </div>
      ) : null}

      <details className="mt-4 rounded-lg bg-white/70 p-3 dark:bg-slate-900/40">
        <summary className="cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">
          Como calculamos
        </summary>
        <ul className="mt-2 divide-y divide-slate-100 dark:divide-slate-800" aria-label="Componentes do cálculo">
          <Line
            label="Saldo das contas disponíveis"
            cents={components.liquidBalanceCents}
            sign="+"
          />
          <Line label="Receitas pendentes" cents={components.pendingIncomeCents} sign="+" />
          <Line
            label="Receitas previstas (recorrências)"
            cents={components.forecastIncomeCents}
            sign="+"
          />
          <Line
            label="Entradas agendadas (resgates)"
            cents={components.pendingTransfersInCents}
            sign="+"
          />
          <Line label="Despesas pendentes" cents={components.pendingExpensesCents} sign="−" />
          <Line
            label="Despesas previstas (recorrências)"
            cents={components.forecastExpensesCents}
            sign="−"
          />
          <Line label="Faturas de cartão a pagar" cents={components.invoicesCents} sign="−" />
          <Line
            label="Saídas agendadas (aplicações)"
            cents={components.pendingTransfersOutCents}
            sign="−"
          />
          <Line label="Disponível" cents={amountCents} sign="=" />
        </ul>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Transferências entre suas contas, investimentos e lançamentos cancelados não entram na
          conta.
        </p>
      </details>
    </section>
  );
}

/** Reaproveitado pelos relatórios (FASE 7): título, valor formatado, tom automático opcional. */
export function StatCard({
  title,
  cents,
  hint,
  tone,
  signed = false,
}: {
  title: string;
  cents: number;
  hint?: string;
  tone?: 'auto' | 'neutral';
  signed?: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm">
      <h2 className="text-sm font-medium text-slate-500 dark:text-slate-400">{title}</h2>
      <p
        className={`mt-1 text-xl font-semibold tabular-nums ${tone === 'auto' ? amountTone(cents) : 'text-slate-900 dark:text-slate-50'}`}
        aria-label={title}
      >
        {signed ? formatSigned(cents) : formatBRL(cents)}
      </p>
      {hint ? <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p> : null}
    </section>
  );
}
