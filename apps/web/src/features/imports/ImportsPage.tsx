import type { ImportSummary } from '@fintrack/shared';
import { useMemo, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import {
  Badge,
  ConfirmDialog,
  EmptyState,
  FormError,
  QueryError,
  Spinner,
} from '../../components/ui/Feedback';
import { InputField, SelectField } from '../../components/ui/Fields';
import { formErrorMessage } from '../../lib/form-errors';
import { ApiError } from '../../services/http';
import { formatDate } from '../ledger/labels';
import { useAccounts } from '../ledger/queries';
import { RulesSection } from './RulesSection';
import { useCreateImport, useImports, useRevertImport } from './queries';
import { readStatementFile } from './read-file';

const STATUS: Record<
  ImportSummary['status'],
  { label: string; tone: 'sky' | 'emerald' | 'slate' | 'amber' }
> = {
  review: { label: 'Em revisão', tone: 'sky' },
  confirmed: { label: 'Confirmada', tone: 'emerald' },
  cancelled: { label: 'Cancelada', tone: 'slate' },
  reverted: { label: 'Desfeita', tone: 'amber' },
};

interface MappingState {
  headers: string[];
  date: string;
  description: string;
  amount: string;
}

function headersFrom(error: unknown): string[] | null {
  if (!(error instanceof ApiError) || error.status !== 422) return null;
  const details = error.details as { headers?: unknown } | undefined;
  const headers = details?.headers;
  return Array.isArray(headers) && headers.length > 0 ? (headers as string[]) : null;
}

export function ImportsPage() {
  return (
    <>
      <PageHeader
        title="Importar extrato"
        description="Leia o CSV do banco, revise o que foi encontrado e só então confirme. Nada vira lançamento antes da sua confirmação."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <NewImportSection />
        <HistorySection />
      </div>
      <div className="mt-6">
        <RulesSection />
      </div>
    </>
  );
}

function NewImportSection() {
  const navigate = useNavigate();
  const accounts = useAccounts(false);
  const create = useCreateImport();
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [mapping, setMapping] = useState<MappingState | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const usable = useMemo(
    () => (accounts.data ?? []).filter((account) => account.type !== 'investment'),
    [accounts.data],
  );
  const effectiveAccountId = accountId || usable[0]?.id || '';

  async function submit(text: string, columns?: MappingState) {
    try {
      const view = await create.mutateAsync({
        accountId: effectiveAccountId,
        filename: file?.name ?? 'extrato.csv',
        content: text,
        ...(columns
          ? {
              mapping: {
                date: columns.date,
                description: [columns.description],
                amount: columns.amount,
              },
            }
          : {}),
      });
      void navigate(`/imports/${view.id}`);
    } catch (error) {
      const headers = headersFrom(error);
      if (headers && !columns) {
        // Não reconheci as colunas: deixa o usuário indicar quais usar (e reenvia o mesmo arquivo).
        setMapping({
          headers,
          date: headers[0] ?? '',
          description: headers[1] ?? headers[0] ?? '',
          amount: headers[2] ?? headers[0] ?? '',
        });
        setFormError(formErrorMessage(error));
        return;
      }
      setFormError(formErrorMessage(error));
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    if (!effectiveAccountId) {
      setFormError('Escolha a conta do extrato.');
      return;
    }
    if (!file) {
      setFormError('Escolha o arquivo do extrato.');
      return;
    }
    let text = content;
    if (text === null) {
      text = await readStatementFile(file);
      setContent(text);
    }
    await submit(text, mapping ?? undefined);
  }

  const columnOptions = (mapping?.headers ?? []).map((header) => ({
    value: header,
    label: header,
  }));

  return (
    <section
      aria-labelledby="new-import-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="new-import-title" className="mb-3 font-semibold text-slate-900">
        Nova importação
      </h2>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <SelectField
          label="Conta do extrato"
          value={effectiveAccountId}
          onChange={(event) => setAccountId(event.target.value)}
          options={usable.map((account) => ({ value: account.id, label: account.name }))}
          hint="Cartão de crédito e investimentos ainda não são importados por aqui."
        />
        <InputField
          label="Arquivo do extrato (CSV)"
          type="file"
          accept=".csv,.txt,text/csv"
          onChange={(event) => {
            setFile(event.target.files?.[0] ?? null);
            setContent(null);
            setMapping(null);
            setFormError(null);
          }}
        />
        {mapping ? (
          <fieldset className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
            <legend className="px-1 text-sm font-medium text-amber-900">
              Indique as colunas do arquivo
            </legend>
            <SelectField
              label="Coluna da data"
              value={mapping.date}
              onChange={(event) => setMapping({ ...mapping, date: event.target.value })}
              options={columnOptions}
            />
            <SelectField
              label="Coluna da descrição"
              value={mapping.description}
              onChange={(event) => setMapping({ ...mapping, description: event.target.value })}
              options={columnOptions}
            />
            <SelectField
              label="Coluna do valor"
              value={mapping.amount}
              onChange={(event) => setMapping({ ...mapping, amount: event.target.value })}
              options={columnOptions}
              hint="Valor com sinal: negativo = saída."
            />
          </fieldset>
        ) : null}
        <FormError message={formError} />
        <Button type="submit" disabled={create.isPending}>
          {create.isPending ? 'Lendo…' : mapping ? 'Tentar com estas colunas' : 'Ler extrato'}
        </Button>
      </form>
    </section>
  );
}

function HistorySection() {
  const history = useImports();
  const accounts = useAccounts(true);
  const revert = useRevertImport();
  const [reverting, setReverting] = useState<ImportSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const accountName = (id: string) =>
    accounts.data?.find((account) => account.id === id)?.name ?? 'Conta';

  async function confirmRevert() {
    if (!reverting) return;
    setError(null);
    try {
      await revert.mutateAsync(reverting.id);
      setReverting(null);
    } catch (mutationError) {
      setError(formErrorMessage(mutationError));
    }
  }

  return (
    <section
      aria-labelledby="history-title"
      className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
    >
      <h2 id="history-title" className="mb-3 font-semibold text-slate-900">
        Histórico
      </h2>
      {history.isPending ? (
        <Spinner />
      ) : history.isError ? (
        <QueryError error={history.error} onRetry={() => void history.refetch()} />
      ) : history.data.length === 0 ? (
        <EmptyState title="Nenhuma importação ainda" />
      ) : (
        <ul className="divide-y divide-slate-100" aria-label="Importações">
          {history.data.map((item) => (
            <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm text-slate-900">
                  {item.filename}
                  <span className="ml-2">
                    <Badge tone={STATUS[item.status].tone}>{STATUS[item.status].label}</Badge>
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  {accountName(item.accountId)} · {formatDate(item.createdAt.slice(0, 10))} ·{' '}
                  {item.rowsCount} linhas
                  {item.status === 'confirmed' || item.status === 'reverted'
                    ? ` · ${item.importedCount} importadas, ${item.skippedCount} puladas`
                    : ''}
                </p>
              </div>
              <div className="flex shrink-0 gap-1">
                {item.status === 'review' ? (
                  <Link
                    to={`/imports/${item.id}`}
                    className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    Revisar
                  </Link>
                ) : null}
                {item.status === 'confirmed' ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Desfazer importação ${item.filename}`}
                    onClick={() => {
                      setError(null);
                      setReverting(item);
                    }}
                  >
                    Desfazer
                  </Button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {reverting ? (
        <ConfirmDialog
          title="Desfazer importação"
          message={`Desfazer "${reverting.filename}"? Os ${reverting.importedCount} lançamentos criados por ela serão cancelados (nada é apagado) e os saldos voltam ao que eram.`}
          confirmLabel="Desfazer"
          pending={revert.isPending}
          error={error}
          onConfirm={() => void confirmRevert()}
          onCancel={() => setReverting(null)}
        />
      ) : null}
    </section>
  );
}
