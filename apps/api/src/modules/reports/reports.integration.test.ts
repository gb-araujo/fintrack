import {
  budgetHistorySchema,
  cashFlowSchema,
  dashboardSchema,
  expensesByAccountSchema,
  expensesByCardSchema,
  expensesByCategorySchema,
  incomeVsExpensesSchema,
  investmentsReportSchema,
  monthlyEvolutionSchema,
  netWorthSchema,
  type InvoiceSummary,
} from '@fintrack/shared';
import { addDaysToDate, startOfMonth } from '@fintrack/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLedgerTestEnv,
  databaseUrl,
  registerUser,
  type LedgerTestEnv,
  type TestClient,
} from '../../test/ledger-client.js';

describe.skipIf(!databaseUrl)('relatórios (integração)', () => {
  let env: LedgerTestEnv;

  beforeAll(async () => {
    env = await createLedgerTestEnv();
  });
  afterAll(async () => {
    await env.close();
  });

  const currentMonth = (user: TestClient) => user.today().slice(0, 7);
  // Cartão fechamento 28 / vencimento 5: comprado 5 dias antes do início do mês, a parcela única
  // fecha no mês anterior e VENCE no mês corrente (mesmo padrão de credit-cards.integration.test.ts).
  const oldPurchaseDate = (user: TestClient) => addDaysToDate(startOfMonth(user.today()), -5);

  const get = <T>(user: TestClient, path: string, schema: { parse: (v: unknown) => T }) =>
    user.ok(user.get(path)).then((body) => schema.parse(body));
  const byCategory = (user: TestClient, query = '') =>
    get(user, `/reports/expenses-by-category${query}`, expensesByCategorySchema);
  const incomeVsExpenses = (user: TestClient, query = '') =>
    get(user, `/reports/income-vs-expenses${query}`, incomeVsExpensesSchema);
  const evolution = (user: TestClient, query = '') =>
    get(user, `/reports/monthly-evolution${query}`, monthlyEvolutionSchema);
  const byAccount = (user: TestClient, query = '') =>
    get(user, `/reports/expenses-by-account${query}`, expensesByAccountSchema);
  const byCard = (user: TestClient, query = '') =>
    get(user, `/reports/expenses-by-card${query}`, expensesByCardSchema);
  const cashFlow = (user: TestClient, query = '') =>
    get(user, `/reports/cash-flow${query}`, cashFlowSchema);
  const budgetHistory = (user: TestClient, query = '') =>
    get(user, `/reports/budget-history${query}`, budgetHistorySchema);
  const netWorth = (user: TestClient, query = '') =>
    get(user, `/reports/net-worth${query}`, netWorthSchema);
  const investments = (user: TestClient, query = '') =>
    get(user, `/reports/investments${query}`, investmentsReportSchema);
  const dashboard = (user: TestClient) => get(user, '/dashboard', dashboardSchema);

  describe('despesas por categoria', () => {
    it('só despesas efetivadas: transferência, receita, pendente e cancelada ficam fora', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const mp = await user.createAccount({ name: 'Mercado Pago' });
      const food = await user.categoryId('Alimentação', 'expense');
      const salary = await user.categoryId('Salário', 'income');
      await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 20_000,
        categoryId: food,
      });
      await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 7_000,
        categoryId: food,
        status: 'pending',
      });
      await user.addTransaction({
        accountId: inter.id,
        type: 'income',
        amountCents: 999_999,
        categoryId: salary,
      });
      await user.transfer({ fromAccountId: inter.id, toAccountId: mp.id, amountCents: 50_000 });
      const cancelled = await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 33_000,
        categoryId: food,
      });
      await user.ok(user.post(`/transactions/${cancelled.id}/cancel`));

      const report = await byCategory(user);

      expect(report.totalCents).toBe(20_000);
      expect(report.items).toEqual([
        {
          categoryId: food,
          categoryName: 'Alimentação',
          totalCents: 20_000,
          accountCents: 20_000,
          cardCents: 0,
          percent: 100,
        },
      ]);
    });

    it('parcela de cartão soma na categoria da compra, no mês do vencimento da fatura', async () => {
      const user = await registerUser(env.app);
      await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const card = await user.ok<{ id: string }>(
        user.post('/credit-cards', {
          name: 'Nubank',
          limitCents: 500_000,
          closingDay: 28,
          dueDay: 5,
        }),
        201,
      );
      const food = await user.categoryId('Alimentação', 'expense');
      await user.ok(
        user.post(`/credit-cards/${card.id}/purchases`, {
          description: 'Mercado',
          purchaseDate: oldPurchaseDate(user),
          totalAmountCents: 15_000,
          categoryId: food,
        }),
        201,
      );

      const report = await byCategory(user, `?from=${currentMonth(user)}-01&to=${user.today()}`);
      const item = report.items.find((entry) => entry.categoryId === food);

      expect(item).toMatchObject({ totalCents: 15_000, accountCents: 0, cardCents: 15_000 });
    });

    it('sem categoria aparece separado; percentuais somam ~100', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const food = await user.categoryId('Alimentação', 'expense');
      await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 30_000,
        categoryId: food,
      });
      await user.addTransaction({ accountId: inter.id, type: 'expense', amountCents: 10_000 });

      const report = await byCategory(user);

      expect(report.items.find((item) => item.categoryId === null)).toMatchObject({
        categoryName: 'Sem categoria',
        totalCents: 10_000,
        percent: 25,
      });
      expect(report.items.reduce((sum, item) => sum + item.percent, 0)).toBe(100);
    });

    it('padrão é o mês corrente; período customizado e inválido', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const food = await user.categoryId('Alimentação', 'expense');
      await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 5_000,
        categoryId: food,
        transactionDate: user.today(-60),
      });

      const defaultReport = await byCategory(user);
      const older = await byCategory(user, `?from=${user.today(-60)}&to=${user.today(-60)}`);
      const invalid = await user.get(
        `/reports/expenses-by-category?from=${user.today()}&to=${user.today(-5)}`,
      );

      expect(defaultReport.totalCents).toBe(0);
      expect(older.totalCents).toBe(5_000);
      // from > to: rejeitado pela validação da query (antes de chegar ao service).
      expect(invalid.statusCode).toBe(400);
    });
  });

  describe('receitas × despesas', () => {
    it('resgate não é receita; parcela de cartão entra na despesa e é discriminada', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const invest = await user.createAccount({ name: 'CDB', type: 'investment' });
      const salary = await user.categoryId('Salário', 'income');
      await user.addTransaction({
        accountId: inter.id,
        type: 'income',
        amountCents: 500_000,
        categoryId: salary,
      });
      await user.transfer({
        fromAccountId: invest.id,
        toAccountId: inter.id,
        amountCents: 100_000,
      });
      const card = await user.ok<{ id: string }>(
        user.post('/credit-cards', {
          name: 'Nubank',
          limitCents: 500_000,
          closingDay: 28,
          dueDay: 5,
        }),
        201,
      );
      await user.ok(
        user.post(`/credit-cards/${card.id}/purchases`, {
          description: 'X',
          purchaseDate: oldPurchaseDate(user),
          totalAmountCents: 20_000,
        }),
        201,
      );

      const report = await incomeVsExpenses(user);

      expect(report).toMatchObject({
        incomeCents: 500_000,
        expenseCents: 20_000,
        cardExpenseCents: 20_000,
        netCents: 480_000,
      });
      expect(report.savingsPercent).toBe(96);
    });

    it('sem receitas: percentual de economia é null', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      await user.addTransaction({ accountId: inter.id, type: 'expense', amountCents: 10_000 });

      const report = await incomeVsExpenses(user);

      expect(report.savingsPercent).toBeNull();
      expect(report.netCents).toBe(-10_000);
    });
  });

  describe('evolução mensal', () => {
    it('agrega por mês (12 meses por padrão) e ordena do mais antigo ao mais recente', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      await user.addTransaction({
        accountId: inter.id,
        type: 'income',
        amountCents: 100_000,
        transactionDate: user.today(-40),
      });
      await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 30_000,
        transactionDate: user.today(),
      });

      const report = await evolution(user);

      expect(report.items).toHaveLength(12);
      expect(report.items[report.items.length - 1]).toMatchObject({
        month: currentMonth(user),
        incomeCents: 0,
        expenseCents: 30_000,
        netCents: -30_000,
      });
      const months = report.items.map((item) => item.month);
      expect([...months].sort()).toEqual(months);
    });

    it('parâmetro months e until', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      await user.addTransaction({ accountId: inter.id, type: 'income', amountCents: 100_000 });

      const report = await evolution(user, `?months=1&until=${currentMonth(user)}`);

      expect(report.items).toEqual([
        {
          month: currentMonth(user),
          incomeCents: 100_000,
          expenseCents: 0,
          cardExpenseCents: 0,
          netCents: 100_000,
        },
      ]);
    });
  });

  describe('despesas por conta e por cartão', () => {
    it('só despesas em conta (débito/pix); ordenado do maior para o menor', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const mp = await user.createAccount({ name: 'Mercado Pago' });
      await user.addTransaction({ accountId: inter.id, type: 'expense', amountCents: 10_000 });
      await user.addTransaction({ accountId: mp.id, type: 'expense', amountCents: 30_000 });
      await user.transfer({ fromAccountId: inter.id, toAccountId: mp.id, amountCents: 5_000 });

      const report = await byAccount(user);

      expect(report.totalCents).toBe(40_000);
      expect(report.items).toEqual([
        { accountId: mp.id, accountName: 'Mercado Pago', totalCents: 30_000, percent: 75 },
        { accountId: inter.id, accountName: 'Inter', totalCents: 10_000, percent: 25 },
      ]);
    });

    it('por cartão: parcelas reconhecidas (mês do vencimento) e valor comprado (informativo, não soma)', async () => {
      const user = await registerUser(env.app);
      await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const card = await user.ok<{ id: string }>(
        user.post('/credit-cards', {
          name: 'Nubank',
          limitCents: 500_000,
          closingDay: 28,
          dueDay: 5,
        }),
        201,
      );
      await user.ok(
        user.post(`/credit-cards/${card.id}/purchases`, {
          description: 'Notebook',
          purchaseDate: oldPurchaseDate(user),
          totalAmountCents: 90_000,
          installmentsCount: 3,
        }),
        201,
      );

      const report = await byCard(user, `?from=${oldPurchaseDate(user)}&to=${user.today()}`);

      // Compra feita antes do início do mês: só a 1ª parcela cai neste período de compra, mas
      // "comprado" soma o total da compra inteira (informativo).
      expect(report.purchasedCents).toBe(90_000);
      expect(report.installmentsCents).toBe(30_000); // só a 1ª parcela vence neste mês
      expect(report.items).toEqual([
        { cardId: card.id, cardName: 'Nubank', installmentsCents: 30_000, purchasedCents: 90_000 },
      ]);
    });

    it('cartão sem movimento no período não aparece', async () => {
      const user = await registerUser(env.app);
      await user.ok(
        user.post('/credit-cards', {
          name: 'Nubank',
          limitCents: 500_000,
          closingDay: 28,
          dueDay: 5,
        }),
        201,
      );

      const report = await byCard(user);

      expect(report.items).toEqual([]);
    });
  });

  describe('fluxo de caixa', () => {
    it('fechamento = abertura + entradas − saídas; bate com o saldo real das contas líquidas', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const invest = await user.createAccount({ name: 'CDB', type: 'investment' });
      await user.addTransaction({
        accountId: inter.id,
        type: 'income',
        amountCents: 200_000,
        transactionDate: user.today(-3),
      });
      await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 50_000,
        transactionDate: user.today(-2),
      });
      await user.transfer({
        fromAccountId: inter.id,
        toAccountId: invest.id,
        amountCents: 100_000,
        transferDate: user.today(-1),
      });

      const report = await cashFlow(user, `?from=${user.today(-5)}&to=${user.today()}`);

      expect(report).toMatchObject({
        incomeCents: 200_000,
        expensesCents: 50_000,
        transfersOutCents: 100_000,
        transfersInCents: 0,
        cardPaymentsCents: 0,
      });
      expect(report.closingBalanceCents).toBe(report.openingBalanceCents + report.netCents);
      expect(report.closingBalanceCents).toBe(await user.balanceOf(inter.id));
    });

    it('transferência entre duas contas líquidas não entra (efeito zero)', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const mp = await user.createAccount({ name: 'Mercado Pago' });

      await user.transfer({ fromAccountId: inter.id, toAccountId: mp.id, amountCents: 20_000 });
      const report = await cashFlow(user);

      expect(report).toMatchObject({ transfersOutCents: 0, transfersInCents: 0, netCents: 0 });
    });

    it('pagamento de fatura sai do caixa mas não conta como despesa (já contada na parcela)', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const card = await user.ok<{ id: string }>(
        user.post('/credit-cards', {
          name: 'Nubank',
          limitCents: 500_000,
          closingDay: 28,
          dueDay: 5,
        }),
        201,
      );
      const oldDate = user.today(-40);
      await user.ok(
        user.post(`/credit-cards/${card.id}/purchases`, {
          description: 'X',
          purchaseDate: oldDate,
          totalAmountCents: 20_000,
        }),
        201,
      );
      const invoices = await user.ok<{ items: InvoiceSummary[] }>(
        user.get(`/credit-cards/${card.id}/invoices`),
      );
      await user.ok(
        user.post(`/invoices/${invoices.items[0]?.id}/payments`, { accountId: inter.id }),
        201,
      );

      const report = await cashFlow(user);

      expect(report.expensesCents).toBe(0);
      expect(report.cardPaymentsCents).toBe(20_000);
      expect(report.closingBalanceCents).toBe(480_000);
    });
  });

  describe('orçamento ao longo dos meses', () => {
    it('agrega limite e gasto do mês, e conta orçamentos estourados', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const food = await user.categoryId('Alimentação', 'expense');
      const transport = await user.categoryId('Transporte', 'expense');
      const month = currentMonth(user);
      await user.ok(user.put('/budgets', { categoryId: food, month, limitCents: 50_000 }));
      await user.ok(user.put('/budgets', { categoryId: transport, month, limitCents: 20_000 }));
      await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 60_000,
        categoryId: food,
      });
      await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 5_000,
        categoryId: transport,
      });

      const history = await budgetHistory(user, '?months=1');

      expect(history.items).toEqual([
        {
          month,
          budgetsCount: 2,
          limitCents: 70_000,
          spentCents: 65_000,
          remainingCents: 5_000,
          exceededCount: 1,
        },
      ]);
    });

    it('mês sem orçamento algum', async () => {
      const user = await registerUser(env.app);

      const history = await budgetHistory(user, '?months=1');

      expect(history.items).toEqual([
        {
          month: currentMonth(user),
          budgetsCount: 0,
          limitCents: 0,
          spentCents: 0,
          remainingCents: 0,
          exceededCount: 0,
        },
      ]);
    });
  });

  describe('patrimônio', () => {
    it('caixa + investimentos − o que se deve nos cartões, igual ao painel para o mês corrente', async () => {
      const user = await registerUser(env.app);
      await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      await user.createAccount({ name: 'CDB', type: 'investment', initialBalanceCents: 100_000 });
      const card = await user.ok<{ id: string }>(
        user.post('/credit-cards', {
          name: 'Nubank',
          limitCents: 500_000,
          closingDay: 28,
          dueDay: 5,
        }),
        201,
      );
      await user.ok(
        user.post(`/credit-cards/${card.id}/purchases`, {
          description: 'X',
          purchaseDate: user.today(),
          totalAmountCents: 20_000,
        }),
        201,
      );

      const history = await netWorth(user, '?months=1');
      const panel = await dashboard(user);

      expect(history.items).toHaveLength(1);
      expect(history.items[0]).toMatchObject({
        cashCents: 500_000,
        investmentsCents: 100_000,
        cardLiabilitiesCents: 20_000,
        netWorthCents: 580_000,
      });
      expect(history.items[0]?.netWorthCents).toBe(panel.netWorthCents);
      expect(history.items[0]?.cardLiabilitiesCents).toBe(panel.cardLiabilitiesCents);
    });

    it('meses passados refletem o saldo NA ÉPOCA (não o atual)', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      await user.addTransaction({
        accountId: inter.id,
        type: 'income',
        amountCents: 900_000,
        transactionDate: user.today(),
      });

      const history = await netWorth(user, '?months=2');

      expect(history.items[0]?.cashCents).toBe(100_000); // mês anterior: antes da receita
      expect(history.items[1]?.cashCents).toBe(1_000_000); // mês corrente: já com a receita
    });
  });

  describe('investimentos', () => {
    it('saldo, aplicações e resgates; resgate não é receita', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const invest = await user.createAccount({ name: 'CDB', type: 'investment' });
      await user.transfer({
        fromAccountId: inter.id,
        toAccountId: invest.id,
        amountCents: 200_000,
      });
      await user.transfer({ fromAccountId: invest.id, toAccountId: inter.id, amountCents: 50_000 });

      const report = await investments(user);

      expect(report).toMatchObject({
        totalBalanceCents: 150_000,
        appliedCents: 200_000,
        redeemedCents: 50_000,
        yieldCents: null, // nenhuma conta tem avaliação registrada ainda
      });
      expect(report.items).toEqual([
        {
          accountId: invest.id,
          accountName: 'CDB',
          balanceCents: 150_000,
          appliedCents: 200_000,
          redeemedCents: 50_000,
          netContributedCents: 150_000,
          yieldCents: null,
        },
      ]);
      const income = await incomeVsExpenses(user);
      expect(income.incomeCents).toBe(0);
    });

    it('sem conta de investimento: relatório vazio', async () => {
      const user = await registerUser(env.app);
      await user.createAccount({ name: 'Inter' });

      const report = await investments(user);

      expect(report).toMatchObject({
        totalBalanceCents: 0,
        appliedCents: 0,
        redeemedCents: 0,
        items: [],
      });
    });
  });

  describe('isolamento entre usuários e autenticação', () => {
    it('cada relatório só vê dados do próprio usuário', async () => {
      const owner = await registerUser(env.app);
      const intruder = await registerUser(env.app);
      const inter = await owner.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const food = await owner.categoryId('Alimentação', 'expense');
      await owner.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 10_000,
        categoryId: food,
      });

      const [category, income, evo, account, card, flow, budgets, worth, invest] =
        await Promise.all([
          byCategory(intruder),
          incomeVsExpenses(intruder),
          evolution(intruder),
          byAccount(intruder),
          byCard(intruder),
          cashFlow(intruder),
          budgetHistory(intruder, '?months=1'),
          netWorth(intruder, '?months=1'),
          investments(intruder),
        ]);

      expect(category.totalCents).toBe(0);
      expect(income.incomeCents).toBe(0);
      expect(evo.items.every((item) => item.expenseCents === 0)).toBe(true);
      expect(account.items).toEqual([]);
      expect(card.items).toEqual([]);
      expect(flow.openingBalanceCents).toBe(0);
      expect(budgets.items[0]).toMatchObject({ limitCents: 0 });
      expect(worth.items[0]).toMatchObject({ cashCents: 0 });
      expect(invest.items).toEqual([]);
    });

    it('exige autenticação', async () => {
      const response = await env.app.inject({
        method: 'GET',
        url: '/api/v1/reports/expenses-by-category',
      });

      expect(response.statusCode).toBe(401);
    });
  });
});
