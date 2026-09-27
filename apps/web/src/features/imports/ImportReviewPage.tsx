import {
  formatBRL,
  type ConfirmImportResponse,
  type ImportDetail,
  type ImportRow,
  type ImportRowType,
} from '@fintrack/shared';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge, ConfirmDialog, FormError, QueryError, Spinner } from '../../components/ui/Feedback';
import { CheckboxField, SelectField } from '../../components/ui/Fields';
import { formErrorMessage } from '../../lib/form-errors';
import { formatDate } from '../ledger/labels';
import { useAccounts, useCategories } from '../ledger/queries';
import { useCancelImport, useConfirmImport, useImport, usePayableInvoices } from './queries';

interface RowChoice {
  import: boolean;
  type: ImportRowType;
  categoryId: string;
  targetAccountId: string;
  invoiceId: string;
  saveRule: boolean;
}

const TYPE_LABEL: Record<ImportRowType, string> = {
  income: 'Receita',
  expense: 'Despesa',
  transfer: 'Transferência',
  card_payment: 'Pagamento de fatura',
};

const TYPES_BY_DIRECTION: Record<ImportRow['direction'], ImportRowType[]> = {
  in: ['income', 'transfer'],
  out: ['expense', 'transfer', 'card_payment'],
};

const SOURCE_LABEL: Record<ImportRow['suggestionSource'], string> = {
  user_rule: 'regra sua',
  default_rule: 'regra padrão',
  own_account: 'conta sua',
  card_invoice: 'fatura com o mesmo valor',
  none: '',
};

function initialChoice(row: ImportRow): RowChoice {
  return {
    import: row.defaultAction === 'import',
    type: row.suggestedType,
    categoryId: row.suggestedCategoryId ?? '',
    targetAccountId: row.suggestedTargetAccountId ?? '',
    invoiceId: row.suggestedInvoiceId ?? '',
    saveRule: false,
  };
}

export function ImportReviewPage() {
  const { importId = '' } = useParams();
  const view = useImport(importId);
  if (view.isPending) return <Spinner />;
  if (view.isError) return <QueryError error={view.error} onRetry={() => void view.refetch()} />;
  return <Review data={view.data} />;
}

function Review({ data }: { data: ImportDetail }) {
  const accounts = useAccounts(false);
  const categories = useCategories(false);
  const invoices = usePayableInvoices();
  const confirm = useConfirmImport();
  const cancel = useCancelImport();
  const [choices, setChoices] = useState<Record<string, RowChoice>>(() =>
    Object.fromEntries(data.rows.map((row) => [row.id, initialChoice(row)])),
  );
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConfirmImportResponse | null>(null);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const inReview = data.status === 'review';
  const accountName = (id: string) =>
    accounts.data?.find((account) => account.id === id)?.name ?? 'Conta';
  const choiceOf = (row: ImportRow) => choices[row.id] ?? initialChoice(row);
  const update = (row: ImportRow, patch: Partial<RowChoice>) =>
    setChoices((current) => ({ ...current, [row.id]: { ...choiceOf(row), ...patch } }));

  const needsAttention = (row: ImportRow) =>
    row.duplicate !== null ||
    row.suggestedType === 'card_payment' ||
    row.suggestionSource === 'none';
  const visible = onlyAttention ? data.rows.filter(needsAttention) : data.rows;

  const selected = data.rows.filter((row) => choiceOf(row).import);
  const rowProblem = (row: ImportRow): string | null => {
    const choice = choiceOf(row);
    if (!choice.import) return null;
    if (choice.type === 'transfer' && !choice.targetAccountId) return 'Escolha a outra conta.';
    if (choice.type === 'card_payment' && !choice.invoiceId) return 'Escolha a fatura.';
    return null;
  };
  const problems = selected.filter((row) => rowProblem(row) !== null);
  const totals = useMemo(() => {
    let inflow = 0;
    let outflow = 0;
    for (const row of selected) {
      if (choiceOf(row).type === 'transfer' || choiceOf(row).type === 'card_payment') continue;
      if (row.direction === 'in') inflow += row.amountCents;
      else outflow += row.amountCents;
    }
    return { inflow, outflow };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [choices, data.rows]);

  async function handleConfirm() {
    setError(null);
    try {
      const response = await confirm.mutateAsync({
        id: data.id,
        input: {
          decisions: data.rows.map((row) => {
            const choice = choiceOf(row);
            const income = choice.type === 'income' || choice.type === 'expense';
            return {
              rowId: row.id,
              action: choice.import ? ('import' as const) : ('skip' as const),
              ...(choice.import
                ? {
                    type: choice.type,
                    ...(income ? { categoryId: choice.categoryId || null } : {}),
                    ...(choice.type === 'transfer'
                      ? { targetAccountId: choice.targetAccountId }
                      : {}),
                    ...(choice.type === 'card_payment' ? { invoiceId: choice.invoiceId } : {}),
                    ...(choice.saveRule ? { saveRule: true } : {}),
                  }
                : {}),
            };
          }),
        },
      });
      setResult(response);
    } catch (mutationError) {
      setError(formErrorMessage(mutationError));
    }
  }

  async function handleCancel() {
    try {
      await cancel.mutateAsync(data.id);
      setConfirmingCancel(false);
    } catch (mutationError) {
      setError(formErrorMessage(mutationError));
      setConfirmingCancel(false);
    }
  }

  if (result) {
    return (
      <>
        <PageHeader title="Importação concluída" />
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900"
        >
          <p className="font-semibold">
            {result.imported} lançamento(s) criado(s), {result.skipped} pulado(s).
          </p>
          <ul className="mt-1 list-disc pl-5">
            {result.transfers > 0 ? (
              <li>{result.transfers} transferência(s) entre suas contas</li>
            ) : null}
            {result.cardPayments > 0 ? (
              <li>{result.cardPayments} pagamento(s) de fatura de cartão</li>
            ) : null}
            {result.rulesSaved > 0 ? <li>{result.rulesSaved} regra(s) salva(s)</li> : null}
          </ul>
        </div>
        <div className="mt-4 flex gap-2">
          <Link
            to="/transactions"
            className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-900"
          >
            Ver transações
          </Link>
          <Link
            to="/imports"
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Nova importação
          </Link>
        </div>
      </>
    );
  }

  const duplicates = data.rows.filter((row) => row.duplicate !== null).length;

  return (
    <>
      <Link to="/imports" className="text-sm text-brand-700 hover:underline">
        ← Importar extrato
      </Link>
      <div className="mt-2">
        <PageHeader
          title={data.filename}
          description={`${accountName(data.accountId)} · ${data.rowsCount} movimentações lidas${
            inReview
              ? ''
              : ` · ${data.status === 'confirmed' ? 'confirmada' : data.status === 'reverted' ? 'desfeita' : 'cancelada'}`
          }`}
        />
      </div>

      {data.ignoredRowsCount > 0 ? (
        <details className="mb-4 rounded-lg border border-slate-200 bg-white p-3 text-sm">
          <summary className="cursor-pointer font-medium text-slate-700">
            {data.ignoredRowsCount} linha(s) do arquivo não viraram movimentação
          </summary>
          <ul className="mt-2 space-y-1 text-xs text-slate-600" aria-label="Linhas ignoradas">
            {data.ignoredRows.map((item) => (
              <li key={item.line}>
                Linha {item.line}: {item.reason}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      {duplicates > 0 && inReview ? (
        <p role="status" className="mb-4 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {duplicates} linha(s) parecem já estar no sistema e começam <strong>desmarcadas</strong>.
          Nada foi descartado: marque uma linha se quiser importá-la mesmo assim.
        </p>
      ) : null}

      {inReview ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <CheckboxField
            label="Mostrar só o que precisa de atenção (duplicatas, faturas, sem categoria)"
            checked={onlyAttention}
            onChange={(event) => setOnlyAttention(event.target.checked)}
          />
          <p className="text-sm text-slate-600">
            {selected.length} de {data.rows.length} serão importadas · entradas{' '}
            <span className="tabular-nums text-emerald-700">{formatBRL(totals.inflow)}</span> ·
            saídas <span className="tabular-nums text-rose-600">{formatBRL(totals.outflow)}</span>
          </p>
        </div>
      ) : null}

      <ul className="space-y-2" aria-label="Movimentações do extrato">
        {visible.map((row) => (
          <ReviewRow
            key={row.id}
            row={row}
            choice={choiceOf(row)}
            disabled={!inReview}
            problem={rowProblem(row)}
            categories={categories.data ?? []}
            accounts={(accounts.data ?? []).filter((account) => account.id !== data.accountId)}
            invoices={invoices.data ?? []}
            onChange={(patch) => update(row, patch)}
          />
        ))}
      </ul>

      {inReview ? (
        <div className="sticky bottom-0 mt-4 space-y-2 border-t border-slate-200 bg-slate-50/95 py-3 backdrop-blur">
          <FormError message={error} />
          {problems.length > 0 ? (
            <p role="status" className="text-sm text-amber-800">
              Falta escolher a conta/fatura em {problems.length} linha(s) marcada(s).
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void handleConfirm()}
              disabled={confirm.isPending || problems.length > 0}
            >
              {confirm.isPending ? 'Importando…' : `Confirmar importação (${selected.length})`}
            </Button>
            <Button variant="secondary" onClick={() => setConfirmingCancel(true)}>
              Descartar
            </Button>
          </div>
        </div>
      ) : null}

      {confirmingCancel ? (
        <ConfirmDialog
          title="Descartar importação"
          message="Descartar esta revisão? Nada foi criado; você pode ler o arquivo de novo depois."
          confirmLabel="Descartar"
          pending={cancel.isPending}
          error={null}
          onConfirm={() => void handleCancel()}
          onCancel={() => setConfirmingCancel(false)}
        />
      ) : null}
    </>
  );
}

function ReviewRow({
  row,
  choice,
  disabled,
  problem,
  categories,
  accounts,
  invoices,
  onChange,
}: {
  row: ImportRow;
  choice: RowChoice;
  disabled: boolean;
  problem: string | null;
  categories: { id: string; name: string; kind: 'income' | 'expense' }[];
  accounts: { id: string; name: string }[];
  invoices: { id: string; cardName: string; referenceMonth: string; payableCents: number }[];
  onChange: (patch: Partial<RowChoice>) => void;
}) {
  const inflow = row.direction === 'in';
  const showCategory = choice.type === 'income' || choice.type === 'expense';
  const categoryOptions = categories
    .filter((category) => category.kind === (inflow ? 'income' : 'expense'))
    .map((category) => ({ value: category.id, label: category.name }));

  return (
    <li
      className={`rounded-xl border p-3 shadow-sm ${choice.import ? 'border-slate-200 bg-white' : 'border-slate-200 bg-slate-100/70'}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <CheckboxField
            label={`Importar linha ${row.rowNumber}`}
            checked={choice.import}
            disabled={disabled}
            onChange={(event) => onChange({ import: event.target.checked })}
          />
          <p className="mt-1 truncate font-medium text-slate-900">{row.description}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            <span>{formatDate(row.date)}</span>
            {row.duplicate?.kind === 'exact' ? <Badge tone="rose">Já importada</Badge> : null}
            {row.duplicate?.kind === 'possible' ? (
              <Badge tone="amber">Possível duplicata</Badge>
            ) : null}
            {row.suggestedType === 'card_payment' ? (
              <Badge tone="sky">Pagamento de fatura — não é despesa</Badge>
            ) : null}
            {row.suggestionSource !== 'none' ? (
              <span>Sugestão: {SOURCE_LABEL[row.suggestionSource]}</span>
            ) : null}
          </p>
        </div>
        <span
          className={`text-base font-semibold tabular-nums ${inflow ? 'text-emerald-700' : 'text-rose-600'}`}
          aria-label={`Valor da linha ${row.rowNumber}`}
        >
          {inflow ? '+' : '−'}
          {formatBRL(row.amountCents)}
        </span>
      </div>

      {choice.import && !disabled ? (
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <SelectField
            label={`Tipo (linha ${row.rowNumber})`}
            value={choice.type}
            onChange={(event) => onChange({ type: event.target.value as ImportRowType })}
            options={TYPES_BY_DIRECTION[row.direction].map((type) => ({
              value: type,
              label: TYPE_LABEL[type],
            }))}
          />
          {showCategory ? (
            <SelectField
              label={`Categoria (linha ${row.rowNumber})`}
              value={choice.categoryId}
              onChange={(event) => onChange({ categoryId: event.target.value })}
              placeholder="Sem categoria"
              options={categoryOptions}
            />
          ) : null}
          {choice.type === 'transfer' ? (
            <SelectField
              label={`${inflow ? 'Conta de origem' : 'Conta de destino'} (linha ${row.rowNumber})`}
              value={choice.targetAccountId}
              onChange={(event) => onChange({ targetAccountId: event.target.value })}
              placeholder="Escolha…"
              options={accounts.map((account) => ({ value: account.id, label: account.name }))}
              error={problem ?? undefined}
            />
          ) : null}
          {choice.type === 'card_payment' ? (
            <SelectField
              label={`Fatura (linha ${row.rowNumber})`}
              value={choice.invoiceId}
              onChange={(event) => onChange({ invoiceId: event.target.value })}
              placeholder="Escolha…"
              options={invoices.map((invoice) => ({
                value: invoice.id,
                label: `${invoice.cardName} ${invoice.referenceMonth.slice(5)}/${invoice.referenceMonth.slice(0, 4)} — resta ${formatBRL(invoice.payableCents)}`,
              }))}
              error={problem ?? undefined}
            />
          ) : null}
          {choice.type !== 'card_payment' ? (
            <div className="self-end pb-2 sm:col-span-3">
              <CheckboxField
                label={`Lembrar esta escolha (linha ${row.rowNumber})`}
                checked={choice.saveRule}
                onChange={(event) => onChange({ saveRule: event.target.checked })}
                hint="Cria uma regra para sugerir o mesmo nas próximas importações."
              />
            </div>
          ) : null}
        </div>
      ) : null}
      {row.status === 'imported' ? (
        <p className="mt-2 text-xs text-emerald-700">Importada.</p>
      ) : row.status === 'skipped' ? (
        <p className="mt-2 text-xs text-slate-500">Pulada.</p>
      ) : null}
    </li>
  );
}
