import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { account, lastQuery, mockLedgerApi } from '../test/ledger-mocks';
import { emptyDashboard, errorResponse, jsonResponse, renderRoute } from '../test/render';

const inter = account({ name: 'Banco Inter' });
const recurringId = crypto.randomUUID();

const dashboard = {
  ...emptyDashboard,
  availableToSpend: {
    amountCents: 130_000,
    components: {
      liquidBalanceCents: 250_000,
      pendingIncomeCents: 20_000,
      forecastIncomeCents: 30_000,
      pendingExpensesCents: 120_000,
      forecastExpensesCents: 30_000,
      invoicesCents: 0,
      pendingTransfersInCents: 5_000,
      pendingTransfersOutCents: 25_000,
    },
  },
  totalBalanceCents: 250_000,
  investmentsCents: 50_000,
  netWorthCents: 300_000,
  cardLiabilitiesCents: 0,
  month: {
    from: '2026-09-01',
    to: '2026-09-30',
    incomeCents: 590_000,
    expenseCents: 199_999,
    cardExpenseCents: 0,
  },
  pendingBills: {
    count: 2,
    totalCents: 27_834,
    overdueCount: 1,
    overdueCents: 9_099,
    next: [
      {
        id: crypto.randomUUID(),
        kind: 'transaction',
        recurringId: null,
        invoiceId: null,
        estimated: false,
        description: 'Vivo Fibra',
        amountCents: 9_099,
        date: '2026-09-25',
        accountId: inter.id,
        categoryId: null,
        overdue: true,
      },
      {
        id: `${recurringId}|2026-09-29`,
        kind: 'recurring',
        recurringId,
        invoiceId: null,
        estimated: true,
        description: 'Enel',
        amountCents: 18_735,
        date: '2026-09-29',
        accountId: inter.id,
        categoryId: null,
        overdue: false,
      },
    ],
  },
  futureCommitments: { count: 3, totalCents: 41_000 },
};

describe('Dashboard — "Quanto posso gastar?"', () => {
  it('mostra o valor calculado pelo backend, sem recalcular nada', async () => {
    mockLedgerApi(
      { accounts: [inter] },
      { 'GET /api/v1/dashboard': () => jsonResponse(dashboard) },
    );
    renderRoute('/');

    const amount = await screen.findByLabelText('Dinheiro disponível');

    expect(amount).toHaveTextContent(/R\$\s1\.300,00/);
    expect(
      screen.getByText(/Já descontando o que está previsto até 30\/09\/2026/),
    ).toBeInTheDocument();
  });

  it('exibe todos os componentes do cálculo, com sinais', async () => {
    mockLedgerApi(
      { accounts: [inter] },
      { 'GET /api/v1/dashboard': () => jsonResponse(dashboard) },
    );
    renderRoute('/');
    await screen.findByLabelText('Dinheiro disponível');

    const list = screen.getByLabelText('Componentes do cálculo');
    // Sem espaços (inclusive o NBSP da moeda): compara sinal + rótulo + valor.
    const lines = within(list)
      .getAllByRole('listitem')
      .map((li) => li.textContent?.replace(/\s/g, ''));

    expect(lines).toEqual([
      '+SaldodascontasdisponíveisR$2.500,00',
      '+ReceitaspendentesR$200,00',
      '+Receitasprevistas(recorrências)R$300,00',
      '+Entradasagendadas(resgates)R$50,00',
      '−DespesaspendentesR$1.200,00',
      '−Despesasprevistas(recorrências)R$300,00',
      '−FaturasdecartãoapagarR$0,00',
      '−Saídasagendadas(aplicações)R$250,00',
      '=DisponívelR$1.300,00',
    ]);
  });

  it('mostra saldos, receitas/despesas do mês, pendências e compromissos futuros', async () => {
    mockLedgerApi(
      { accounts: [inter] },
      { 'GET /api/v1/dashboard': () => jsonResponse(dashboard) },
    );
    renderRoute('/');
    await screen.findByLabelText('Dinheiro disponível');

    expect(screen.getByLabelText('Saldo total')).toHaveTextContent(/R\$\s2\.500,00/);
    expect(screen.getByLabelText('Investimentos')).toHaveTextContent(/R\$\s500,00/);
    expect(screen.getByLabelText('Receitas do mês')).toHaveTextContent(/R\$\s5\.900,00/);
    expect(screen.getByLabelText('Despesas do mês')).toHaveTextContent(/R\$\s1\.999,99/);
    expect(screen.getByLabelText('Total de contas pendentes')).toHaveTextContent(/R\$\s278,34/);
    expect(screen.getByText(/1 vencida\(s\)/)).toBeInTheDocument();
    expect(screen.getByLabelText('Compromissos futuros')).toHaveTextContent(/R\$\s410,00/);

    const bills = screen.getByRole('list', { name: 'Próximas contas a pagar' });
    const [first, second] = within(bills).getAllByRole('listitem') as [HTMLElement, HTMLElement];
    expect(first).toHaveTextContent('Vivo Fibra');
    expect(within(first).getByText('Vencida')).toBeInTheDocument();
    expect(second).toHaveTextContent('Enel');
    expect(within(second).queryByText('Vencida')).not.toBeInTheDocument();
    // Ocorrência de recorrência (previsão): identificada e marcada como estimativa.
    expect(within(second).getByText('Recorrente · estimado')).toBeInTheDocument();
    expect(within(first).queryByText(/Recorrente/)).not.toBeInTheDocument();
    expect(within(second).getByText(/Banco Inter/)).toBeInTheDocument();
  });

  it('fatura de cartão aparece nas contas a pagar e reduz o disponível pelo valor em aberto', async () => {
    const invoiceId = crypto.randomUUID();
    const withInvoice = {
      ...dashboard,
      availableToSpend: {
        amountCents: 110_000,
        components: { ...dashboard.availableToSpend.components, invoicesCents: 20_000 },
      },
      cardLiabilitiesCents: 62_000,
      month: { ...dashboard.month, expenseCents: 219_999, cardExpenseCents: 20_000 },
      pendingBills: {
        ...dashboard.pendingBills,
        next: [
          {
            id: `invoice:${invoiceId}`,
            kind: 'invoice',
            recurringId: null,
            invoiceId,
            description: 'Fatura Nubank 09/2026',
            amountCents: 20_000,
            estimated: false,
            date: '2026-09-28',
            accountId: null,
            categoryId: null,
            overdue: false,
          },
        ],
      },
    };
    mockLedgerApi(
      { accounts: [inter] },
      { 'GET /api/v1/dashboard': () => jsonResponse(withInvoice) },
    );
    renderRoute('/');
    await screen.findByLabelText('Dinheiro disponível');

    const list = screen.getByLabelText('Componentes do cálculo');
    expect(
      within(list)
        .getByText(/Faturas de cartão a pagar/)
        .closest('li'),
    ).toHaveTextContent(/R\$\s200,00/);
    const bills = screen.getByRole('list', { name: 'Próximas contas a pagar' });
    expect(within(bills).getByText('Fatura')).toBeInTheDocument();
    expect(within(bills).getByText(/Fatura Nubank 09\/2026/)).toBeInTheDocument();
    expect(screen.getByLabelText('Cartões em aberto')).toHaveTextContent(/R\$\s620,00/);
    expect(screen.getByLabelText('Despesas do mês')).toHaveTextContent(/R\$\s2\.199,99/);
    expect(screen.getByText(/Inclui R\$\s200,00 em parcelas de cartão/)).toBeInTheDocument();
  });

  it('avisa quando o disponível fica negativo', async () => {
    const negative = {
      ...dashboard,
      availableToSpend: { ...dashboard.availableToSpend, amountCents: -15_000 },
    };
    mockLedgerApi({ accounts: [inter] }, { 'GET /api/v1/dashboard': () => jsonResponse(negative) });
    renderRoute('/');

    const amount = await screen.findByLabelText('Dinheiro disponível');

    expect(amount).toHaveTextContent(/-R\$\s150,00/);
    expect(amount.className).toContain('text-rose-600');
    expect(
      screen.getByText(/compromissos até essa data passam do que você tem/),
    ).toBeInTheDocument();
  });

  it('padrão de 30 dias; trocar o horizonte consulta o backend com ?until=', async () => {
    const fetchMock = mockLedgerApi(
      { accounts: [inter] },
      { 'GET /api/v1/dashboard': () => jsonResponse(dashboard) },
    );
    renderRoute('/');
    const date = await screen.findByLabelText('Considerar até');
    expect(date).toHaveValue('2026-09-30');
    expect(lastQuery(fetchMock, '/api/v1/dashboard').get('days')).toBe('30');
    expect(lastQuery(fetchMock, '/api/v1/dashboard').has('until')).toBe(false);
    expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute('aria-pressed', 'true');

    // Campo de data: o navegador entrega o valor completo de uma vez.
    fireEvent.change(date, { target: { value: '2026-12-31' } });

    await waitFor(() =>
      expect(lastQuery(fetchMock, '/api/v1/dashboard').get('until')).toBe('2026-12-31'),
    );
    expect(lastQuery(fetchMock, '/api/v1/dashboard').has('days')).toBe(false);
    expect(screen.getByRole('button', { name: '30 dias' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
  });

  it('atalhos de período: fim do mês (padrão do backend) e 60 dias', async () => {
    const fetchMock = mockLedgerApi(
      { accounts: [inter] },
      { 'GET /api/v1/dashboard': () => jsonResponse(dashboard) },
    );
    renderRoute('/');
    await screen.findByLabelText('Considerar até');

    fireEvent.click(screen.getByRole('button', { name: 'Fim do mês' }));
    await waitFor(() => {
      const query = lastQuery(fetchMock, '/api/v1/dashboard');
      expect(query.has('days') || query.has('until')).toBe(false);
    });

    fireEvent.click(screen.getByRole('button', { name: '60 dias' }));
    await waitFor(() => expect(lastQuery(fetchMock, '/api/v1/dashboard').get('days')).toBe('60'));
  });

  it('erro do backend mostra alerta com nova tentativa', async () => {
    mockLedgerApi(
      { accounts: [inter] },
      {
        'GET /api/v1/dashboard': () =>
          errorResponse(500, 'INTERNAL_ERROR', 'Erro interno do servidor.'),
      },
    );
    renderRoute('/');

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro interno do servidor.');
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});

describe('Dashboard — plano: gastar, guardar, pagar e receber', () => {
  const invoiceId = crypto.randomUUID();
  const entry = {
    estimated: false,
    overdue: false,
    accountId: inter.id,
    recurringId: null,
    invoiceId: null,
  };
  const plan = {
    ...emptyDashboard,
    until: '2026-10-27',
    investmentsCents: 125_495,
    availableToSpend: {
      amountCents: 57_619,
      components: { ...emptyDashboard.availableToSpend.components, liquidBalanceCents: 50_000 },
    },
    cashflow: {
      entries: [
        {
          ...entry,
          id: crypto.randomUUID(),
          kind: 'transaction',
          direction: 'out',
          description: 'Conta atrasada',
          amountCents: 10_000,
          date: '2026-09-25',
          overdue: true,
          balanceAfterCents: 40_000,
        },
        {
          ...entry,
          id: `recurring:${recurringId}:2026-10-08`,
          kind: 'recurring',
          direction: 'out',
          description: 'Enel',
          amountCents: 37_900,
          estimated: true,
          recurringId,
          date: '2026-10-08',
          balanceAfterCents: 2_100,
        },
        {
          ...entry,
          id: `invoice:${invoiceId}`,
          kind: 'invoice',
          direction: 'out',
          description: 'Fatura Cartão Inter 10/2026',
          amountCents: 244_481,
          invoiceId,
          date: '2026-10-10',
          balanceAfterCents: -242_381,
        },
        {
          ...entry,
          id: `recurring:${recurringId}:2026-10-20`,
          kind: 'recurring',
          direction: 'in',
          description: 'Salário',
          amountCents: 300_000,
          recurringId,
          date: '2026-10-20',
          balanceAfterCents: 57_619,
        },
      ],
      inCents: 300_000,
      outCents: 292_381,
      lowestBalanceCents: -242_381,
      lowestBalanceDate: '2026-10-10',
      safeToSpendNowCents: 0,
    },
  };

  it('mostra quanto dá para gastar hoje, quanto guardar e quanto vai entrar', async () => {
    mockLedgerApi({ accounts: [inter] }, { 'GET /api/v1/dashboard': () => jsonResponse(plan) });
    renderRoute('/');

    expect(await screen.findByLabelText('Pode gastar hoje')).toHaveTextContent(/R\$\s0,00/);
    expect(screen.getByLabelText('Precisa guardar')).toHaveTextContent(/R\$\s2\.923,81/);
    expect(screen.getByLabelText('Vai entrar')).toHaveTextContent(/R\$\s3\.000,00/);
    expect(screen.getByText('Seu plano até 27/10/2026')).toBeInTheDocument();
    expect(screen.getByLabelText('Resumo do período').textContent?.replace(/\s/g, '')).toBe(
      'SaldohojeR$500,00+entraR$3.000,00−saiR$2.923,81=sobraR$576,19em27/10',
    );
  });

  it('avisa quando vai faltar dinheiro antes de a receita entrar', async () => {
    mockLedgerApi({ accounts: [inter] }, { 'GET /api/v1/dashboard': () => jsonResponse(plan) });
    renderRoute('/');

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(/Vai faltar R\$\s2\.423,81 até 10\/10\/2026/);
    expect(alert).toHaveTextContent('Fatura Cartão Inter 10/2026');
    expect(alert).toHaveTextContent(/R\$\s1\.254,95 guardados em investimentos/);
  });

  it('lista as contas em ordem, dizendo se o saldo cobre cada uma', async () => {
    mockLedgerApi({ accounts: [inter] }, { 'GET /api/v1/dashboard': () => jsonResponse(plan) });
    renderRoute('/');

    const bills = await screen.findByRole('list', { name: 'Contas a pagar' });
    const [late, enel, invoice] = within(bills).getAllByRole('listitem') as [
      HTMLElement,
      HTMLElement,
      HTMLElement,
    ];
    expect(late).toHaveTextContent('Conta atrasada');
    expect(within(late).getByText('Vencida')).toBeInTheDocument();
    expect(within(late).getByText('Coberta')).toBeInTheDocument();
    expect(enel).toHaveTextContent('08/10');
    expect(within(enel).getByText('Recorrente · estimado')).toBeInTheDocument();
    expect(within(enel).getByText('Coberta')).toBeInTheDocument();
    expect(within(invoice).getByText('Fatura')).toBeInTheDocument();
    expect(within(invoice).getByText(/Falta R\$\s2\.423,81/)).toBeInTheDocument();

    const income = screen.getByRole('list', { name: 'Dinheiro que vai entrar' });
    const [salary] = within(income).getAllByRole('listitem') as [HTMLElement];
    expect(salary).toHaveTextContent('Salário');
    expect(salary).toHaveTextContent('20/10');
    expect(salary).toHaveTextContent(/\+R\$\s3\.000,00/);
  });

  it('sem contas nem entradas: todo o saldo livre e convite para cadastrar recebimentos', async () => {
    const calm = {
      ...emptyDashboard,
      availableToSpend: {
        amountCents: 80_000,
        components: { ...emptyDashboard.availableToSpend.components, liquidBalanceCents: 80_000 },
      },
      cashflow: {
        ...emptyDashboard.cashflow,
        lowestBalanceCents: 80_000,
        safeToSpendNowCents: 80_000,
      },
    };
    mockLedgerApi({ accounts: [inter] }, { 'GET /api/v1/dashboard': () => jsonResponse(calm) });
    renderRoute('/');

    expect(await screen.findByLabelText('Pode gastar hoje')).toHaveTextContent(/R\$\s800,00/);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('Nenhuma conta a pagar no período.')).toBeInTheDocument();
    expect(screen.getByText(/Nenhuma entrada prevista no período/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Cadastrar recebimento' })).toHaveAttribute(
      'href',
      '/recurring',
    );
  });
});
