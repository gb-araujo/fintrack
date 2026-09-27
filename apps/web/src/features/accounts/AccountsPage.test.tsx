import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { account, callsTo, mockLedgerApi } from '../../test/ledger-mocks';
import { errorResponse, jsonResponse, renderRoute } from '../../test/render';

describe('AccountsPage', () => {
  it('lista as contas com o saldo calculado pelo backend e os selos de tipo', async () => {
    mockLedgerApi({
      accounts: [
        account({ name: 'Banco Inter', balanceCents: 426_364 }),
        account({ name: 'Nubank', balanceCents: -15_000 }),
        account({
          name: 'Tesouro Selic',
          type: 'investment',
          includeInAvailable: false,
          balanceCents: 50_000,
        }),
      ],
    });
    renderRoute('/accounts');

    const list = await screen.findByRole('list', { name: 'Contas' });
    const items = within(list).getAllByRole('listitem');

    expect(items).toHaveLength(3);
    expect(within(items[0]!).getByLabelText('Saldo de Banco Inter')).toHaveTextContent(
      /R\$\s4\.263,64/,
    );
    expect(within(items[1]!).getByLabelText('Saldo de Nubank')).toHaveTextContent(/-R\$\s150,00/);
    expect(within(items[2]!).getByText('Investimento')).toBeInTheDocument();
    expect(within(items[2]!).getByText('Fora do disponível')).toBeInTheDocument();
  });

  it('mostra o estado vazio', async () => {
    mockLedgerApi({ accounts: [] });
    renderRoute('/accounts');
    expect(await screen.findByText('Nenhuma conta ainda')).toBeInTheDocument();
  });

  it('contas arquivadas só aparecem quando pedido', async () => {
    const fetchMock = mockLedgerApi({
      accounts: [
        account({ name: 'Ativa' }),
        account({ name: 'Antiga', archivedAt: '2026-09-01T00:00:00.000Z' }),
      ],
    });
    renderRoute('/accounts');
    await screen.findByText('Ativa');
    expect(screen.queryByText('Antiga')).not.toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Mostrar contas arquivadas'));

    expect(await screen.findByText('Antiga')).toBeInTheDocument();
    expect(screen.getByText('Arquivada')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeInTheDocument();
    expect(callsTo(fetchMock, 'GET', '/api/v1/accounts').at(-1)?.url).toContain(
      'includeArchived=true',
    );
  });

  it('cria conta enviando o saldo em centavos inteiros', async () => {
    const created = account({
      name: 'Banco Inter',
      initialBalanceCents: 250_000,
      balanceCents: 250_000,
    });
    const fetchMock = mockLedgerApi(
      { accounts: [] },
      { 'POST /api/v1/accounts': () => jsonResponse(created, 201) },
    );
    renderRoute('/accounts');

    await userEvent.click(await screen.findByRole('button', { name: 'Nova conta' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova conta' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), '  Banco Inter ');
    await userEvent.type(within(dialog).getByLabelText('Saldo inicial'), '2.500,00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(callsTo(fetchMock, 'POST', '/api/v1/accounts')[0]?.body).toEqual({
      name: 'Banco Inter',
      type: 'bank',
      initialBalanceCents: 250_000,
      includeInAvailable: true,
    });
    await screen.findByRole('button', { name: 'Nova conta' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('saldo inicial vazio vale zero; negativo é aceito', async () => {
    const fetchMock = mockLedgerApi(
      { accounts: [] },
      { 'POST /api/v1/accounts': () => jsonResponse(account(), 201) },
    );
    renderRoute('/accounts');

    await userEvent.click(await screen.findByRole('button', { name: 'Nova conta' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Carteira');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await screen.findByRole('button', { name: 'Nova conta' });
    expect(callsTo(fetchMock, 'POST', '/api/v1/accounts')[0]?.body).toMatchObject({
      initialBalanceCents: 0,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Nova conta' }));
    const second = await screen.findByRole('dialog');
    await userEvent.type(within(second).getByLabelText('Nome'), 'Cheque especial');
    await userEvent.type(within(second).getByLabelText('Saldo inicial'), '-150,00');
    await userEvent.click(within(second).getByRole('button', { name: 'Salvar' }));
    await screen.findByRole('button', { name: 'Nova conta' });
    expect(callsTo(fetchMock, 'POST', '/api/v1/accounts')[1]?.body).toMatchObject({
      initialBalanceCents: -15_000,
    });
  });

  it('escolher "Investimento" desmarca "Considerar no dinheiro disponível"', async () => {
    mockLedgerApi({ accounts: [] });
    renderRoute('/accounts');
    await userEvent.click(await screen.findByRole('button', { name: 'Nova conta' }));
    const dialog = await screen.findByRole('dialog');
    const checkbox = within(dialog).getByLabelText('Considerar no dinheiro disponível');
    expect(checkbox).toBeChecked();

    await userEvent.selectOptions(within(dialog).getByLabelText('Tipo'), 'investment');

    expect(checkbox).not.toBeChecked();
  });

  it('valida nome e saldo antes de chamar a API', async () => {
    const fetchMock = mockLedgerApi({ accounts: [] });
    renderRoute('/accounts');
    await userEvent.click(await screen.findByRole('button', { name: 'Nova conta' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Saldo inicial'), 'abc');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialog).findByText('Informe o nome da conta.')).toBeInTheDocument();
    expect(within(dialog).getByText(/Valor inválido/)).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/api/v1/accounts')).toHaveLength(0);
  });

  it('mostra o erro da API (nome já usado) sem fechar o formulário', async () => {
    mockLedgerApi(
      { accounts: [] },
      {
        'POST /api/v1/accounts': () =>
          errorResponse(409, 'CONFLICT', 'Já existe uma conta ativa com esse nome.'),
      },
    );
    renderRoute('/accounts');
    await userEvent.click(await screen.findByRole('button', { name: 'Nova conta' }));
    const dialog = await screen.findByRole('dialog');
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Inter');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Já existe uma conta ativa com esse nome.',
    );
  });

  it('edita nome e saldo inicial (tipo não muda) e arquiva', async () => {
    const inter = account({
      name: 'Banco Inter',
      initialBalanceCents: 120_000,
      balanceCents: 120_000,
    });
    const fetchMock = mockLedgerApi(
      { accounts: [inter] },
      {
        [`PATCH /api/v1/accounts/${inter.id}`]: () => jsonResponse(inter),
        [`POST /api/v1/accounts/${inter.id}/archive`]: () =>
          jsonResponse({ ...inter, archivedAt: '2026-09-27T00:00:00.000Z' }),
      },
    );
    renderRoute('/accounts');

    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar conta' });
    expect(within(dialog).queryByLabelText('Tipo')).not.toBeInTheDocument();
    expect(within(dialog).getByLabelText('Saldo inicial')).toHaveValue('1.200,00');
    await userEvent.clear(within(dialog).getByLabelText('Nome'));
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Inter PJ');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await screen.findByRole('button', { name: 'Editar' });
    expect(callsTo(fetchMock, 'PATCH', `/api/v1/accounts/${inter.id}`)[0]?.body).toEqual({
      name: 'Inter PJ',
      initialBalanceCents: 120_000,
      includeInAvailable: true,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
    await screen.findByRole('list', { name: 'Contas' });
    expect(callsTo(fetchMock, 'POST', `/api/v1/accounts/${inter.id}/archive`)).toHaveLength(1);
  });
});
