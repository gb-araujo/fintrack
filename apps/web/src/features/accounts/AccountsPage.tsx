import { formatBRL, type Account } from '@fintrack/shared';
import { useState } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge, EmptyState, QueryError, Spinner } from '../../components/ui/Feedback';
import { CheckboxField } from '../../components/ui/Fields';
import { formErrorMessage } from '../../lib/form-errors';
import { ACCOUNT_TYPE_LABEL, amountTone } from '../ledger/labels';
import { useAccounts, useArchiveAccount } from '../ledger/queries';
import { AccountFormModal } from './AccountFormModal';

export function AccountsPage() {
  const [showArchived, setShowArchived] = useState(false);
  const [editing, setEditing] = useState<Account | 'new' | null>(null);
  const accounts = useAccounts(showArchived);
  const archive = useArchiveAccount();
  const [actionError, setActionError] = useState<string | null>(null);

  async function toggleArchive(account: Account) {
    setActionError(null);
    try {
      await archive.mutateAsync({ id: account.id, archive: account.archivedAt === null });
    } catch (error) {
      setActionError(formErrorMessage(error));
    }
  }

  return (
    <>
      <PageHeader
        title="Contas"
        description="Onde está o seu dinheiro: bancos, carteiras e investimentos. O saldo é calculado a partir dos lançamentos."
      />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <CheckboxField
          label="Mostrar contas arquivadas"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        <Button onClick={() => setEditing('new')}>Nova conta</Button>
      </div>

      {actionError ? (
        <p role="alert" className="mb-3 rounded-lg bg-rose-50 dark:bg-rose-950 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
          {actionError}
        </p>
      ) : null}

      {accounts.isPending ? (
        <Spinner />
      ) : accounts.isError ? (
        <QueryError error={accounts.error} onRetry={() => void accounts.refetch()} />
      ) : accounts.data.length === 0 ? (
        <EmptyState title="Nenhuma conta ainda">
          Cadastre suas contas (Banco Inter, Mercado Pago, Dinheiro…) para começar a lançar
          movimentações.
        </EmptyState>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2" aria-label="Contas">
          {accounts.data.map((account) => (
            <li
              key={account.id}
              className={`rounded-xl border bg-white dark:bg-slate-900 p-4 shadow-sm ${account.archivedAt ? 'border-slate-200 dark:border-slate-800 opacity-70' : 'border-slate-200 dark:border-slate-800'}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="truncate font-semibold text-slate-900 dark:text-slate-50">{account.name}</h2>
                  <div className="mt-1 flex flex-wrap gap-1.5">
                    <Badge>{ACCOUNT_TYPE_LABEL[account.type]}</Badge>
                    {account.archivedAt ? <Badge tone="amber">Arquivada</Badge> : null}
                    {!account.archivedAt && !account.includeInAvailable ? (
                      <Badge tone="sky">Fora do disponível</Badge>
                    ) : null}
                  </div>
                </div>
                <p
                  className={`shrink-0 text-lg font-semibold tabular-nums ${amountTone(account.balanceCents)}`}
                  aria-label={`Saldo de ${account.name}`}
                >
                  {formatBRL(account.balanceCents)}
                </p>
              </div>
              <div className="mt-3 flex justify-end gap-2">
                {!account.archivedAt ? (
                  <Button variant="secondary" size="sm" onClick={() => setEditing(account)}>
                    Editar
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={archive.isPending}
                  onClick={() => void toggleArchive(account)}
                >
                  {account.archivedAt ? 'Reativar' : 'Arquivar'}
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing ? (
        <AccountFormModal
          {...(editing === 'new' ? {} : { account: editing })}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  );
}
