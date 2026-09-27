import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { investmentSummary, mockLedgerApi } from '../../test/ledger-mocks';
import { jsonResponse, renderRoute } from '../../test/render';

function mockInvestments(items = [investmentSummary()]) {
  return mockLedgerApi({}, { 'GET /api/v1/investments': () => jsonResponse({ items }) });
}

describe('InvestmentsPage', () => {
  it('mostra saldo, aportado e rendimento de cada conta', async () => {
    mockInvestments([
      investmentSummary({
        accountName: 'CDB Banco X',
        institution: 'Banco X',
        product: 'CDB 120% CDI',
        balanceCents: 150_000,
        netContributedCents: 145_000,
        latestValuationDate: '2026-09-20',
        totalYieldCents: 5_000,
        totalYieldPercent: 3.5,
      }),
    ]);
    renderRoute('/investments');

    const list = await screen.findByRole('list', { name: 'Contas de investimento' });
    const item = within(list).getByRole('listitem');
    expect(item).toHaveTextContent('CDB Banco X');
    expect(item).toHaveTextContent('Banco X · CDB 120% CDI');
    expect(item).toHaveTextContent(/R\$\s1\.500,00/);
    expect(item).toHaveTextContent(/R\$\s1\.450,00/);
    expect(item).toHaveTextContent(/\+R\$\s50,00 \(\+3\.5%\)/);
  });

  it('conta sem avaliação mostra "Sem avaliação" em vez de um rendimento', async () => {
    mockInvestments([investmentSummary({ totalYieldCents: null, totalYieldPercent: null })]);
    renderRoute('/investments');

    const list = await screen.findByRole('list', { name: 'Contas de investimento' });
    expect(within(list).getByText('Sem avaliação')).toBeInTheDocument();
  });

  it('sem contas de investimento mostra o estado vazio', async () => {
    mockInvestments([]);
    renderRoute('/investments');

    expect(await screen.findByText('Nenhuma conta de investimento')).toBeInTheDocument();
  });

  it('cada conta linka para a página de detalhe', async () => {
    const investment = investmentSummary({ accountName: 'Tesouro Selic' });
    mockInvestments([investment]);
    renderRoute('/investments');

    const link = await screen.findByRole('link', { name: /Tesouro Selic/ });
    expect(link).toHaveAttribute('href', `/investments/${investment.accountId}`);
  });
});
