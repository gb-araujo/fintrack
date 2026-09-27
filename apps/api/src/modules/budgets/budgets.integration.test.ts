import { budgetListResponseSchema, type Budget, type BudgetList } from '@fintrack/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLedgerTestEnv,
  databaseUrl,
  registerUser,
  type LedgerTestEnv,
  type TestClient,
} from '../../test/ledger-client.js';

describe.skipIf(!databaseUrl)('orçamentos (integração)', () => {
  let env: LedgerTestEnv;

  beforeAll(async () => {
    env = await createLedgerTestEnv();
  });
  afterAll(async () => {
    await env.close();
  });

  async function list(user: TestClient, month?: string): Promise<BudgetList> {
    const body = await user.ok(user.get(`/budgets${month ? `?month=${month}` : ''}`));
    return budgetListResponseSchema.parse(body);
  }

  const currentMonth = (user: TestClient) => user.today().slice(0, 7);

  it('exemplo do enunciado: Alimentação R$ 800, gasto R$ 200 → restante R$ 600 (25%)', async () => {
    const user = await registerUser(env.app);
    const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
    const food = await user.categoryId('Alimentação', 'expense');
    await user.ok(
      user.put('/budgets', { categoryId: food, month: currentMonth(user), limitCents: 80_000 }),
    );
    await user.addTransaction({
      accountId: account.id,
      type: 'expense',
      amountCents: 20_000,
      categoryId: food,
    });

    const result = await list(user);

    expect(result.month).toBe(currentMonth(user));
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({
      categoryName: 'Alimentação',
      limitCents: 80_000,
      spentCents: 20_000,
      remainingCents: 60_000,
      percentUsed: 25,
      status: 'ok',
    });
    expect(result.totals).toEqual({
      limitCents: 80_000,
      spentCents: 20_000,
      remainingCents: 60_000,
    });
  });

  it('gasto = só despesas EFETIVADAS da categoria no mês (pendente, receita, transferência e cancelada ficam fora)', async () => {
    const user = await registerUser(env.app);
    const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
    const mp = await user.createAccount({ name: 'Mercado Pago' });
    const food = await user.categoryId('Alimentação', 'expense');
    const salary = await user.categoryId('Salário', 'income');
    await user.ok(
      user.put('/budgets', { categoryId: food, month: currentMonth(user), limitCents: 100_000 }),
    );

    await user.addTransaction({
      accountId: inter.id,
      type: 'expense',
      amountCents: 10_000,
      categoryId: food,
    });
    // Pendente: não é gasto ainda (aparece em pendingCents).
    await user.addTransaction({
      accountId: inter.id,
      type: 'expense',
      amountCents: 7_000,
      categoryId: food,
      status: 'pending',
      transactionDate: user.today(),
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

    const result = await list(user);

    expect(result.items[0]).toMatchObject({
      spentCents: 10_000,
      pendingCents: 7_000,
      remainingCents: 90_000,
    });
  });

  it('despesas de outros meses não contam', async () => {
    const user = await registerUser(env.app);
    const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
    const food = await user.categoryId('Alimentação', 'expense');
    await user.ok(
      user.put('/budgets', { categoryId: food, month: currentMonth(user), limitCents: 100_000 }),
    );
    await user.addTransaction({
      accountId: account.id,
      type: 'expense',
      amountCents: 40_000,
      categoryId: food,
      transactionDate: user.today(-45),
    });

    const result = await list(user);
    const previous = await list(user, user.today(-45).slice(0, 7));

    expect(result.items[0]?.spentCents).toBe(0);
    expect(previous.items).toEqual([]);
    expect(previous.unbudgetedSpentCents).toBe(40_000);
  });

  it('status: atenção a partir de 80% e estourado acima do limite', async () => {
    const user = await registerUser(env.app);
    const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 900_000 });
    const food = await user.categoryId('Alimentação', 'expense');
    const transport = await user.categoryId('Transporte', 'expense');
    const leisure = await user.categoryId('Lazer', 'expense');
    const month = currentMonth(user);
    for (const [categoryId, limitCents] of [
      [food, 100_000],
      [transport, 100_000],
      [leisure, 100_000],
    ] as const) {
      await user.ok(user.put('/budgets', { categoryId, month, limitCents }));
    }
    await user.addTransaction({
      accountId: account.id,
      type: 'expense',
      amountCents: 50_000,
      categoryId: food,
    });
    await user.addTransaction({
      accountId: account.id,
      type: 'expense',
      amountCents: 85_000,
      categoryId: transport,
    });
    await user.addTransaction({
      accountId: account.id,
      type: 'expense',
      amountCents: 130_000,
      categoryId: leisure,
    });

    const byName = Object.fromEntries((await list(user)).items.map((b) => [b.categoryName, b]));

    expect(byName['Alimentação']).toMatchObject({ status: 'ok', percentUsed: 50 });
    expect(byName['Transporte']).toMatchObject({ status: 'warning', percentUsed: 85 });
    expect(byName['Lazer']).toMatchObject({
      status: 'exceeded',
      percentUsed: 130,
      remainingCents: -30_000,
    });
  });

  it('gasto fora de qualquer orçamento vai para unbudgetedSpentCents', async () => {
    const user = await registerUser(env.app);
    const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
    const food = await user.categoryId('Alimentação', 'expense');
    const transport = await user.categoryId('Transporte', 'expense');
    await user.ok(
      user.put('/budgets', { categoryId: food, month: currentMonth(user), limitCents: 100_000 }),
    );
    await user.addTransaction({
      accountId: account.id,
      type: 'expense',
      amountCents: 5_000,
      categoryId: food,
    });
    await user.addTransaction({
      accountId: account.id,
      type: 'expense',
      amountCents: 12_300,
      categoryId: transport,
    });
    await user.addTransaction({ accountId: account.id, type: 'expense', amountCents: 700 }); // sem categoria

    const result = await list(user);

    expect(result.totals.spentCents).toBe(5_000);
    expect(result.unbudgetedSpentCents).toBe(13_000);
  });

  it('despesa recorrente prevista no mês entra em pendingCents da categoria (sem virar gasto)', async () => {
    const user = await registerUser(env.app);
    const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
    const housing = await user.categoryId('Moradia', 'expense');
    const month = currentMonth(user);
    await user.ok(user.put('/budgets', { categoryId: housing, month, limitCents: 200_000 }));
    // Toda semana a partir de hoje: a ocorrência de hoje conta no mês e ainda é previsão.
    await user.ok(
      user.post('/recurring', {
        name: 'Aluguel semanal',
        type: 'expense',
        amountCents: 10_000,
        accountId: account.id,
        categoryId: housing,
        frequency: 'weekly',
        startDate: user.today(),
      }),
      201,
    );

    const budget = (await list(user)).items[0] as Budget;

    expect(budget.spentCents).toBe(0);
    expect(budget.pendingCents).toBeGreaterThanOrEqual(10_000);
  });

  it('upsert: repetir o mês/categoria altera o limite em vez de duplicar', async () => {
    const user = await registerUser(env.app);
    const food = await user.categoryId('Alimentação', 'expense');
    const month = currentMonth(user);

    const first = await user.ok<Budget>(
      user.put('/budgets', { categoryId: food, month, limitCents: 50_000 }),
    );
    const second = await user.ok<Budget>(
      user.put('/budgets', { categoryId: food, month, limitCents: 70_000 }),
    );

    expect(second.id).toBe(first.id);
    const result = await list(user);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.limitCents).toBe(70_000);
  });

  it('só categoria de despesa, ativa e do próprio usuário; limite positivo', async () => {
    const user = await registerUser(env.app);
    const other = await registerUser(env.app);
    const salary = await user.categoryId('Salário', 'income');
    const foreign = await other.categoryId('Alimentação', 'expense');
    const food = await user.categoryId('Alimentação', 'expense');
    const month = currentMonth(user);

    const income = await user.put('/budgets', { categoryId: salary, month, limitCents: 1_000 });
    const others = await user.put('/budgets', { categoryId: foreign, month, limitCents: 1_000 });
    const zero = await user.put('/budgets', { categoryId: food, month, limitCents: 0 });
    const badMonth = await user.put('/budgets', {
      categoryId: food,
      month: '2026-13',
      limitCents: 1_000,
    });

    expect(income.statusCode).toBe(422);
    expect(others.statusCode).toBe(404);
    expect(zero.statusCode).toBe(400);
    expect(badMonth.statusCode).toBe(400);
  });

  it('remove o orçamento sem mexer nos lançamentos; outro usuário não consegue remover', async () => {
    const owner = await registerUser(env.app);
    const intruder = await registerUser(env.app);
    const account = await owner.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
    const food = await owner.categoryId('Alimentação', 'expense');
    const budget = await owner.ok<Budget>(
      owner.put('/budgets', { categoryId: food, month: currentMonth(owner), limitCents: 50_000 }),
    );
    await owner.addTransaction({
      accountId: account.id,
      type: 'expense',
      amountCents: 1_000,
      categoryId: food,
    });

    expect((await intruder.delete(`/budgets/${budget.id}`)).statusCode).toBe(404);
    expect((await intruder.get('/budgets')).json<BudgetList>().items).toEqual([]);
    expect((await owner.delete(`/budgets/${budget.id}`)).statusCode).toBe(204);

    expect((await list(owner)).items).toEqual([]);
    expect(await owner.listAll()).toHaveLength(1);
    expect((await owner.delete(`/budgets/${budget.id}`)).statusCode).toBe(404);
  });

  it('exige autenticação', async () => {
    const response = await env.app.inject({ method: 'GET', url: '/api/v1/budgets' });

    expect(response.statusCode).toBe(401);
  });
});
