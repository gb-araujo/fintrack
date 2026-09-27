import { todayInTimeZone } from '@fintrack/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { lastQuery } from '../../test/ledger-mocks';
import { jsonResponse, mockAuthenticatedApi, renderRoute } from '../../test/render';

const today = todayInTimeZone('America/Sao_Paulo');
const month = today.slice(0, 7);
const ids = {
  category: crypto.randomUUID(),
  account: crypto.randomUUID(),
  card: crypto.randomUUID(),
  investment: crypto.randomUUID(),
};

function mockReports(extra: Parameters<typeof mockAuthenticatedApi>[0] = {}) {
  return mockAuthenticatedApi({
    'GET /api/v1/reports/expenses-by-category': () =>
      jsonResponse({
        period: { from: `${month}-01`, to: today },
        totalCents: 40_000,
        items: [
          {
            categoryId: ids.category,
            categoryName: 'Alimentação',
            totalCents: 30_000,
            accountCents: 30_000,
            cardCents: 0,
            percent: 75,
          },
          {
            categoryId: null,
            categoryName: 'Sem categoria',
            totalCents: 10_000,
            accountCents: 10_000,
            cardCents: 0,
            percent: 25,
          },
        ],
      }),
    'GET /api/v1/reports/income-vs-expenses': () =>
      jsonResponse({
        period: { from: `${month}-01`, to: today },
        incomeCents: 500_000,
        expenseCents: 200_000,
        cardExpenseCents: 30_000,
        netCents: 300_000,
        savingsPercent: 60,
      }),
    'GET /api/v1/reports/monthly-evolution': () =>
      jsonResponse({
        items: [
          {
            month: '2026-08',
            incomeCents: 400_000,
            expenseCents: 150_000,
            cardExpenseCents: 0,
            netCents: 250_000,
          },
          {
            month: '2026-09',
            incomeCents: 500_000,
            expenseCents: 200_000,
            cardExpenseCents: 30_000,
            netCents: 300_000,
          },
        ],
      }),
    'GET /api/v1/reports/expenses-by-account': () =>
      jsonResponse({
        period: { from: `${month}-01`, to: today },
        totalCents: 40_000,
        items: [
          { accountId: ids.account, accountName: 'Banco Inter', totalCents: 40_000, percent: 100 },
        ],
      }),
    'GET /api/v1/reports/expenses-by-card': () =>
      jsonResponse({
        period: { from: `${month}-01`, to: today },
        installmentsCents: 30_000,
        purchasedCents: 90_000,
        items: [
          {
            cardId: ids.card,
            cardName: 'Nubank',
            installmentsCents: 30_000,
            purchasedCents: 90_000,
          },
        ],
      }),
    'GET /api/v1/reports/cash-flow': () =>
      jsonResponse({
        period: { from: `${month}-01`, to: today },
        openingBalanceCents: 100_000,
        closingBalanceCents: 250_000,
        incomeCents: 200_000,
        expensesCents: 50_000,
        cardPaymentsCents: 0,
        transfersOutCents: 0,
        transfersInCents: 0,
        netCents: 150_000,
      }),
    'GET /api/v1/reports/budget-history': () =>
      jsonResponse({
        items: [
          {
            month,
            budgetsCount: 2,
            limitCents: 70_000,
            spentCents: 80_000,
            remainingCents: -10_000,
            exceededCount: 1,
          },
        ],
      }),
    'GET /api/v1/reports/net-worth': () =>
      jsonResponse({
        items: [
          {
            date: today,
            cashCents: 500_000,
            investmentsCents: 100_000,
            cardLiabilitiesCents: 20_000,
            netWorthCents: 580_000,
          },
        ],
      }),
    'GET /api/v1/reports/investments': () =>
      jsonResponse({
        period: { from: `${month}-01`, to: today },
        totalBalanceCents: 150_000,
        appliedCents: 200_000,
        redeemedCents: 50_000,
        yieldCents: 5_000,
        items: [
          {
            accountId: ids.investment,
            accountName: 'CDB',
            balanceCents: 150_000,
            appliedCents: 200_000,
            redeemedCents: 50_000,
            netContributedCents: 150_000,
            yieldCents: 5_000,
          },
        ],
      }),
    ...extra,
  });
}

async function openTab(name: string) {
  await userEvent.click(await screen.findByRole('tab', { name }));
}

describe('ReportsPage', () => {
  it('mostra a aba de despesas por categoria por padrão, com total e barras', async () => {
    mockReports();
    renderRoute('/reports');

    expect(
      await screen.findByRole('tab', { name: 'Despesas por categoria', selected: true }),
    ).toBeInTheDocument();
    const list = await screen.findByRole('list', { name: 'Despesas por categoria' });
    expect(within(list).getByText('Alimentação')).toBeInTheDocument();
    expect(within(list).getByText(/R\$\s300,00/)).toBeInTheDocument();
    expect(within(list).getByRole('progressbar', { name: 'Alimentação' })).toHaveAttribute(
      'aria-valuenow',
      '75',
    );
    expect(screen.getByText('Total:').closest('p')).toHaveTextContent(/Total:\s*R\$\s400,00/);
  });

  it('trocar o período consulta a API com ?from=&to=', async () => {
    const fetchMock = mockReports();
    renderRoute('/reports');
    await screen.findByRole('list', { name: 'Despesas por categoria' });

    const from = screen.getByLabelText('De');
    await userEvent.clear(from);
    await userEvent.type(from, '2026-01-01');

    await screen.findByRole('list', { name: 'Despesas por categoria' });
    expect(lastQuery(fetchMock, '/api/v1/reports/expenses-by-category').get('from')).toBe(
      '2026-01-01',
    );
  });

  it('receitas × despesas: cartões com o resultado e o percentual de economia', async () => {
    mockReports();
    renderRoute('/reports');
    await openTab('Receitas × despesas');

    expect(await screen.findByLabelText('Receitas')).toHaveTextContent(/R\$\s5\.000,00/);
    expect(screen.getByLabelText('Despesas')).toHaveTextContent(/R\$\s2\.000,00/);
    expect(screen.getByText(/Inclui R\$\s300,00 em parcelas de cartão/)).toBeInTheDocument();
    expect(screen.getByLabelText('Resultado')).toHaveTextContent(/\+R\$\s3\.000,00/);
    expect(screen.getByText('60% das receitas')).toBeInTheDocument();
  });

  it('evolução mensal: gráfico com legenda e tabela equivalente', async () => {
    mockReports();
    renderRoute('/reports');
    await openTab('Evolução mensal');

    expect(
      await screen.findByRole('img', { name: /Evolução de Receitas e Despesas/ }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Legenda')).toHaveTextContent(/Receitas.*Despesas/);
    await userEvent.click(screen.getByText('Ver tabela'));
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent(
      /agosto de 2026.*R\$\s4\.000,00.*R\$\s1\.500,00.*R\$\s2\.500,00/,
    );
    expect(rows[2]).toHaveTextContent(
      /setembro de 2026.*R\$\s5\.000,00.*R\$\s2\.000,00.*R\$\s3\.000,00/,
    );
  });

  it('despesas por conta', async () => {
    mockReports();
    renderRoute('/reports');
    await openTab('Despesas por conta');

    const list = await screen.findByRole('list', { name: 'Despesas por conta' });
    expect(within(list).getByText('Banco Inter')).toBeInTheDocument();
    expect(within(list).getByText(/R\$\s400,00/)).toBeInTheDocument();
  });

  it('gastos por cartão: parcela reconhecida e valor comprado (informativo)', async () => {
    mockReports();
    renderRoute('/reports');
    await openTab('Gastos por cartão');

    expect(await screen.findByText('Nubank')).toBeInTheDocument();
    expect(screen.getByText('Parcelas no período').nextSibling).toHaveTextContent(/R\$\s300,00/);
    expect(screen.getByText('Comprado no período (informativo)').nextSibling).toHaveTextContent(
      /R\$\s900,00/,
    );
  });

  it('fluxo de caixa: abertura + entradas − saídas = fechamento, tudo explícito', async () => {
    mockReports();
    renderRoute('/reports');
    await openTab('Fluxo de caixa');

    const list = await screen.findByRole('list', { name: 'Composição do fluxo de caixa' });
    const items = within(list).getAllByRole('listitem');
    expect(items[0]).toHaveTextContent(/Saldo das contas disponíveis no início.*R\$\s1\.000,00/);
    expect(items[items.length - 1]).toHaveTextContent(
      /Saldo das contas disponíveis no fim.*R\$\s2\.500,00/,
    );
  });

  it('orçamento: mês estourado com contagem; badge muda de cor', async () => {
    mockReports();
    renderRoute('/reports');
    await openTab('Orçamento');

    expect(await screen.findByText('1 estourado(s)')).toBeInTheDocument();
    const table = screen.getByRole('table');
    expect(within(table).getByText(/-R\$\s100,00/)).toBeInTheDocument();
  });

  it('patrimônio: gráfico e tabela com caixa, investimentos e cartões', async () => {
    mockReports();
    renderRoute('/reports');
    await openTab('Patrimônio');

    expect(await screen.findByRole('img', { name: /Evolução de Patrimônio/ })).toBeInTheDocument();
    await userEvent.click(screen.getByText('Ver tabela'));
    const table = screen.getByRole('table');
    expect(within(table).getByText(/R\$\s5\.800,00/)).toBeInTheDocument();
  });

  it('investimentos: totais, contas e rendimento derivado das avaliações', async () => {
    mockReports();
    renderRoute('/reports');
    await openTab('Investimentos');

    expect(await screen.findByLabelText('Saldo em investimentos')).toHaveTextContent(
      /R\$\s1\.500,00/,
    );
    expect(screen.getByText('Resgatado no período').closest('section')).toHaveTextContent(
      'Resgate não é receita',
    );
    expect(screen.getByLabelText('Rendimento no período')).toHaveTextContent(/\+R\$\s50,00/);
    expect(screen.getByText('CDB')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /gerencie as avaliações em Investimentos/ }),
    ).toHaveAttribute('href', '/investments');
  });

  it('mostra o estado de carregamento e depois o conteúdo', async () => {
    mockReports();
    renderRoute('/reports');

    expect(await screen.findByRole('list', { name: 'Despesas por categoria' })).toBeInTheDocument();
  });
});
