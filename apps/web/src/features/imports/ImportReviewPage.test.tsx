import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  account,
  callsTo,
  category,
  importDetail,
  importRow,
  invoiceSummary,
  mockLedgerApi,
} from '../../test/ledger-mocks';
import { errorResponse, jsonResponse, renderRoute } from '../../test/render';

const inter = account({ name: 'Banco Inter' });
const mp = account({ name: 'Mercado Pago', type: 'wallet' });
const internet = category({ name: 'Internet' });
const salary = category({ name: 'Salário', kind: 'income' });
const invoice = invoiceSummary({ referenceMonth: '2026-10', totalCents: 90_000 });
const payable = { ...invoice, cardName: 'Nubank', payableCents: 90_000 };
const ids = {
  net: crypto.randomUUID(),
  salary: crypto.randomUUID(),
  dup: crypto.randomUUID(),
  mp: crypto.randomUUID(),
  pay: crypto.randomUUID(),
};

const rows = () => [
  importRow({
    id: ids.net,
    rowNumber: 6,
    description: 'TELEFONICA BRAS',
    amountCents: 9_099,
    suggestedCategoryId: internet.id,
    suggestionSource: 'default_rule',
  }),
  importRow({
    id: ids.salary,
    rowNumber: 7,
    description: 'SALARIO EMPRESA',
    direction: 'in',
    amountCents: 500_000,
    suggestedType: 'income',
    suggestedCategoryId: salary.id,
    suggestionSource: 'default_rule',
  }),
  importRow({
    id: ids.dup,
    rowNumber: 8,
    description: 'PADARIA DO ZE',
    amountCents: 1_250,
    duplicate: { kind: 'possible', transactionId: crypto.randomUUID() },
    defaultAction: 'skip',
  }),
  importRow({
    id: ids.mp,
    rowNumber: 9,
    description: 'PIX ENVIADO MERCADO PAGO',
    amountCents: 30_000,
    suggestedType: 'transfer',
    suggestedTargetAccountId: mp.id,
    suggestionSource: 'own_account',
  }),
];

function mockReview(
  view = importDetail({ accountId: inter.id, rows: rows(), rowsCount: 4 }),
  extra: Parameters<typeof mockLedgerApi>[1] = {},
) {
  const fetchMock = mockLedgerApi(
    { accounts: [inter, mp], categories: [internet, salary] },
    {
      [`GET /api/v1/imports/${view.id}`]: () => jsonResponse(view),
      'GET /api/v1/invoices/payable': () => jsonResponse({ items: [payable] }),
      ...extra,
    },
  );
  return { view, fetchMock };
}

const rowsList = () => screen.getByRole('list', { name: 'Movimentações do extrato' });
const checkbox = (n: number) => screen.getByRole('checkbox', { name: `Importar linha ${n}` });
const confirmButton = () => screen.getByRole('button', { name: /Confirmar importação/ });
const opened = async (view: { id: string }) => {
  renderRoute(`/imports/${view.id}`);
  await screen.findByRole('list', { name: 'Movimentações do extrato' });
};

describe('ImportReviewPage', () => {
  it('mostra cada linha com valor, sugestão e situação; duplicatas começam desmarcadas (mas visíveis)', async () => {
    const { view } = mockReview();
    await opened(view);

    expect(screen.getByText('TELEFONICA BRAS')).toBeInTheDocument();
    expect(screen.getByLabelText('Valor da linha 6')).toHaveTextContent(/−R\$\s90,99/);
    expect(screen.getByLabelText('Valor da linha 7')).toHaveTextContent(/\+R\$\s5\.000,00/);
    expect(within(rowsList()).getAllByText(/Sugestão: regra padrão/)).toHaveLength(2);
    expect(within(rowsList()).getByText(/Sugestão: conta sua/)).toBeInTheDocument();
    expect(screen.getByText('Possível duplicata')).toBeInTheDocument();
    expect(checkbox(6)).toBeChecked();
    expect(checkbox(8)).not.toBeChecked();
    expect(screen.getByText(/1 linha\(s\) parecem já estar no sistema/)).toBeInTheDocument();
    expect(screen.getByText(/3 de 4 serão importadas/)).toBeInTheDocument();
  });

  it('totais só somam receitas/despesas: transferência não conta como entrada nem saída', async () => {
    const { view } = mockReview();
    await opened(view);

    const summary = screen.getByText(/serão importadas/);

    expect(summary).toHaveTextContent(/entradas R\$\s5\.000,00/);
    expect(summary).toHaveTextContent(/saídas R\$\s90,99/);
  });

  it('confirma enviando uma decisão por linha e mostra o resultado', async () => {
    const view = importDetail({ accountId: inter.id, rows: rows(), rowsCount: 4 });
    const { fetchMock } = mockReview(view, {
      [`POST /api/v1/imports/${view.id}/confirm`]: () =>
        jsonResponse({
          importId: view.id,
          imported: 3,
          skipped: 1,
          transfers: 1,
          cardPayments: 0,
          rulesSaved: 0,
        }),
    });
    await opened(view);

    await userEvent.click(confirmButton());

    expect(await screen.findByText('Importação concluída')).toBeInTheDocument();
    expect(screen.getByText(/3 lançamento\(s\) criado\(s\), 1 pulado\(s\)/)).toBeInTheDocument();
    expect(screen.getByText(/1 transferência\(s\) entre suas contas/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver transações' })).toHaveAttribute(
      'href',
      '/transactions',
    );
    const [call] = callsTo(fetchMock, 'POST', `/api/v1/imports/${view.id}/confirm`);
    expect(call?.body).toEqual({
      decisions: [
        { rowId: ids.net, action: 'import', type: 'expense', categoryId: internet.id },
        { rowId: ids.salary, action: 'import', type: 'income', categoryId: salary.id },
        { rowId: ids.dup, action: 'skip' },
        { rowId: ids.mp, action: 'import', type: 'transfer', targetAccountId: mp.id },
      ],
    });
  });

  it('o usuário pode marcar a duplicata, desmarcar uma linha, trocar a categoria e lembrar a escolha', async () => {
    const view = importDetail({ accountId: inter.id, rows: rows(), rowsCount: 4 });
    const { fetchMock } = mockReview(view, {
      [`POST /api/v1/imports/${view.id}/confirm`]: () =>
        jsonResponse({
          importId: view.id,
          imported: 3,
          skipped: 1,
          transfers: 0,
          cardPayments: 0,
          rulesSaved: 1,
        }),
    });
    await opened(view);

    await userEvent.click(checkbox(8)); // duplicata: importar mesmo assim
    await userEvent.click(checkbox(9)); // transferência: pular
    await userEvent.selectOptions(screen.getByLabelText('Categoria (linha 6)'), '');
    await userEvent.click(screen.getByLabelText('Lembrar esta escolha (linha 6)'));
    await userEvent.click(confirmButton());

    await screen.findByText('Importação concluída');
    expect(screen.getByText(/1 regra\(s\) salva\(s\)/)).toBeInTheDocument();
    const [call] = callsTo(fetchMock, 'POST', `/api/v1/imports/${view.id}/confirm`);
    expect(call?.body).toEqual({
      decisions: [
        { rowId: ids.net, action: 'import', type: 'expense', categoryId: null, saveRule: true },
        { rowId: ids.salary, action: 'import', type: 'income', categoryId: salary.id },
        { rowId: ids.dup, action: 'import', type: 'expense', categoryId: null },
        { rowId: ids.mp, action: 'skip' },
      ],
    });
  });

  it('opções de tipo respeitam o sentido do dinheiro', async () => {
    const { view } = mockReview();
    await opened(view);

    const outflow = within(screen.getByLabelText('Tipo (linha 6)'))
      .getAllByRole('option')
      .map((option) => option.textContent);
    const inflow = within(screen.getByLabelText('Tipo (linha 7)'))
      .getAllByRole('option')
      .map((option) => option.textContent);

    expect(outflow).toEqual(['Despesa', 'Transferência', 'Pagamento de fatura']);
    expect(inflow).toEqual(['Receita', 'Transferência']);
  });

  it('transferência sem conta bloqueia a confirmação até escolher', async () => {
    const view = importDetail({ accountId: inter.id, rows: rows().slice(0, 1), rowsCount: 1 });
    mockReview(view);
    await opened(view);

    await userEvent.selectOptions(screen.getByLabelText('Tipo (linha 6)'), 'transfer');

    expect(confirmButton()).toBeDisabled();
    expect(screen.getByText(/Falta escolher a conta\/fatura em 1 linha/)).toBeInTheDocument();
    expect(screen.getByText('Escolha a outra conta.')).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText('Conta de destino (linha 6)'), mp.id);

    expect(confirmButton()).toBeEnabled();
  });

  it('pagamento de fatura: fatura sugerida já vem escolhida e o aviso diz que não é despesa', async () => {
    const payment = importRow({
      id: ids.pay,
      rowNumber: 3,
      description: 'PAGAMENTO FATURA NUBANK',
      amountCents: 90_000,
      suggestedType: 'card_payment',
      suggestedInvoiceId: invoice.id,
      suggestionSource: 'card_invoice',
    });
    const view = importDetail({ accountId: inter.id, rows: [payment], rowsCount: 1 });
    const { fetchMock } = mockReview(view, {
      [`POST /api/v1/imports/${view.id}/confirm`]: () =>
        jsonResponse({
          importId: view.id,
          imported: 1,
          skipped: 0,
          transfers: 0,
          cardPayments: 1,
          rulesSaved: 0,
        }),
    });
    await opened(view);

    expect(screen.getByText('Pagamento de fatura — não é despesa')).toBeInTheDocument();
    const select = await screen.findByLabelText('Fatura (linha 3)');
    expect(select).toHaveValue(invoice.id);
    expect(select).toHaveTextContent(/Nubank 10\/2026 — resta R\$\s900,00/);
    expect(screen.queryByLabelText('Lembrar esta escolha (linha 3)')).not.toBeInTheDocument();

    await userEvent.click(confirmButton());

    await screen.findByText('Importação concluída');
    expect(screen.getByText(/1 pagamento\(s\) de fatura de cartão/)).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', `/api/v1/imports/${view.id}/confirm`)[0]?.body).toEqual({
      decisions: [
        { rowId: ids.pay, action: 'import', type: 'card_payment', invoiceId: invoice.id },
      ],
    });
  });

  it('pagamento de fatura sem fatura correspondente começa pulado; marcar exige escolher a fatura', async () => {
    const payment = importRow({
      id: ids.pay,
      rowNumber: 3,
      description: 'PGTO FATURA CARTAO',
      amountCents: 12_300,
      suggestedType: 'card_payment',
      defaultAction: 'skip',
    });
    const view = importDetail({ accountId: inter.id, rows: [payment], rowsCount: 1 });
    mockReview(view);
    await opened(view);
    expect(checkbox(3)).not.toBeChecked();

    await userEvent.click(checkbox(3));

    expect(await screen.findByLabelText('Fatura (linha 3)')).toHaveValue('');
    expect(confirmButton()).toBeDisabled();
    await userEvent.selectOptions(screen.getByLabelText('Fatura (linha 3)'), invoice.id);
    expect(confirmButton()).toBeEnabled();
  });

  it('filtro "só o que precisa de atenção" mostra duplicatas, faturas e linhas sem sugestão', async () => {
    const { view } = mockReview();
    await opened(view);

    await userEvent.click(screen.getByLabelText(/Mostrar só o que precisa de atenção/));

    const descriptions = within(rowsList())
      .getAllByRole('listitem')
      .map((item) => item.textContent ?? '');
    expect(descriptions).toHaveLength(1); // só a duplicata (as demais têm sugestão)
    expect(descriptions.join(' ')).toContain('PADARIA DO ZE');
  });

  it('linhas ignoradas do arquivo são listadas com o motivo', async () => {
    const view = importDetail({
      accountId: inter.id,
      rows: rows().slice(0, 1),
      rowsCount: 1,
      ignoredRowsCount: 2,
      ignoredRows: [
        { line: 9, reason: 'Data não reconhecida: "Saldo final".' },
        { line: 10, reason: 'Valor zero.' },
      ],
    });
    mockReview(view);
    await opened(view);

    await userEvent.click(screen.getByText(/2 linha\(s\) do arquivo não viraram movimentação/));

    const list = screen.getByRole('list', { name: 'Linhas ignoradas' });
    expect(list).toHaveTextContent('Linha 9: Data não reconhecida: "Saldo final".');
    expect(list).toHaveTextContent('Linha 10: Valor zero.');
  });

  it('mostra o erro do servidor (importação inteira recusada) e continua na revisão', async () => {
    const view = importDetail({ accountId: inter.id, rows: rows().slice(0, 1), rowsCount: 1 });
    mockReview(view, {
      [`POST /api/v1/imports/${view.id}/confirm`]: () =>
        errorResponse(422, 'BUSINESS_RULE_VIOLATION', 'Linha 6: A conta está arquivada.'),
    });
    await opened(view);

    await userEvent.click(confirmButton());

    expect(await screen.findByText('Linha 6: A conta está arquivada.')).toBeInTheDocument();
    expect(confirmButton()).toBeInTheDocument();
  });

  it('descartar pede confirmação e chama a API só depois', async () => {
    const view = importDetail({ accountId: inter.id, rows: rows().slice(0, 1), rowsCount: 1 });
    const { fetchMock } = mockReview(view, {
      [`POST /api/v1/imports/${view.id}/cancel`]: () =>
        jsonResponse({ ...view, status: 'cancelled' }),
    });
    await opened(view);

    await userEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Descartar importação' });
    expect(callsTo(fetchMock, 'POST', `/api/v1/imports/${view.id}/cancel`)).toHaveLength(0);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Descartar' }));

    await screen.findByRole('list', { name: 'Movimentações do extrato' });
    expect(callsTo(fetchMock, 'POST', `/api/v1/imports/${view.id}/cancel`)).toHaveLength(1);
  });

  it('importação já confirmada é só consulta: sem controles nem botão de confirmar', async () => {
    const done = rows()
      .slice(0, 2)
      .map((row) => ({ ...row, status: 'imported' as const }));
    const view = importDetail({
      accountId: inter.id,
      status: 'confirmed',
      rows: done,
      rowsCount: 2,
    });
    mockReview(view);
    await opened(view);

    expect(screen.queryByRole('button', { name: /Confirmar importação/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Tipo (linha 6)')).not.toBeInTheDocument();
    expect(checkbox(6)).toBeDisabled();
    expect(screen.getAllByText('Importada.')).toHaveLength(2);
  });
});
