import { randomUUID } from 'node:crypto';
import {
  addDaysToDate,
  dashboardSchema,
  endOfMonth,
  startOfMonth,
  type Account,
  type Dashboard,
} from '@fintrack/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { DrizzleDb } from '../../db/client.js';
import {
  createLedgerTestEnv,
  databaseUrl,
  registerUser,
  type LedgerTestEnv,
  type TestClient,
} from '../../test/ledger-client.js';
import { entrySign } from '../accounts/domain/balance.js';

describe.skipIf(!databaseUrl)('painel e dinheiro disponível (integração)', () => {
  let env: LedgerTestEnv;
  let db: DrizzleDb;

  beforeAll(async () => {
    env = await createLedgerTestEnv();
    db = env.database.db;
  });
  afterAll(async () => {
    await env.close();
  });

  async function dashboard(user: TestClient, until?: string): Promise<Dashboard> {
    const body = await user.ok(user.get(`/dashboard${until ? `?until=${until}` : ''}`));
    return dashboardSchema.parse(body);
  }

  it('sem dados: tudo zerado e horizonte no fim do mês', async () => {
    const user = await registerUser(env.app);

    const d = await dashboard(user);

    expect(d.today).toBe(user.today());
    expect(d.until).toBe(endOfMonth(user.today()));
    expect(d.availableToSpend.amountCents).toBe(0);
    expect(d.totalBalanceCents).toBe(0);
    expect(d.month).toMatchObject({ incomeCents: 0, expenseCents: 0 });
    expect(d.pendingBills).toMatchObject({ count: 0, totalCents: 0, next: [] });
    expect(d.futureCommitments).toEqual({ count: 0, totalCents: 0 });
  });

  it('exemplo do enunciado: saldo R$ 2.500 − compromisso R$ 1.200 = R$ 1.300 disponíveis', async () => {
    const user = await registerUser(env.app);
    const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 250_000 });
    await user.addTransaction({
      accountId: inter.id,
      type: 'expense',
      amountCents: 120_000,
      status: 'pending',
    });

    const d = await dashboard(user);

    expect(d.totalBalanceCents).toBe(250_000);
    expect(d.availableToSpend.amountCents).toBe(130_000);
    expect(d.availableToSpend.components).toEqual({
      liquidBalanceCents: 250_000,
      pendingIncomeCents: 0,
      pendingExpensesCents: 120_000,
      pendingTransfersInCents: 0,
      pendingTransfersOutCents: 0,
      forecastIncomeCents: 0,
      forecastExpensesCents: 0,
      invoicesCents: 0,
    });
  });

  it('receitas e despesas pendentes só contam até o horizonte; depois viram compromissos futuros', async () => {
    const user = await registerUser(env.app);
    const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
    const until = user.today(10);
    await user.addTransaction({
      accountId: inter.id,
      type: 'income',
      amountCents: 40_000,
      status: 'pending',
      transactionDate: user.today(5),
    });
    await user.addTransaction({
      accountId: inter.id,
      type: 'income',
      amountCents: 999_999,
      status: 'pending',
      transactionDate: user.today(11),
    });
    await user.addTransaction({
      accountId: inter.id,
      type: 'expense',
      amountCents: 15_000,
      status: 'pending',
      transactionDate: user.today(10),
    });
    await user.addTransaction({
      accountId: inter.id,
      type: 'expense',
      amountCents: 7_000,
      status: 'pending',
      transactionDate: user.today(11),
    });

    const d = await dashboard(user, until);

    expect(d.until).toBe(until);
    expect(d.availableToSpend.amountCents).toBe(100_000 + 40_000 - 15_000);
    expect(d.pendingBills).toMatchObject({ count: 1, totalCents: 15_000 });
    expect(d.futureCommitments).toEqual({ count: 1, totalCents: 7_000 });
  });

  it('atrasadas entram no disponível e aparecem como vencidas, da mais antiga para a mais nova', async () => {
    const user = await registerUser(env.app);
    const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 50_000 });
    await user.addTransaction({
      accountId: inter.id,
      type: 'expense',
      amountCents: 3_000,
      status: 'pending',
      transactionDate: user.today(2),
      description: 'Futura',
    });
    await user.addTransaction({
      accountId: inter.id,
      type: 'expense',
      amountCents: 1_000,
      status: 'pending',
      transactionDate: user.today(-5),
      description: 'Atrasada antiga',
    });
    await user.addTransaction({
      accountId: inter.id,
      type: 'expense',
      amountCents: 2_000,
      status: 'pending',
      transactionDate: user.today(-1),
      description: 'Atrasada recente',
    });

    const d = await dashboard(user, user.today(30));

    expect(d.availableToSpend.amountCents).toBe(50_000 - 6_000);
    expect(d.pendingBills).toMatchObject({
      count: 3,
      totalCents: 6_000,
      overdueCount: 2,
      overdueCents: 3_000,
    });
    expect(d.pendingBills.next.map((b) => [b.description, b.overdue])).toEqual([
      ['Atrasada antiga', true],
      ['Atrasada recente', true],
      ['Futura', false],
    ]);
  });

  describe('transferências (sem dupla contagem)', () => {
    async function setup() {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const mp = await user.createAccount({
        name: 'Mercado Pago',
        type: 'wallet',
        initialBalanceCents: 10_000,
      });
      const tesouro = await user.createAccount({
        name: 'Tesouro',
        type: 'investment',
        initialBalanceCents: 200_000,
      });
      return { user, inter, mp, tesouro };
    }

    it('transferência pendente entre duas contas líquidas não altera o disponível', async () => {
      const { user, inter, mp } = await setup();
      const before = (await dashboard(user)).availableToSpend.amountCents;

      await user.transfer({
        fromAccountId: inter.id,
        toAccountId: mp.id,
        amountCents: 30_000,
        status: 'pending',
      });

      const d = await dashboard(user);
      expect(d.availableToSpend.amountCents).toBe(before);
      expect(d.availableToSpend.components).toMatchObject({
        pendingTransfersInCents: 0,
        pendingTransfersOutCents: 0,
        forecastIncomeCents: 0,
        forecastExpensesCents: 0,
        invoicesCents: 0,
      });
    });

    it('aplicação agendada (líquida → investimento) reduz o disponível; resgate agendado aumenta', async () => {
      const { user, inter, tesouro } = await setup();
      await user.transfer({
        fromAccountId: inter.id,
        toAccountId: tesouro.id,
        amountCents: 40_000,
        status: 'pending',
      });
      await user.transfer({
        fromAccountId: tesouro.id,
        toAccountId: inter.id,
        amountCents: 5_000,
        status: 'pending',
      });

      const d = await dashboard(user, user.today(30));

      expect(d.availableToSpend.components).toMatchObject({
        pendingTransfersOutCents: 40_000,
        forecastIncomeCents: 0,
        forecastExpensesCents: 0,
        invoicesCents: 0,
        pendingTransfersInCents: 5_000,
      });
      expect(d.availableToSpend.amountCents).toBe(110_000 - 40_000 + 5_000);
    });

    it('transferência já efetivada não entra nos componentes (o saldo já reflete)', async () => {
      const { user, inter, tesouro } = await setup();
      await user.transfer({
        fromAccountId: inter.id,
        toAccountId: tesouro.id,
        amountCents: 40_000,
      });

      const d = await dashboard(user);

      expect(d.availableToSpend.components).toEqual({
        liquidBalanceCents: 100_000 - 40_000 + 10_000,
        pendingIncomeCents: 0,
        pendingExpensesCents: 0,
        pendingTransfersInCents: 0,
        pendingTransfersOutCents: 0,
        forecastIncomeCents: 0,
        forecastExpensesCents: 0,
        invoicesCents: 0,
      });
      expect(d.investmentsCents).toBe(240_000);
    });

    it('aplicar em investimento não é despesa: não entra em despesas do mês nem em contas pendentes', async () => {
      const { user, inter, tesouro } = await setup();
      await user.transfer({
        fromAccountId: inter.id,
        toAccountId: tesouro.id,
        amountCents: 40_000,
        status: 'pending',
      });
      await user.transfer({ fromAccountId: inter.id, toAccountId: tesouro.id, amountCents: 1_000 });

      const d = await dashboard(user);

      expect(d.month).toMatchObject({ incomeCents: 0, expenseCents: 0 });
      expect(d.pendingBills.count).toBe(0);
      expect(d.futureCommitments.count).toBe(0);
    });
  });

  describe('quais contas entram', () => {
    it('investimento, conta fora do disponível e conta arquivada não entram no disponível', async () => {
      const user = await registerUser(env.app);
      await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const cofre = await user.createAccount({ name: 'Cofre', initialBalanceCents: 30_000 });
      const velha = await user.createAccount({ name: 'Velha', initialBalanceCents: 7_000 });
      const tesouro = await user.createAccount({
        name: 'Tesouro',
        type: 'investment',
        initialBalanceCents: 500_000,
      });
      await user.ok(user.patch(`/accounts/${cofre.id}`, { includeInAvailable: false }));
      await user.ok(user.post(`/accounts/${velha.id}/archive`));
      // Pendente no cofre (fora do disponível) e no investimento não deve descontar.
      await user.addTransaction({
        accountId: cofre.id,
        type: 'expense',
        amountCents: 9_000,
        status: 'pending',
      });

      const d = await dashboard(user);

      expect(d.availableToSpend.amountCents).toBe(100_000);
      expect(d.totalBalanceCents).toBe(100_000 + 30_000); // arquivada fora; cofre continua no saldo total
      expect(d.investmentsCents).toBe(500_000);
      expect(d.netWorthCents).toBe(630_000);
      expect(tesouro.type).toBe('investment');
    });

    it('lançamentos cancelados são ignorados em tudo', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 10_000 });
      const pending = await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 4_000,
        status: 'pending',
      });
      const done = await user.addTransaction({
        accountId: inter.id,
        type: 'income',
        amountCents: 9_000,
      });
      await user.ok(user.post(`/transactions/${pending.id}/cancel`));
      await user.ok(user.post(`/transactions/${done.id}/cancel`));

      const d = await dashboard(user);

      expect(d.availableToSpend.amountCents).toBe(10_000);
      expect(d.month).toMatchObject({ incomeCents: 0, expenseCents: 0 });
      expect(d.pendingBills.count).toBe(0);
    });
  });

  describe('receitas e despesas do mês', () => {
    it('contam só efetivadas do mês corrente; transferências, pendentes e outros meses ficam de fora', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter' });
      const mp = await user.createAccount({ name: 'MP', type: 'wallet' });
      const lastMonth = addDaysToDate(startOfMonth(user.today()), -1);
      await user.addTransaction({ accountId: inter.id, type: 'income', amountCents: 500_000 });
      await user.addTransaction({ accountId: inter.id, type: 'expense', amountCents: 12_000 });
      await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 999,
        status: 'pending',
      });
      await user.addTransaction({
        accountId: inter.id,
        type: 'income',
        amountCents: 77_777,
        transactionDate: lastMonth,
      });
      await user.transfer({ fromAccountId: inter.id, toAccountId: mp.id, amountCents: 50_000 });

      const d = await dashboard(user);

      expect(d.month).toEqual({
        from: startOfMonth(user.today()),
        to: endOfMonth(user.today()),
        incomeCents: 500_000,
        expenseCents: 12_000,
        cardExpenseCents: 0,
      });
    });
  });

  describe('fluxo de caixa (quando entra e quando sai)', () => {
    it('lista item a item o que compõe o disponível, com o saldo depois de cada um', async () => {
      const user = await registerUser(env.app);
      const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 10_000 });
      const porquinho = await user.createAccount({ name: 'Porquinho', type: 'investment' });
      await user.transfer({
        fromAccountId: inter.id,
        toAccountId: porquinho.id,
        amountCents: 5_000,
        transferDate: user.today(1),
        status: 'pending',
      });
      await user.addTransaction({
        accountId: inter.id,
        type: 'expense',
        amountCents: 20_000,
        status: 'pending',
        transactionDate: user.today(2),
        description: 'Luz',
      });
      await user.ok(
        user.post('/recurring', {
          name: 'Freela',
          type: 'income',
          amountCents: 100_000,
          accountId: inter.id,
          frequency: 'weekly',
          startDate: user.today(3),
          endDate: user.today(3),
        }),
        201,
      );
      // Fecha no último dia do mês e vence dia 1º: a compra de hoje vence em até 31 dias.
      const card = await user.ok<{ id: string }>(
        user.post('/credit-cards', {
          name: 'Nubank',
          limitCents: 500_000,
          closingDay: 31,
          dueDay: 1,
          paymentAccountId: inter.id,
        }),
        201,
      );
      await user.ok(
        user.post(`/credit-cards/${card.id}/purchases`, {
          description: 'Mercado',
          purchaseDate: user.today(),
          totalAmountCents: 45_000,
        }),
        201,
      );

      const body = await user.ok(user.get('/dashboard?days=40'));
      const d = dashboardSchema.parse(body);
      const { cashflow } = d;

      expect(d.until).toBe(user.today(40));
      expect(d.availableToSpend.amountCents).toBe(10_000 - 5_000 - 20_000 + 100_000 - 45_000);
      expect(new Set(cashflow.entries.map((e) => e.kind))).toEqual(
        new Set(['transfer', 'transaction', 'recurring', 'invoice']),
      );
      expect(cashflow.inCents).toBe(100_000);
      expect(cashflow.outCents).toBe(70_000);
      expect(cashflow.entries.at(-1)?.balanceAfterCents).toBe(d.availableToSpend.amountCents);
      const dates = cashflow.entries.map((e) => e.date);
      expect(dates).toEqual([...dates].sort());
      // A conta de luz vence antes do freela entrar: o saldo fica negativo no caminho.
      expect(cashflow.lowestBalanceCents).toBeLessThanOrEqual(-15_000);
      expect(cashflow.safeToSpendNowCents).toBe(0);
      const luz = cashflow.entries.find((e) => e.description === 'Luz');
      expect(luz).toMatchObject({ direction: 'out', accountId: inter.id, overdue: false });
      const freela = cashflow.entries.find((e) => e.kind === 'recurring');
      expect(freela).toMatchObject({ direction: 'in', description: 'Freela', date: user.today(3) });
      const invoice = cashflow.entries.find((e) => e.kind === 'invoice');
      expect(invoice).toMatchObject({ direction: 'out', amountCents: 45_000 });
      expect(invoice?.invoiceId).toEqual(expect.any(String));
    });

    it('sem pendências: o saldo inteiro fica disponível hoje', async () => {
      const user = await registerUser(env.app);
      await user.createAccount({ name: 'Inter', initialBalanceCents: 80_000 });

      const d = await dashboard(user);

      expect(d.cashflow).toEqual({
        entries: [],
        inCents: 0,
        outCents: 0,
        lowestBalanceCents: 80_000,
        lowestBalanceDate: d.today,
        safeToSpendNowCents: 80_000,
      });
    });
  });

  describe('validação e isolamento', () => {
    it('horizonte anterior a hoje → 422; data inválida → 400', async () => {
      const user = await registerUser(env.app);
      expect((await user.get(`/dashboard?until=${user.today(-1)}`)).statusCode).toBe(422);
      expect((await user.get('/dashboard?until=2026-02-30')).statusCode).toBe(400);
      expect((await user.get('/dashboard?until=amanha')).statusCode).toBe(400);
    });

    it('horizonte por dias: 1 a 366, e não junto com until', async () => {
      const user = await registerUser(env.app);
      expect((await user.get('/dashboard?days=0')).statusCode).toBe(400);
      expect((await user.get('/dashboard?days=367')).statusCode).toBe(400);
      expect((await user.get('/dashboard?days=abc')).statusCode).toBe(400);
      expect((await user.get(`/dashboard?days=10&until=${user.today(5)}`)).statusCode).toBe(400);
      const d = dashboardSchema.parse(await user.ok(user.get('/dashboard?days=30')));
      expect(d.until).toBe(user.today(30));
    });

    it('exige autenticação', async () => {
      expect((await env.app.inject({ method: 'GET', url: '/api/v1/dashboard' })).statusCode).toBe(
        401,
      );
    });

    it('não mistura dados de usuários', async () => {
      const alice = await registerUser(env.app);
      const bob = await registerUser(env.app);
      const a = await alice.createAccount({ name: 'Conta', initialBalanceCents: 900_000 });
      await alice.addTransaction({
        accountId: a.id,
        type: 'expense',
        amountCents: 5_000,
        status: 'pending',
      });

      const d = await dashboard(bob);

      expect(d.availableToSpend.amountCents).toBe(0);
      expect(d.pendingBills.count).toBe(0);
    });

    it('"hoje" e o fim do mês seguem o fuso do usuário', async () => {
      const kiritimati = await registerUser(env.app, 'Pacific/Kiritimati');
      const pagoPago = await registerUser(env.app, 'Pacific/Pago_Pago');

      const a = await dashboard(kiritimati);
      const b = await dashboard(pagoPago);

      expect(a.today).toBe(kiritimati.today());
      expect(b.today).toBe(pagoPago.today());
      expect(a.today > b.today).toBe(true);
      expect(a.until).toBe(endOfMonth(a.today));
    });
  });

  describe('propriedade: disponível = saldo inicial + efeito de tudo que não foi cancelado até o horizonte', () => {
    function prng(seed: number) {
      let a = seed;
      return () => {
        a |= 0;
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    }

    it.each([11, 12, 13, 14, 15, 16])(
      'semente %i: 50 lançamentos aleatórios em 6 contas',
      async (seed) => {
        const random = prng(seed * 104729);
        const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)] as T;
        const user = await registerUser(env.app);
        const until = user.today(15);

        const specs = [
          { name: 'L1', type: 'bank' as const, liquid: true },
          { name: 'L2', type: 'wallet' as const, liquid: true },
          { name: 'L3', type: 'bank' as const, liquid: true },
          { name: 'Cofre', type: 'bank' as const, liquid: false },
          { name: 'Invest', type: 'investment' as const, liquid: false },
          { name: 'Velha', type: 'bank' as const, liquid: false },
        ];
        const accounts: (Account & { liquid: boolean })[] = [];
        for (const [index, spec] of specs.entries()) {
          const created = await user.createAccount({
            name: spec.name,
            type: spec.type,
            initialBalanceCents: (index + 1) * 10_001,
          });
          accounts.push({ ...created, liquid: spec.liquid });
        }
        await user.ok(user.patch(`/accounts/${accounts[3]!.id}`, { includeInAvailable: false }));
        await user.ok(user.post(`/accounts/${accounts[5]!.id}/archive`)); // arquivar depois de lançar não é necessário aqui

        const entries: {
          accountId: string;
          sign: 1 | -1;
          amount: number;
          date: string;
          status: string;
        }[] = [];
        const statuses = ['completed', 'pending', 'pending', 'cancelled'] as const;
        const dayOffset = () => Math.floor(random() * 41) - 20; // −20 … +20 dias

        for (let n = 0; n < 50; n++) {
          const amount = 1 + Math.floor(random() * 50_000);
          const status = pick(statuses);
          // Efetivados nunca no futuro (regra do tempo); pendentes em qualquer data.
          const offset = status === 'completed' ? -Math.abs(dayOffset()) : dayOffset();
          const date = user.today(offset);

          if (random() < 0.3) {
            const [from, to] = [pick(accounts), pick(accounts)];
            if (from.id === to.id) continue;
            const id = randomUUID();
            await db.transaction(async (tx) => {
              await tx.execute(sql`insert into transfers (id, user_id, from_account_id, to_account_id, amount_cents, transfer_date, status)
                                 values (${id}, ${user.userId}, ${from.id}, ${to.id}, ${amount}, ${date}::date, ${status}::transaction_status)`);
              await tx.execute(sql`insert into transactions (user_id, account_id, type, amount_cents, transaction_date, status, transfer_id, transfer_direction)
                                 values (${user.userId}, ${from.id}, 'transfer', ${amount}, ${date}::date, ${status}::transaction_status, ${id}, 'out'),
                                        (${user.userId}, ${to.id}, 'transfer', ${amount}, ${date}::date, ${status}::transaction_status, ${id}, 'in')`);
            });
            entries.push({
              accountId: from.id,
              sign: entrySign({ type: 'transfer', transferDirection: 'out' }),
              amount,
              date,
              status,
            });
            entries.push({
              accountId: to.id,
              sign: entrySign({ type: 'transfer', transferDirection: 'in' }),
              amount,
              date,
              status,
            });
          } else {
            const account = pick(accounts);
            const type = pick(['income', 'expense'] as const);
            await db.execute(sql`insert into transactions (user_id, account_id, type, amount_cents, transaction_date, status)
                               values (${user.userId}, ${account.id}, ${type}::transaction_type, ${amount}, ${date}::date, ${status}::transaction_status)`);
            entries.push({
              accountId: account.id,
              sign: entrySign({ type, transferDirection: null }),
              amount,
              date,
              status,
            });
          }
        }

        // Oráculo independente: para cada conta líquida, saldo inicial + Σ de tudo que não foi cancelado
        // e tem data até o horizonte (efetivados e pendentes). Transferências entre contas líquidas se anulam.
        const liquidIds = new Set(
          accounts.filter((a) => a.liquid && a.id !== accounts[5]!.id).map((a) => a.id),
        );
        const expected =
          accounts
            .filter((a) => liquidIds.has(a.id))
            .reduce((sum, a) => sum + a.initialBalanceCents, 0) +
          entries
            .filter(
              (e) => liquidIds.has(e.accountId) && e.status !== 'cancelled' && e.date <= until,
            )
            .reduce((sum, e) => sum + e.sign * e.amount, 0);

        const d = await dashboard(user, until);

        expect(d.availableToSpend.amountCents).toBe(expected);
        // O fluxo de caixa lista exatamente os mesmos itens: saldo + entradas − saídas = disponível.
        const { cashflow } = d;
        expect(
          d.availableToSpend.components.liquidBalanceCents + cashflow.inCents - cashflow.outCents,
        ).toBe(expected);
        expect(
          cashflow.entries.at(-1)?.balanceAfterCents ??
            d.availableToSpend.components.liquidBalanceCents,
        ).toBe(expected);
        expect(cashflow.lowestBalanceCents).toBe(
          Math.min(
            d.availableToSpend.components.liquidBalanceCents,
            ...cashflow.entries.map((e) => e.balanceAfterCents),
          ),
        );
      },
    );
  });
});
