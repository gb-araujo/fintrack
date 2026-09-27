import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  account,
  callsTo,
  creditCard,
  invoiceSummary,
  mockLedgerApi,
} from '../../test/ledger-mocks';
import { errorResponse, jsonResponse, renderRoute } from '../../test/render';

const inter = account({ name: 'Banco Inter' });

function mockCards(items = [creditCard()], extra: Parameters<typeof mockLedgerApi>[1] = {}) {
  return mockLedgerApi(
    { accounts: [inter] },
    { 'GET /api/v1/credit-cards': () => jsonResponse({ items }), ...extra },
  );
}

describe('CreditCardsPage', () => {
  it('lista cartões com limite usado/disponível e a fatura aberta (valores do backend)', async () => {
    const open = invoiceSummary({
      status: 'open',
      totalCents: 15_000,
      closingDate: '2026-09-28',
      dueDate: '2026-10-05',
    });
    mockCards([
      creditCard({
        name: 'Nubank',
        usedLimitCents: 90_000,
        availableLimitCents: 410_000,
        openInvoice: open,
      }),
      creditCard({ name: 'Inter Black', archivedAt: '2026-09-01T00:00:00.000Z' }),
    ]);
    renderRoute('/credit-cards');

    const list = await screen.findByRole('list', { name: 'Cartões' });
    const [first, second] = within(list).getAllByRole('listitem') as [HTMLElement, HTMLElement];

    expect(within(first).getByRole('link', { name: 'Nubank' })).toBeInTheDocument();
    expect(first).toHaveTextContent(/R\$\s900,00/);
    expect(first).toHaveTextContent(/R\$\s4\.100,00/);
    expect(first).toHaveTextContent(
      /Fatura aberta: R\$\s150,00 · fecha 28\/09\/2026 · vence 05\/10\/2026/,
    );
    expect(
      within(first).getByRole('progressbar', { name: 'Limite usado de Nubank' }),
    ).toHaveAttribute('aria-valuenow', '18');
    expect(within(second).getByText('Arquivado')).toBeInTheDocument();
    expect(second).toHaveTextContent('Sem fatura aberta.');
  });

  it('limite estourado aparece em vermelho, com a barra limitada a 100%', async () => {
    mockCards([creditCard({ usedLimitCents: 600_000, availableLimitCents: -100_000 })]);
    renderRoute('/credit-cards');

    const list = await screen.findByRole('list', { name: 'Cartões' });

    expect(within(list).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    expect(within(list).getByText(/-R\$\s1\.000,00/).className).toContain('text-rose-600');
  });

  it('sem cartões: mostra o estado vazio', async () => {
    mockCards([]);
    renderRoute('/credit-cards');

    expect(await screen.findByText('Nenhum cartão ainda')).toBeInTheDocument();
  });

  it('cadastra um cartão enviando centavos e dias', async () => {
    const fetchMock = mockCards([], {
      'POST /api/v1/credit-cards': () => jsonResponse(creditCard({ name: 'Nubank' }), 201),
    });
    renderRoute('/credit-cards');

    await userEvent.click(await screen.findByRole('button', { name: 'Novo cartão' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo cartão' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Nubank');
    await userEvent.type(within(dialog).getByLabelText('Limite'), '5.000,00');
    await userEvent.type(within(dialog).getByLabelText('Dia do fechamento'), '28');
    await userEvent.type(within(dialog).getByLabelText('Dia do vencimento'), '5');
    await userEvent.selectOptions(
      within(dialog).getByLabelText('Conta para pagar a fatura'),
      inter.id,
    );
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await screen.findByRole('list', { name: 'Cartões' }).catch(() => undefined);
    expect(callsTo(fetchMock, 'POST', '/api/v1/credit-cards')[0]?.body).toEqual({
      name: 'Nubank',
      limitCents: 500_000,
      closingDay: 28,
      dueDay: 5,
      paymentAccountId: inter.id,
    });
  });

  it('valida nome, limite e dias antes de enviar', async () => {
    const fetchMock = mockCards([]);
    renderRoute('/credit-cards');
    await userEvent.click(await screen.findByRole('button', { name: 'Novo cartão' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo cartão' });
    await userEvent.type(within(dialog).getByLabelText('Dia do fechamento'), '32');
    await userEvent.type(within(dialog).getByLabelText('Dia do vencimento'), '0');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialog).findByText('Informe o nome do cartão.')).toBeInTheDocument();
    expect(within(dialog).getByText('Informe o valor.')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Informe um dia entre 1 e 31.')).toHaveLength(2);
    expect(callsTo(fetchMock, 'POST', '/api/v1/credit-cards')).toHaveLength(0);
  });

  it('mostra o erro da API (nome repetido)', async () => {
    mockCards([], {
      'POST /api/v1/credit-cards': () =>
        errorResponse(409, 'CONFLICT', 'Já existe um cartão ativo com esse nome.'),
    });
    renderRoute('/credit-cards');
    await userEvent.click(await screen.findByRole('button', { name: 'Novo cartão' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo cartão' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Nubank');
    await userEvent.type(within(dialog).getByLabelText('Limite'), '1000');
    await userEvent.type(within(dialog).getByLabelText('Dia do fechamento'), '10');
    await userEvent.type(within(dialog).getByLabelText('Dia do vencimento'), '20');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(
      await within(dialog).findByText('Já existe um cartão ativo com esse nome.'),
    ).toBeInTheDocument();
  });
});
