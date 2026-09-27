import { addDaysToDate, todayInTimeZone } from '@fintrack/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  account,
  callsTo,
  category,
  lastQuery,
  mockLedgerApi,
  transaction,
} from '../../test/ledger-mocks';
import { errorResponse, jsonResponse, renderRoute } from '../../test/render';

const today = todayInTimeZone('America/Sao_Paulo');
const inter = account({ name: 'Banco Inter' });
const mercadoPago = account({ name: 'Mercado Pago', type: 'wallet' });
const food = category({ name: 'Alimentação' });
const salary = category({ name: 'Salário', kind: 'income' });

const page = (items: ReturnType<typeof transaction>[], nextCursor: string | null = null) => ({
  '': { items, nextCursor },
});

function rows() {
  return within(screen.getByRole('list', { name: 'Lançamentos' })).getAllByRole('listitem');
}

describe('TransactionsPage — lista', () => {
  it('pagamento de fatura: valor neutro (não é despesa), com rótulo, sem edição — só cancelar', async () => {
    mockLedgerApi({
      accounts: [inter],
      pages: page([
        transaction({
          accountId: inter.id,
          type: 'card_payment',
          amountCents: 90_000,
          description: 'Fatura Nubank 10/2026',
          creditCardInvoiceId: crypto.randomUUID(),
          transactionDate: '2026-10-05',
        }),
      ]),
    });
    renderRoute('/transactions');

    await screen.findByRole('list', { name: 'Lançamentos' });
    const [row] = rows();

    const item = row as HTMLElement;
    expect(item).toHaveTextContent('Fatura Nubank 10/2026');
    expect(within(item).getByText('Pagamento de fatura')).toBeInTheDocument();
    expect(within(item).getByLabelText(/Valor: −R\$\s900,00/).className).toContain(
      'text-slate-600',
    );
    expect(within(item).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(within(item).getByRole('button', { name: 'Cancelar' })).toBeInTheDocument();
  });

  it('mostra valores com sinal, categoria, conta e situação', async () => {
    mockLedgerApi({
      accounts: [inter, mercadoPago],
      categories: [food, salary],
      pages: page([
        transaction({
          accountId: inter.id,
          type: 'income',
          amountCents: 500_000,
          description: 'Salário setembro',
          categoryId: salary.id,
          transactionDate: '2026-09-05',
        }),
        transaction({
          accountId: inter.id,
          type: 'expense',
          amountCents: 9_099,
          description: 'Mercado',
          categoryId: food.id,
          paymentMethod: 'pix',
          transactionDate: '2026-09-04',
        }),
        transaction({
          accountId: inter.id,
          type: 'expense',
          amountCents: 18_735,
          description: 'Enel',
          status: 'pending',
          transactionDate: '2026-10-05',
        }),
        transaction({
          accountId: inter.id,
          type: 'expense',
          amountCents: 100,
          description: 'Errado',
          status: 'cancelled',
          transactionDate: '2026-09-01',
        }),
      ]),
    });
    renderRoute('/transactions');

    await screen.findByRole('list', { name: 'Lançamentos' });
    const [income, expense, pending, cancelled] = rows() as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];

    expect(within(income).getByLabelText(/^Valor: \+R\$/)).toHaveTextContent(/\+R\$\s5\.000,00/);
    expect(within(income).getByText(/Salário · Banco Inter/)).toBeInTheDocument();
    expect(within(income).getByText('05/09/2026')).toBeInTheDocument();
    expect(within(expense).getByLabelText(/^Valor: −R\$/)).toHaveTextContent(/−R\$\s90,99/);
    expect(within(expense).getByText(/Alimentação · Banco Inter · Pix/)).toBeInTheDocument();
    expect(within(pending).getByText('Pendente')).toBeInTheDocument();
    expect(within(pending).getByRole('button', { name: 'Paguei' })).toBeInTheDocument();
    expect(within(cancelled).getByText('Cancelado')).toBeInTheDocument();
    expect(within(cancelled).queryByRole('button')).not.toBeInTheDocument();
  });

  it('transferência: rótulo com a outra conta, selo e valor neutro (não é receita nem despesa)', async () => {
    const transfer = {
      id: crypto.randomUUID(),
      fromAccountId: inter.id,
      toAccountId: mercadoPago.id,
    };
    mockLedgerApi({
      accounts: [inter, mercadoPago],
      categories: [],
      pages: page([
        transaction({
          accountId: inter.id,
          type: 'transfer',
          amountCents: 30_000,
          transfer: { ...transfer, direction: 'out' },
        }),
        transaction({
          accountId: mercadoPago.id,
          type: 'transfer',
          amountCents: 30_000,
          transfer: { ...transfer, direction: 'in' },
        }),
      ]),
    });
    renderRoute('/transactions');

    await screen.findByRole('list', { name: 'Lançamentos' });
    const [out, incoming] = rows() as [HTMLElement, HTMLElement];

    expect(within(out).getByText('Transferência para Mercado Pago')).toBeInTheDocument();
    expect(within(out).getByLabelText(/^Valor:/)).toHaveTextContent(/−R\$\s300,00/);
    expect(within(out).getByLabelText(/^Valor:/).className).toContain('text-slate-600');
    expect(within(incoming).getByText('Transferência de Banco Inter')).toBeInTheDocument();
    expect(within(incoming).getByLabelText(/^Valor:/)).toHaveTextContent(/\+R\$\s300,00/);
    expect(within(incoming).getAllByText('Transferência').length).toBeGreaterThan(0);
  });

  it('estado vazio e erro com nova tentativa', async () => {
    mockLedgerApi({ accounts: [inter], categories: [], pages: page([]) });
    renderRoute('/transactions');
    expect(await screen.findByText('Nenhum lançamento ainda')).toBeInTheDocument();
  });

  it('erro ao carregar mostra alerta e permite tentar de novo', async () => {
    mockLedgerApi(
      { accounts: [inter], categories: [] },
      {
        'GET /api/v1/transactions': () =>
          errorResponse(500, 'INTERNAL_ERROR', 'Erro interno do servidor.'),
      },
    );
    renderRoute('/transactions');
    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno do servidor.');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });

  it('"Carregar mais" usa o cursor e acrescenta os itens', async () => {
    const first = transaction({ accountId: inter.id, description: 'Primeiro', amountCents: 100 });
    const second = transaction({ accountId: inter.id, description: 'Segundo', amountCents: 200 });
    const fetchMock = mockLedgerApi({
      accounts: [inter],
      categories: [],
      pages: {
        '': { items: [first], nextCursor: 'cursor-2' },
        'cursor-2': { items: [second], nextCursor: null },
      },
    });
    renderRoute('/transactions');

    await userEvent.click(await screen.findByRole('button', { name: 'Carregar mais' }));

    await screen.findByText('Segundo');
    expect(screen.getByText('Primeiro')).toBeInTheDocument();
    expect(lastQuery(fetchMock, '/api/v1/transactions').get('cursor')).toBe('cursor-2');
    expect(screen.queryByRole('button', { name: 'Carregar mais' })).not.toBeInTheDocument();
  });
});

describe('TransactionsPage — filtros', () => {
  it('conta, tipo, situação e período viram parâmetros da consulta; "Limpar" os remove', async () => {
    const fetchMock = mockLedgerApi({
      accounts: [inter, mercadoPago],
      categories: [],
      pages: page([]),
    });
    renderRoute('/transactions');
    const filters = await screen.findByRole('search', { name: 'Filtros de lançamentos' });

    // As contas chegam de forma assíncrona: espera a opção existir antes de selecioná-la.
    await within(filters).findByRole('option', { name: 'Mercado Pago' });
    await userEvent.selectOptions(within(filters).getByLabelText('Conta'), mercadoPago.id);
    await userEvent.selectOptions(within(filters).getByLabelText('Tipo'), 'expense');
    await userEvent.selectOptions(within(filters).getByLabelText('Situação'), 'pending');
    await userEvent.type(within(filters).getByLabelText('De'), '2026-09-01');
    await userEvent.type(within(filters).getByLabelText('Até'), '2026-09-30');

    await waitFor(() => {
      const query = lastQuery(fetchMock, '/api/v1/transactions');
      expect(query.get('accountId')).toBe(mercadoPago.id);
      expect(query.get('type')).toBe('expense');
      expect(query.get('status')).toBe('pending');
      expect(query.get('from')).toBe('2026-09-01');
      expect(query.get('to')).toBe('2026-09-30');
    });

    await userEvent.click(within(filters).getByRole('button', { name: 'Limpar filtros' }));
    await waitFor(() => {
      const query = lastQuery(fetchMock, '/api/v1/transactions');
      expect([...query.keys()]).toEqual(['limit']);
    });
  });

  it('a busca por texto espera o usuário parar de digitar', async () => {
    const fetchMock = mockLedgerApi({ accounts: [inter], categories: [], pages: page([]) });
    renderRoute('/transactions');
    const search = await screen.findByLabelText('Buscar na descrição');
    const before = callsTo(fetchMock, 'GET', '/api/v1/transactions').length;

    await userEvent.type(search, 'mercado');

    await waitFor(() =>
      expect(lastQuery(fetchMock, '/api/v1/transactions').get('q')).toBe('mercado'),
    );
    // Uma única consulta nova para o texto inteiro (não uma por tecla).
    expect(callsTo(fetchMock, 'GET', '/api/v1/transactions').length - before).toBe(1);
  });
});

describe('TransactionsPage — ações', () => {
  it('"Paguei" em pendente de hoje efetiva direto e atualiza contas e lançamentos', async () => {
    const pending = transaction({
      accountId: inter.id,
      type: 'expense',
      status: 'pending',
      description: 'Boleto',
      transactionDate: today,
    });
    const fetchMock = mockLedgerApi(
      { accounts: [inter], categories: [], pages: page([pending]) },
      {
        [`POST /api/v1/transactions/${pending.id}/complete`]: () =>
          jsonResponse({ ...pending, status: 'completed' }),
      },
    );
    renderRoute('/transactions');

    await userEvent.click(await screen.findByRole('button', { name: 'Paguei' }));

    await waitFor(() =>
      expect(
        callsTo(fetchMock, 'POST', `/api/v1/transactions/${pending.id}/complete`),
      ).toHaveLength(1),
    );
    // Saldos vêm do backend: a lista de contas também é recarregada.
    await waitFor(() =>
      expect(callsTo(fetchMock, 'GET', '/api/v1/accounts').length).toBeGreaterThan(1),
    );
  });

  it('pendente com vencimento futuro pergunta a data real e recusa data futura', async () => {
    const future = transaction({
      accountId: inter.id,
      type: 'income',
      status: 'pending',
      description: 'Freela',
      transactionDate: addDaysToDate(today, 10),
    });
    const fetchMock = mockLedgerApi(
      { accounts: [inter], categories: [], pages: page([future]) },
      {
        [`POST /api/v1/transactions/${future.id}/complete`]: () =>
          jsonResponse({ ...future, status: 'completed' }),
      },
    );
    renderRoute('/transactions');

    await userEvent.click(await screen.findByRole('button', { name: 'Recebi' }));
    const dialog = await screen.findByRole('dialog', { name: 'Quando você recebeu?' });
    expect(callsTo(fetchMock, 'POST', `/api/v1/transactions/${future.id}/complete`)).toHaveLength(
      0,
    );

    const date = within(dialog).getByLabelText('Data');
    expect(date).toHaveValue(today);
    await userEvent.clear(date);
    await userEvent.type(date, addDaysToDate(today, 1));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Efetivar' }));
    expect(await within(dialog).findByText(/até hoje/)).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', `/api/v1/transactions/${future.id}/complete`)).toHaveLength(
      0,
    );

    await userEvent.clear(date);
    await userEvent.type(date, today);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Efetivar' }));
    await waitFor(() =>
      expect(
        callsTo(fetchMock, 'POST', `/api/v1/transactions/${future.id}/complete`)[0]?.body,
      ).toEqual({ transactionDate: today }),
    );
  });

  it('cancelar pede confirmação e só então chama a API', async () => {
    const tx = transaction({ accountId: inter.id, description: 'Uber', amountCents: 2_490 });
    const fetchMock = mockLedgerApi(
      { accounts: [inter], categories: [], pages: page([tx]) },
      {
        [`POST /api/v1/transactions/${tx.id}/cancel`]: () =>
          jsonResponse({ ...tx, status: 'cancelled' }),
      },
    );
    renderRoute('/transactions');

    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar lançamento?' });
    expect(callsTo(fetchMock, 'POST', `/api/v1/transactions/${tx.id}/cancel`)).toHaveLength(0);
    expect(dialog).toHaveTextContent('"Uber" deixa de contar no saldo');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar lançamento' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, 'POST', `/api/v1/transactions/${tx.id}/cancel`)).toHaveLength(1),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('"Voltar" na confirmação não cancela nada', async () => {
    const tx = transaction({ accountId: inter.id });
    const fetchMock = mockLedgerApi({ accounts: [inter], categories: [], pages: page([tx]) });
    renderRoute('/transactions');

    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    await userEvent.click(
      within(await screen.findByRole('dialog')).getByRole('button', { name: 'Voltar' }),
    );

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', `/api/v1/transactions/${tx.id}/cancel`)).toHaveLength(0);
  });

  it('cancelar uma perna cancela a TRANSFERÊNCIA inteira (rota /transfers)', async () => {
    const transferId = crypto.randomUUID();
    const leg = transaction({
      accountId: inter.id,
      type: 'transfer',
      amountCents: 30_000,
      transfer: {
        id: transferId,
        direction: 'out',
        fromAccountId: inter.id,
        toAccountId: mercadoPago.id,
      },
    });
    const fetchMock = mockLedgerApi(
      { accounts: [inter, mercadoPago], categories: [], pages: page([leg]) },
      { [`POST /api/v1/transfers/${transferId}/cancel`]: () => jsonResponse({ id: transferId }) },
    );
    renderRoute('/transactions');

    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar transferência?' });
    expect(dialog).toHaveTextContent('nas duas contas');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar lançamento' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, 'POST', `/api/v1/transfers/${transferId}/cancel`)).toHaveLength(1),
    );
    expect(callsTo(fetchMock, 'POST', `/api/v1/transactions/${leg.id}/cancel`)).toHaveLength(0);
  });

  it('erro da API ao cancelar aparece na própria confirmação', async () => {
    const tx = transaction({ accountId: inter.id });
    mockLedgerApi(
      { accounts: [inter], categories: [], pages: page([tx]) },
      {
        [`POST /api/v1/transactions/${tx.id}/cancel`]: () =>
          errorResponse(500, 'INTERNAL_ERROR', 'Erro interno do servidor.'),
      },
    );
    renderRoute('/transactions');

    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar lançamento' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Erro interno do servidor.');
  });
});
