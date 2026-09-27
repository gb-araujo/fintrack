import { todayInTimeZone } from '@fintrack/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  account,
  callsTo,
  category,
  creditCard,
  invoiceDetail,
  invoiceSummary,
  mockLedgerApi,
  purchase,
  transaction,
} from '../../test/ledger-mocks';
import { errorResponse, jsonResponse, renderRoute } from '../../test/render';

const inter = account({ name: 'Banco Inter' });
const mp = account({ name: 'Mercado Pago', type: 'wallet' });
const food = category({ name: 'Alimentação' });
const today = todayInTimeZone('America/Sao_Paulo');
const future = (days: number) => {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

const card = creditCard({
  name: 'Nubank',
  usedLimitCents: 90_000,
  availableLimitCents: 410_000,
  paymentAccountId: inter.id,
});
const october = invoiceSummary({
  creditCardId: card.id,
  referenceMonth: '2026-10',
  status: 'closed',
  totalCents: 90_000,
  remainingCents: 90_000,
});
const november = invoiceSummary({
  creditCardId: card.id,
  referenceMonth: '2026-11',
  closingDate: '2026-10-28',
  dueDate: '2026-11-05',
  status: 'open',
  totalCents: 30_000,
  remainingCents: 30_000,
});

function mockCard(
  extra: Parameters<typeof mockLedgerApi>[1] = {},
  overrides: { card?: typeof card } = {},
) {
  const current = overrides.card ?? card;
  return mockLedgerApi(
    { accounts: [inter, mp], categories: [food] },
    {
      [`GET /api/v1/credit-cards/${card.id}`]: () => jsonResponse(current),
      [`GET /api/v1/credit-cards/${card.id}/invoices`]: () =>
        jsonResponse({ items: [november, october] }),
      [`GET /api/v1/credit-cards/${card.id}/purchases`]: () =>
        jsonResponse({
          items: [
            purchase({ creditCardId: card.id, description: 'Notebook', installmentsCount: 3 }),
            purchase({
              creditCardId: card.id,
              description: 'Café',
              totalAmountCents: 1_500,
              installmentsCount: 1,
            }),
            purchase({
              creditCardId: card.id,
              description: 'Tênis',
              cancelled: true,
              installmentsCount: 2,
            }),
          ],
        }),
      ...extra,
    },
  );
}

const openInvoice = async (name: RegExp | string) => {
  await userEvent.click(await screen.findByRole('button', { name }));
  return screen.findByLabelText('Detalhe da fatura');
};

describe('CreditCardDetailPage', () => {
  it('mostra limite, faturas com status e as compras com parcelas', async () => {
    mockCard();
    renderRoute(`/credit-cards/${card.id}`);

    expect(await screen.findByRole('heading', { name: 'Nubank' })).toBeInTheDocument();
    expect(screen.getByLabelText('Limite usado')).toHaveTextContent(/R\$\s900,00/);
    expect(screen.getByLabelText('Limite disponível')).toHaveTextContent(/R\$\s4\.100,00/);

    const invoices = await screen.findByRole('list', { name: 'Faturas do cartão' });
    const [first, second] = within(invoices).getAllByRole('listitem') as [HTMLElement, HTMLElement];
    expect(first).toHaveTextContent('Fatura de novembro de 2026');
    expect(within(first).getByText('Aberta')).toBeInTheDocument();
    expect(second).toHaveTextContent('Fatura de outubro de 2026');
    expect(within(second).getByText('Fechada')).toBeInTheDocument();
    expect(within(second).getByLabelText('Total da fatura de outubro de 2026')).toHaveTextContent(
      /R\$\s900,00/,
    );

    const purchases = await screen.findByRole('list', { name: 'Compras do cartão' });
    const items = within(purchases).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/Notebook.*3x/);
    expect(items[1]).toHaveTextContent(/Café.*à vista/);
    expect(within(items[2] as HTMLElement).getByText('Cancelada')).toBeInTheDocument();
  });

  it('avisa quando as compras passam do limite (sem bloquear)', async () => {
    mockCard(
      {},
      { card: creditCard({ ...card, usedLimitCents: 600_000, availableLimitCents: -100_000 }) },
    );
    renderRoute(`/credit-cards/${card.id}`);

    expect(await screen.findByText(/passam do limite cadastrado/)).toBeInTheDocument();
    expect(screen.getByLabelText('Limite disponível').className).toContain('text-rose-600');
  });

  it('detalha a fatura: parcelas, pagamentos e valores em aberto do backend', async () => {
    mockCard({
      [`GET /api/v1/invoices/${october.id}`]: () =>
        jsonResponse(
          invoiceDetail({
            ...october,
            paidCents: 30_000,
            scheduledCents: 20_000,
            remainingCents: 60_000,
            installments: [
              {
                purchaseId: crypto.randomUUID(),
                description: 'Notebook',
                purchaseDate: '2026-09-20',
                categoryId: null,
                installmentNumber: 1,
                installmentsCount: 3,
                amountCents: 30_000,
              },
              {
                purchaseId: crypto.randomUUID(),
                description: 'Café',
                purchaseDate: '2026-09-21',
                categoryId: null,
                installmentNumber: 1,
                installmentsCount: 1,
                amountCents: 60_000,
              },
            ],
            payments: [
              {
                id: crypto.randomUUID(),
                accountId: inter.id,
                amountCents: 30_000,
                date: '2026-10-01',
                status: 'completed',
              },
              {
                id: crypto.randomUUID(),
                accountId: mp.id,
                amountCents: 20_000,
                date: '2026-10-04',
                status: 'pending',
              },
            ],
          }),
        ),
    });
    renderRoute(`/credit-cards/${card.id}`);

    const panel = await openInvoice(/Ver fatura de outubro de 2026/);

    const parcels = within(panel).getByRole('list', { name: 'Parcelas da fatura' });
    expect(within(parcels).getAllByRole('listitem')[0]).toHaveTextContent(
      /Notebook.*1\/3.*R\$\s300,00/,
    );
    const payments = within(panel).getByRole('list', { name: 'Pagamentos da fatura' });
    expect(payments).toHaveTextContent(/Banco Inter/);
    expect(within(payments).getByText('Agendado')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Em aberto')).toHaveTextContent(/R\$\s600,00/);
  });

  it('paga a fatura: valor restante sugerido, conta do cartão e envio em centavos', async () => {
    const fetchMock = mockCard({
      [`GET /api/v1/invoices/${october.id}`]: () =>
        jsonResponse(invoiceDetail({ ...october, paidCents: 30_000, remainingCents: 60_000 })),
      [`POST /api/v1/invoices/${october.id}/payments`]: () =>
        jsonResponse(transaction({ type: 'card_payment', creditCardInvoiceId: october.id }), 201),
    });
    renderRoute(`/credit-cards/${card.id}`);
    const panel = await openInvoice(/Ver fatura de outubro de 2026/);

    await userEvent.click(within(panel).getByRole('button', { name: 'Pagar fatura' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pagar fatura' });
    expect(within(dialog).getByLabelText('Valor')).toHaveValue('600,00');
    expect(within(dialog).getByLabelText('Conta pagadora')).toHaveValue(inter.id);
    await userEvent.clear(within(dialog).getByLabelText('Valor'));
    await userEvent.type(within(dialog).getByLabelText('Valor'), '250,50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Pagar' }));

    await screen.findByRole('list', { name: 'Faturas do cartão' });
    expect(callsTo(fetchMock, 'POST', `/api/v1/invoices/${october.id}/payments`)[0]?.body).toEqual({
      accountId: inter.id,
      amountCents: 25_050,
      paymentDate: today,
    });
    expect(screen.queryByRole('dialog', { name: 'Pagar fatura' })).not.toBeInTheDocument();
  });

  it('data futura vira agendamento (botão "Agendar" e aviso)', async () => {
    mockCard({
      [`GET /api/v1/invoices/${october.id}`]: () => jsonResponse(invoiceDetail(october)),
    });
    renderRoute(`/credit-cards/${card.id}`);
    const panel = await openInvoice(/Ver fatura de outubro de 2026/);
    await userEvent.click(within(panel).getByRole('button', { name: 'Pagar fatura' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pagar fatura' });

    const date = within(dialog).getByLabelText('Data do pagamento');
    await userEvent.clear(date);
    await userEvent.type(date, future(5));

    expect(await within(dialog).findByText(/o pagamento fica agendado/)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Agendar' })).toBeInTheDocument();
  });

  it('mostra o erro da API ao pagar mais que o devido', async () => {
    mockCard({
      [`GET /api/v1/invoices/${october.id}`]: () => jsonResponse(invoiceDetail(october)),
      [`POST /api/v1/invoices/${october.id}/payments`]: () =>
        errorResponse(
          422,
          'BUSINESS_RULE',
          'O valor passa do que resta pagar da fatura (R$ 900,00).',
        ),
    });
    renderRoute(`/credit-cards/${card.id}`);
    const panel = await openInvoice(/Ver fatura de outubro de 2026/);
    await userEvent.click(within(panel).getByRole('button', { name: 'Pagar fatura' }));
    const dialog = await screen.findByRole('dialog', { name: 'Pagar fatura' });
    await userEvent.clear(within(dialog).getByLabelText('Valor'));
    await userEvent.type(within(dialog).getByLabelText('Valor'), '1000');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Pagar' }));

    expect(
      await within(dialog).findByText('O valor passa do que resta pagar da fatura (R$ 900,00).'),
    ).toBeInTheDocument();
  });

  it('fatura quitada não oferece pagamento; crédito aparece como crédito', async () => {
    mockCard({
      [`GET /api/v1/invoices/${october.id}`]: () =>
        jsonResponse(
          invoiceDetail({
            ...october,
            status: 'paid',
            totalCents: 60_000,
            paidCents: 90_000,
            remainingCents: -30_000,
          }),
        ),
    });
    renderRoute(`/credit-cards/${card.id}`);

    const panel = await openInvoice(/Ver fatura de outubro de 2026/);

    expect(within(panel).queryByRole('button', { name: 'Pagar fatura' })).not.toBeInTheDocument();
    expect(within(panel).getByText('Crédito')).toBeInTheDocument();
    expect(within(panel).getByLabelText('Em aberto')).toHaveTextContent(/R\$\s300,00/);
  });

  it('lança uma compra parcelada (o servidor divide as parcelas)', async () => {
    const fetchMock = mockCard({
      [`POST /api/v1/credit-cards/${card.id}/purchases`]: () =>
        jsonResponse(purchase({ creditCardId: card.id }), 201),
    });
    renderRoute(`/credit-cards/${card.id}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Nova compra' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova compra no cartão' });
    await userEvent.type(within(dialog).getByLabelText('Descrição'), 'Notebook');
    await userEvent.type(within(dialog).getByLabelText('Valor total'), '900,00');
    await userEvent.clear(within(dialog).getByLabelText('Parcelas'));
    await userEvent.type(within(dialog).getByLabelText('Parcelas'), '3');
    await userEvent.selectOptions(within(dialog).getByLabelText('Categoria'), food.id);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await screen.findByRole('list', { name: 'Compras do cartão' });
    expect(
      callsTo(fetchMock, 'POST', `/api/v1/credit-cards/${card.id}/purchases`)[0]?.body,
    ).toEqual({
      description: 'Notebook',
      purchaseDate: today,
      totalAmountCents: 90_000,
      installmentsCount: 3,
      categoryId: food.id,
    });
  });

  it('valida descrição, valor, parcelas e data (sem chamar a API)', async () => {
    const fetchMock = mockCard();
    renderRoute(`/credit-cards/${card.id}`);
    await userEvent.click(await screen.findByRole('button', { name: 'Nova compra' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova compra no cartão' });
    await userEvent.clear(within(dialog).getByLabelText('Parcelas'));
    await userEvent.type(within(dialog).getByLabelText('Parcelas'), '60');
    const date = within(dialog).getByLabelText('Data da compra');
    await userEvent.clear(date);
    await userEvent.type(date, future(3));

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialog).findByText('Informe a descrição da compra.')).toBeInTheDocument();
    expect(within(dialog).getByText('Informe o valor.')).toBeInTheDocument();
    expect(within(dialog).getByText('Informe de 1 a 48 parcelas.')).toBeInTheDocument();
    expect(within(dialog).getByText('A data da compra não pode ser futura.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', `/api/v1/credit-cards/${card.id}/purchases`)).toHaveLength(0);
  });

  it('cancelar compra pede confirmação e avisa o efeito (estorno)', async () => {
    const target = purchase({ creditCardId: card.id, description: 'Notebook' });
    const fetchMock = mockCard({
      [`GET /api/v1/credit-cards/${card.id}/purchases`]: () => jsonResponse({ items: [target] }),
      [`POST /api/v1/purchases/${target.id}/cancel`]: () =>
        jsonResponse({ ...target, cancelled: true }),
    });
    renderRoute(`/credit-cards/${card.id}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Cancelar compra Notebook' }));
    const dialog = await screen.findByRole('dialog', { name: 'Cancelar compra' });
    expect(dialog).toHaveTextContent(/saem das faturas, do limite e do orçamento/);
    expect(callsTo(fetchMock, 'POST', `/api/v1/purchases/${target.id}/cancel`)).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar compra' }));

    await screen.findByRole('list', { name: 'Compras do cartão' });
    expect(callsTo(fetchMock, 'POST', `/api/v1/purchases/${target.id}/cancel`)).toHaveLength(1);
  });

  it('cartão arquivado não aceita novas compras; arquivar e reativar chamam a API', async () => {
    const fetchMock = mockCard({
      [`POST /api/v1/credit-cards/${card.id}/archive`]: () =>
        jsonResponse({ ...card, archivedAt: '2026-09-27T12:00:00.000Z' }),
    });
    renderRoute(`/credit-cards/${card.id}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Arquivar' }));

    await screen.findByRole('heading', { name: 'Nubank' });
    expect(callsTo(fetchMock, 'POST', `/api/v1/credit-cards/${card.id}/archive`)).toHaveLength(1);
  });

  it('cartão arquivado desabilita "Nova compra"', async () => {
    mockCard({}, { card: creditCard({ ...card, archivedAt: '2026-09-01T00:00:00.000Z' }) });
    renderRoute(`/credit-cards/${card.id}`);

    expect(await screen.findByRole('button', { name: 'Nova compra' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reativar' })).toBeEnabled();
  });
});
