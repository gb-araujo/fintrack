import { formatBRL, type Occurrence, type Recurring } from '@fintrack/shared';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  QueryError,
  Spinner,
} from '../../components/ui/Feedback';
import { CheckboxField } from '../../components/ui/Fields';
import { formErrorMessage } from '../../lib/form-errors';
import { describeRecurrence, formatDate } from '../ledger/labels';
import { useAccounts } from '../ledger/queries';
import { ConfirmOccurrenceModal } from './ConfirmOccurrenceModal';
import { useOccurrences, useRecurring, useSetRecurringActive, useSkipOccurrence } from './queries';
import { RecurringFormModal } from './RecurringFormModal';

export function RecurringPage() {
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);

  return (
    <>
      <PageHeader
        title="Recorrências"
        description="Contas e receitas que se repetem. Ficam como previsão até você confirmar — só então viram lançamentos."
      />
      <div className="mb-4 flex justify-end">
        <Button onClick={() => setCreating(true)}>Nova recorrência</Button>
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <OccurrencesSection />
        <RulesSection showInactive={showInactive} onShowInactiveChange={setShowInactive} />
      </div>
      {creating ? <RecurringFormModal onClose={() => setCreating(false)} /> : null}
    </>
  );
}

function OccurrencesSection() {
  const occurrences = useOccurrences();
  const accounts = useAccounts(true);
  const [confirming, setConfirming] = useState<Occurrence | null>(null);
  const [skipping, setSkipping] = useState<Occurrence | null>(null);
  const skip = useSkipOccurrence();
  const [skipError, setSkipError] = useState<string | null>(null);

  const accountName = (id: string) =>
    accounts.data?.find((account) => account.id === id)?.name ?? 'Conta';

  async function confirmSkip() {
    if (!skipping) return;
    setSkipError(null);
    try {
      await skip.mutateAsync({ id: skipping.recurringId, date: skipping.date });
      setSkipping(null);
    } catch (error) {
      setSkipError(formErrorMessage(error));
    }
  }

  return (
    <section
      aria-labelledby="occurrences-title"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
    >
      <h2 id="occurrences-title" className="font-semibold text-slate-900 dark:text-slate-50">
        Previsões
      </h2>
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">
        Ainda não são lançamentos: não mexem no saldo nem nos relatórios.
      </p>

      {occurrences.isPending ? (
        <Spinner />
      ) : occurrences.isError ? (
        <QueryError error={occurrences.error} onRetry={() => void occurrences.refetch()} />
      ) : occurrences.data.length === 0 ? (
        <EmptyState title="Nenhuma previsão" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Ocorrências previstas">
          {occurrences.data.map((item) => (
            <li
              key={`${item.recurringId}|${item.date}`}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-900 dark:text-slate-50">
                  {item.name}
                  {item.overdue ? (
                    <span className="ml-2">
                      <Badge tone="rose">Atrasada</Badge>
                    </span>
                  ) : null}
                  {item.estimated ? (
                    <span className="ml-2">
                      <Badge tone="amber">Estimado</Badge>
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatDate(item.date)} · {accountName(item.accountId)}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span
                  className={`text-sm tabular-nums ${item.type === 'income' ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-600 dark:text-rose-400'}`}
                >
                  {item.type === 'income' ? '+' : '−'}
                  {formatBRL(item.amountCents)}
                </span>
                <Button
                  variant="secondary"
                  size="sm"
                  aria-label={`Confirmar ${item.name} de ${formatDate(item.date)}`}
                  onClick={() => setConfirming(item)}
                >
                  Confirmar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Pular ${item.name} de ${formatDate(item.date)}`}
                  onClick={() => {
                    setSkipError(null);
                    setSkipping(item);
                  }}
                >
                  Pular
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {confirming ? (
        <ConfirmOccurrenceModal occurrence={confirming} onClose={() => setConfirming(null)} />
      ) : null}
      {skipping ? (
        <ConfirmDialog
          title="Pular ocorrência"
          message={`Pular "${skipping.name}" de ${formatDate(skipping.date)}? Ela sai das previsões e não conta em saldo, relatórios nem orçamento.`}
          confirmLabel="Pular"
          pending={skip.isPending}
          error={skipError}
          onConfirm={() => void confirmSkip()}
          onCancel={() => setSkipping(null)}
        />
      ) : null}
    </section>
  );
}

function RulesSection({
  showInactive,
  onShowInactiveChange,
}: {
  showInactive: boolean;
  onShowInactiveChange: (value: boolean) => void;
}) {
  const rules = useRecurring(showInactive);
  const accounts = useAccounts(true);
  const setActive = useSetRecurringActive();
  const [editing, setEditing] = useState<Recurring | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const accountName = (id: string) =>
    accounts.data?.find((account) => account.id === id)?.name ?? 'Conta';

  async function toggle(rule: Recurring) {
    setActionError(null);
    try {
      await setActive.mutateAsync({ id: rule.id, active: !rule.active });
    } catch (error) {
      setActionError(formErrorMessage(error));
    }
  }

  return (
    <section
      aria-labelledby="rules-title"
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
    >
      <h2 id="rules-title" className="mb-3 font-semibold text-slate-900 dark:text-slate-50">
        Regras
      </h2>
      <div className="mb-3">
        <CheckboxField
          label="Mostrar desativadas"
          checked={showInactive}
          onChange={(event) => onShowInactiveChange(event.target.checked)}
        />
      </div>
      {actionError ? (
        <p role="alert" className="mb-2 text-sm text-rose-700 dark:text-rose-300">
          {actionError}
        </p>
      ) : null}

      {rules.isPending ? (
        <Spinner />
      ) : rules.isError ? (
        <QueryError error={rules.error} onRetry={() => void rules.refetch()} />
      ) : rules.data.length === 0 ? (
        <EmptyState title="Nenhuma recorrência cadastrada">
          Cadastre aluguel, assinaturas, salário… para acompanhar o que ainda vem pela frente.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800" aria-label="Recorrências">
          {rules.data.map((rule) => (
            <li key={rule.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p
                  className={`truncate text-sm ${rule.active ? 'text-slate-900 dark:text-slate-50' : 'text-slate-400 dark:text-slate-500'}`}
                >
                  {rule.name}
                  {!rule.active ? (
                    <span className="ml-2">
                      <Badge tone="amber">Desativada</Badge>
                    </span>
                  ) : null}
                  {rule.autoConfirm ? (
                    <span className="ml-2">
                      <Badge tone="sky">Automática</Badge>
                    </span>
                  ) : null}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {describeRecurrence(rule)} · {accountName(rule.accountId)}
                  {rule.nextDate ? ` · próxima ${formatDate(rule.nextDate)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <span className="mr-1 text-sm tabular-nums text-slate-700 dark:text-slate-200">
                  {rule.amountCents !== null
                    ? `${rule.isVariableAmount ? '~' : ''}${formatBRL(rule.amountCents)}`
                    : 'Variável'}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Editar ${rule.name}`}
                  onClick={() => setEditing(rule)}
                >
                  Editar
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`${rule.active ? 'Desativar' : 'Reativar'} ${rule.name}`}
                  disabled={setActive.isPending}
                  onClick={() => void toggle(rule)}
                >
                  {rule.active ? 'Desativar' : 'Reativar'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? <RecurringFormModal rule={editing} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}
