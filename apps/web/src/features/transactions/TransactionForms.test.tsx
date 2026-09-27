import { addDaysToDate, todayInTimeZone } from '@fintrack/shared';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, callsTo, category, mockLedgerApi, transaction } from '../../test/ledger-mocks';
import { errorResponse, jsonResponse, renderRoute } from '../../test/render';

const today = todayInTimeZone('America/Sao_Paulo');
const inter = account({ name: 'Banco Inter' });
const mercadoPago = account({ name: 'Mercado Pago', type: 'wallet' });
const tesouro = account({ name: 'Tesouro Selic', type: 'investment' });
const food = category({ name: 'Alimentação', kind: 'expense' });
const salary = category({ name: 'Salário', kind: 'income' });

const state = {
  accounts: [inter, mercadoPago, tesouro],
  categories: [food, salary],
  pages: { '': { items: [], nextCursor: null } },
};

async function openDialog(button: string, name: string) {
  await userEvent.click(await screen.findByRole('button', { name: button }));
  const dialog = await screen.findByRole('dialog', { name });
  // As listas de contas/categorias chegam de forma assíncrona.
  await within(dialog).findByLabelText('Valor');
  return dialog;
}

describe('formulário de receita/despesa', () => {
  it('só oferece contas que aceitam lançamento (sem investimento) e categorias do tipo certo', async () => {
    mockLedgerApi(state);
    renderRoute('/transactions');
    const dialog = await openDialog('Nova despesa', 'Nova despesa');

    const accounts = within(within(dialog).getByLabelText('Conta')).getAllByRole('option');
    const categories = within(within(dialog).getByLabelText('Categoria')).getAllByRole('option');

    expect(accounts.map((o) => o.textContent)).toEqual(['Banco Inter', 'Mercado Pago']);
    expect(categories.map((o) => o.textContent)).toEqual(['Sem categoria', 'Alimentação']);
  });

  it('a data começa em hoje (fuso do usuário)', async () => {
    mockLedgerApi(state);
    renderRoute('/transactions');
    const dialog = await openDialog('Nova receita', 'Nova receita');
    expect(within(dialog).getByLabelText('Data')).toHaveValue(today);
  });

  it.each([
    ['vazio', '', 'Informe o valor.'],
    ['texto', 'abc', 'Valor inválido'],
    ['zero', '0', 'maior que zero'],
    ['negativo', '-5', 'positivo'],
  ])('valor %s é recusado sem chamar a API', async (_label, typed, message) => {
    const fetchMock = mockLedgerApi(state);
    renderRoute('/transactions');
    const dialog = await openDialog('Nova despesa', 'Nova despesa');
    if (typed) await userEvent.type(within(dialog).getByLabelText('Valor'), typed);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialog).findByText(new RegExp(message))).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/api/v1/transactions')).toHaveLength(0);
  });

  it('envia o valor em centavos inteiros e deixa a API decidir o status pela data', async () => {
    const fetchMock = mockLedgerApi(state, {
      'POST /api/v1/transactions': () => jsonResponse(transaction({ accountId: inter.id }), 201),
    });
    renderRoute('/transactions');
    const dialog = await openDialog('Nova despesa', 'Nova despesa');

    await userEvent.type(within(dialog).getByLabelText('Valor'), '90,99');
    await userEvent.type(within(dialog).getByLabelText('Descrição'), '  Vivo ');
    await userEvent.selectOptions(within(dialog).getByLabelText('Categoria'), food.id);
    await userEvent.selectOptions(within(dialog).getByLabelText('Forma de pagamento'), 'pix');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(callsTo(fetchMock, 'POST', '/api/v1/transactions')[0]?.body).toEqual({
      accountId: inter.id,
      type: 'expense',
      categoryId: food.id,
      amountCents: 9_099,
      description: 'Vivo',
      transactionDate: today,
      paymentMethod: 'pix',
    });
  });

  it('marcar "pendente" envia status pending', async () => {
    const fetchMock = mockLedgerApi(state, {
      'POST /api/v1/transactions': () => jsonResponse(transaction({ accountId: inter.id }), 201),
    });
    renderRoute('/transactions');
    const dialog = await openDialog('Nova despesa', 'Nova despesa');

    await userEvent.type(within(dialog).getByLabelText('Valor'), '10');
    await userEvent.click(within(dialog).getByLabelText('Ainda não paguei (pendente)'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(callsTo(fetchMock, 'POST', '/api/v1/transactions')).toHaveLength(1));
    expect(callsTo(fetchMock, 'POST', '/api/v1/transactions')[0]?.body).toMatchObject({
      status: 'pending',
    });
  });

  it('data futura marca e trava "pendente" com explicação', async () => {
    mockLedgerApi(state);
    renderRoute('/transactions');
    const dialog = await openDialog('Nova receita', 'Nova receita');
    const date = within(dialog).getByLabelText('Data');
    await userEvent.clear(date);
    await userEvent.type(date, addDaysToDate(today, 7));

    const pending = within(dialog).getByLabelText('Ainda não recebi (pendente)');

    expect(pending).toBeChecked();
    expect(pending).toBeDisabled();
    expect(within(dialog).getByText(/Data futura/)).toBeInTheDocument();
  });

  it('mostra o erro de regra de negócio devolvido pela API', async () => {
    mockLedgerApi(state, {
      'POST /api/v1/transactions': () =>
        errorResponse(
          422,
          'BUSINESS_RULE_VIOLATION',
          'Escolha uma categoria de despesa para este lançamento.',
        ),
    });
    renderRoute('/transactions');
    const dialog = await openDialog('Nova despesa', 'Nova despesa');
    await userEvent.type(within(dialog).getByLabelText('Valor'), '10');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Escolha uma categoria de despesa',
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('editar preenche o formulário e envia as alterações', async () => {
    const tx = transaction({
      accountId: inter.id,
      type: 'expense',
      amountCents: 9_099,
      description: 'Vivo',
      categoryId: food.id,
      paymentMethod: 'boleto',
      transactionDate: '2026-09-15',
    });
    const fetchMock = mockLedgerApi(
      { ...state, pages: { '': { items: [tx], nextCursor: null } } },
      { [`PATCH /api/v1/transactions/${tx.id}`]: () => jsonResponse(tx) },
    );
    renderRoute('/transactions');

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar despesa' });
    await within(dialog).findByLabelText('Valor');
    expect(within(dialog).getByLabelText('Valor')).toHaveValue('90,99');
    expect(within(dialog).getByLabelText('Data')).toHaveValue('2026-09-15');
    expect(within(dialog).queryByLabelText(/pendente/)).not.toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('Valor'));
    await userEvent.type(within(dialog).getByLabelText('Valor'), '95,50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() =>
      expect(callsTo(fetchMock, 'PATCH', `/api/v1/transactions/${tx.id}`)).toHaveLength(1),
    );
    expect(callsTo(fetchMock, 'PATCH', `/api/v1/transactions/${tx.id}`)[0]?.body).toEqual({
      accountId: inter.id,
      categoryId: food.id,
      amountCents: 9_550,
      description: 'Vivo',
      transactionDate: '2026-09-15',
      paymentMethod: 'boleto',
    });
  });

  it('sem nenhuma conta, orienta a cadastrar antes de lançar', async () => {
    mockLedgerApi({ ...state, accounts: [] });
    renderRoute('/transactions');
    await userEvent.click(await screen.findByRole('button', { name: 'Nova despesa' }));
    expect(await screen.findByText(/Cadastre uma conta bancária ou carteira/)).toBeInTheDocument();
  });
});

describe('formulário de transferência', () => {
  it('oferece todas as contas ativas, inclusive investimento (aplicação/resgate)', async () => {
    mockLedgerApi(state);
    renderRoute('/transactions');
    const dialog = await openDialog('Nova transferência', 'Nova transferência');

    const from = within(within(dialog).getByLabelText('De (origem)')).getAllByRole('option');
    expect(from.map((o) => o.textContent)).toEqual([
      'Banco Inter',
      'Mercado Pago',
      'Tesouro Selic',
    ]);
    expect(within(dialog).getByText(/não é receita nem despesa/)).toBeInTheDocument();
  });

  it('recusa origem igual ao destino sem chamar a API', async () => {
    const fetchMock = mockLedgerApi(state);
    renderRoute('/transactions');
    const dialog = await openDialog('Nova transferência', 'Nova transferência');
    await userEvent.selectOptions(within(dialog).getByLabelText('Para (destino)'), inter.id);
    await userEvent.type(within(dialog).getByLabelText('Valor'), '50');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(
      await within(dialog).findByText('A conta de origem e a de destino devem ser diferentes.'),
    ).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/api/v1/transfers')).toHaveLength(0);
  });

  it('cria a transferência com valor em centavos', async () => {
    const fetchMock = mockLedgerApi(state, {
      'POST /api/v1/transfers': () => jsonResponse({ id: crypto.randomUUID() }, 201),
    });
    renderRoute('/transactions');
    const dialog = await openDialog('Nova transferência', 'Nova transferência');

    await userEvent.selectOptions(within(dialog).getByLabelText('De (origem)'), inter.id);
    await userEvent.selectOptions(within(dialog).getByLabelText('Para (destino)'), mercadoPago.id);
    await userEvent.type(within(dialog).getByLabelText('Valor'), '300,00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(callsTo(fetchMock, 'POST', '/api/v1/transfers')).toHaveLength(1));
    expect(callsTo(fetchMock, 'POST', '/api/v1/transfers')[0]?.body).toEqual({
      fromAccountId: inter.id,
      toAccountId: mercadoPago.id,
      amountCents: 30_000,
      transferDate: today,
      description: '',
    });
  });

  it('com menos de duas contas, explica o que falta', async () => {
    mockLedgerApi({ ...state, accounts: [inter] });
    renderRoute('/transactions');
    await userEvent.click(await screen.findByRole('button', { name: 'Nova transferência' }));
    expect(await screen.findByText(/pelo menos duas contas/)).toBeInTheDocument();
  });
});
