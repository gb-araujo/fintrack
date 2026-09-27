import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  callsTo,
  investmentSummary,
  investmentValuation,
  mockLedgerApi,
} from '../../test/ledger-mocks';
import { errorResponse, jsonResponse, renderRoute } from '../../test/render';

const investment = investmentSummary({
  accountName: 'CDB Banco X',
  balanceCents: 150_000,
  netContributedCents: 145_000,
  totalYieldCents: 5_000,
  totalYieldPercent: 3.5,
});

function mockDetail(
  valuations = [investmentValuation({ accountId: investment.accountId })],
  extra: Parameters<typeof mockLedgerApi>[1] = {},
) {
  return mockLedgerApi(
    {},
    {
      'GET /api/v1/investments': () => jsonResponse({ items: [investment] }),
      [`GET /api/v1/investments/${investment.accountId}/valuations`]: () =>
        jsonResponse({ items: valuations }),
      ...extra,
    },
  );
}

describe('InvestmentDetailPage', () => {
  it('mostra o resumo e o histórico de avaliações (mais recente primeiro)', async () => {
    const older = investmentValuation({
      accountId: investment.accountId,
      date: '2026-08-01',
      balanceCents: 100_000,
      yieldCents: null,
      contributedCents: 100_000,
    });
    const recent = investmentValuation({
      accountId: investment.accountId,
      date: '2026-09-20',
      balanceCents: 150_000,
      yieldCents: 5_000,
      yieldPercent: 5,
      contributedCents: 45_000,
    });
    mockDetail([older, recent]);
    renderRoute(`/investments/${investment.accountId}`);

    expect(await screen.findByRole('heading', { name: 'CDB Banco X' })).toBeInTheDocument();
    expect(screen.getByText(/R\$\s1\.500,00/)).toBeInTheDocument();
    expect(screen.getByText(/\+R\$\s50,00/)).toBeInTheDocument();

    const list = await screen.findByRole('list', { name: 'Avaliações' });
    const [first, second] = within(list).getAllByRole('listitem') as [HTMLElement, HTMLElement];
    expect(first).toHaveTextContent('20/09/2026');
    expect(second).toHaveTextContent('01/08/2026');
    expect(within(second).getByText('1ª avaliação')).toBeInTheDocument();
  });

  it('registra uma nova avaliação', async () => {
    const fetchMock = mockDetail([], {
      [`PUT /api/v1/investments/${investment.accountId}/valuations`]: () =>
        jsonResponse(
          investmentValuation({
            accountId: investment.accountId,
            date: '2026-09-27',
            balanceCents: 200_000,
          }),
        ),
    });
    renderRoute(`/investments/${investment.accountId}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Registrar avaliação' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar avaliação' });
    await userEvent.type(within(dialog).getByLabelText('Valor total da posição'), '2000,00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const call = callsTo(
      fetchMock,
      'PUT',
      `/api/v1/investments/${investment.accountId}/valuations`,
    )[0];
    expect(call?.body).toMatchObject({ balanceCents: 200_000 });
  });

  it('corrigir preenche o formulário com os dados da avaliação existente', async () => {
    const valuation = investmentValuation({
      accountId: investment.accountId,
      date: '2026-09-20',
      balanceCents: 150_000,
      note: 'Extrato da corretora',
    });
    mockDetail([valuation], {
      [`PUT /api/v1/investments/${investment.accountId}/valuations`]: () => jsonResponse(valuation),
    });
    renderRoute(`/investments/${investment.accountId}`);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Corrigir avaliação de 20/09/2026' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Registrar avaliação' });
    expect(within(dialog).getByLabelText('Data')).toHaveValue('2026-09-20');
    expect(within(dialog).getByLabelText('Valor total da posição')).toHaveValue('1.500,00');
    expect(within(dialog).getByLabelText('Observação (opcional)')).toHaveValue(
      'Extrato da corretora',
    );
  });

  it('remove uma avaliação com confirmação', async () => {
    const valuation = investmentValuation({ accountId: investment.accountId, date: '2026-09-20' });
    let current = [valuation];
    const fetchMock = mockLedgerApi(
      {},
      {
        'GET /api/v1/investments': () => jsonResponse({ items: [investment] }),
        [`GET /api/v1/investments/${investment.accountId}/valuations`]: () =>
          jsonResponse({ items: current }),
        [`DELETE /api/v1/investments/${investment.accountId}/valuations/${valuation.id}`]: () => {
          current = [];
          return new Response(null, { status: 204 });
        },
      },
    );
    renderRoute(`/investments/${investment.accountId}`);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Remover avaliação de 20/09/2026' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Remover avaliação' });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));

    await screen.findByText('Nenhuma avaliação ainda');
    expect(
      callsTo(
        fetchMock,
        'DELETE',
        `/api/v1/investments/${investment.accountId}/valuations/${valuation.id}`,
      ),
    ).toHaveLength(1);
  });

  it('edita instituição e produto', async () => {
    const fetchMock = mockDetail([], {
      [`PATCH /api/v1/investments/${investment.accountId}`]: () =>
        jsonResponse({ ...investment, institution: 'Banco X', product: 'CDB 120% CDI' }),
    });
    renderRoute(`/investments/${investment.accountId}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Instituição / produto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Instituição e produto' });
    await userEvent.type(within(dialog).getByLabelText('Instituição (opcional)'), 'Banco X');
    await userEvent.type(within(dialog).getByLabelText('Produto (opcional)'), 'CDB 120% CDI');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await screen.findByRole('heading', { name: 'CDB Banco X' });
    expect(
      callsTo(fetchMock, 'PATCH', `/api/v1/investments/${investment.accountId}`)[0]?.body,
    ).toEqual({ institution: 'Banco X', product: 'CDB 120% CDI' });
  });

  it('erro da API ao registrar avaliação aparece no formulário', async () => {
    mockDetail([], {
      [`PUT /api/v1/investments/${investment.accountId}/valuations`]: () =>
        errorResponse(422, 'BUSINESS_RULE_VIOLATION', 'A conta está arquivada.'),
    });
    renderRoute(`/investments/${investment.accountId}`);

    await userEvent.click(await screen.findByRole('button', { name: 'Registrar avaliação' }));
    const dialog = await screen.findByRole('dialog', { name: 'Registrar avaliação' });
    await userEvent.type(within(dialog).getByLabelText('Valor total da posição'), '100,00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialog).findByText('A conta está arquivada.')).toBeInTheDocument();
  });
});
