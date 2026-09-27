import {
  dashboardSchema,
  occurrenceListResponseSchema,
  type Dashboard,
  type Recurring,
  type Transaction,
} from '@fintrack/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLedgerTestEnv,
  databaseUrl,
  registerUser,
  type LedgerTestEnv,
  type TestClient,
} from '../../test/ledger-client.js';

describe.skipIf(!databaseUrl)('recorrências (integração)', () => {
  let env: LedgerTestEnv;

  beforeAll(async () => {
    env = await createLedgerTestEnv();
  });
  afterAll(async () => {
    await env.close();
  });

  async function dashboard(user: TestClient, until: string): Promise<Dashboard> {
    return dashboardSchema.parse(await user.ok(user.get(`/dashboard?until=${until}`)));
  }

  async function occurrences(user: TestClient, until?: string) {
    const body = await user.ok(user.get(`/recurring/occurrences${until ? `?until=${until}` : ''}`));
    return occurrenceListResponseSchema.parse(body).items;
  }

  /** Recorrência semanal de despesa: as ocorrências caem em `start`, `start+7`, … */
  function weekly(
    user: TestClient,
    accountId: string,
    start: string,
    extra: Record<string, unknown> = {},
  ) {
    return user.ok<Recurring>(
      user.post('/recurring', {
        name: 'Academia',
        type: 'expense',
        amountCents: 10_000,
        accountId,
        frequency: 'weekly',
        startDate: start,
        ...extra,
      }),
      201,
    );
  }

  describe('cadastro', () => {
    it('cria a regra sem criar lançamentos e informa a próxima ocorrência', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });

      const rule = await weekly(user, account.id, user.today(3));

      expect(rule).toMatchObject({ active: true, nextDate: user.today(3), autoConfirm: false });
      expect(await user.listAll()).toEqual([]);
      expect(await user.balanceOf(account.id)).toBe(100_000);
    });

    it('valida a regra: mensal exige dia, valor fixo exige valor, auto-confirmar só com valor fixo', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const base = { name: 'X', type: 'expense', accountId: account.id, startDate: user.today() };

      const semDia = await user.post('/recurring', {
        ...base,
        amountCents: 100,
        frequency: 'monthly',
      });
      const semValor = await user.post('/recurring', { ...base, frequency: 'weekly' });
      const autoVariavel = await user.post('/recurring', {
        ...base,
        frequency: 'weekly',
        isVariableAmount: true,
        autoConfirm: true,
      });

      expect(semDia.statusCode).toBe(400);
      expect(semValor.statusCode).toBe(400);
      expect(autoVariavel.statusCode).toBe(400);
    });

    it('não aceita conta de investimento nem conta/categoria de outro usuário', async () => {
      const user = await registerUser(env.app);
      const other = await registerUser(env.app);
      const invest = await user.createAccount({ name: 'CDB', type: 'investment' });
      const othersAccount = await other.createAccount({ name: 'Dela' });
      const ok = await user.createAccount({ name: 'Inter' });
      const othersCategory = await other.categoryId('Alimentação', 'expense');

      const onInvestment = await user.post('/recurring', {
        name: 'X',
        type: 'expense',
        amountCents: 100,
        accountId: invest.id,
        frequency: 'weekly',
        startDate: user.today(),
      });
      const foreignAccount = await user.post('/recurring', {
        name: 'X',
        type: 'expense',
        amountCents: 100,
        accountId: othersAccount.id,
        frequency: 'weekly',
        startDate: user.today(),
      });
      const foreignCategory = await user.post('/recurring', {
        name: 'X',
        type: 'expense',
        amountCents: 100,
        accountId: ok.id,
        categoryId: othersCategory,
        frequency: 'weekly',
        startDate: user.today(),
      });

      expect(onInvestment.statusCode).toBe(422);
      expect(foreignAccount.statusCode).toBe(404);
      expect(foreignCategory.statusCode).toBe(404);
    });

    it('edita e desativa; desativada não gera previsão', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const rule = await weekly(user, account.id, user.today(2));

      const edited = await user.ok<Recurring>(
        user.patch(`/recurring/${rule.id}`, { name: 'Academia Smart', amountCents: 12_000 }),
      );
      expect(edited).toMatchObject({ name: 'Academia Smart', amountCents: 12_000 });
      expect((await occurrences(user)).length).toBeGreaterThan(0);

      await user.ok(user.post(`/recurring/${rule.id}/deactivate`));

      expect(await occurrences(user)).toEqual([]);
      const listed = await user.ok<{ items: Recurring[] }>(user.get('/recurring'));
      expect(listed.items).toEqual([]);
      const all = await user.ok<{ items: Recurring[] }>(
        user.get('/recurring?includeInactive=true'),
      );
      expect(all.items).toHaveLength(1);
    });
  });

  describe('previsão (não é lançamento)', () => {
    it('ocorrências futuras não mexem em saldo, lançamentos nem despesas do mês', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      await weekly(user, account.id, user.today(2));

      const items = await occurrences(user, user.today(20));

      expect(items.map((item) => item.date)).toEqual([
        user.today(2),
        user.today(9),
        user.today(16),
      ]);
      expect(items.every((item) => !item.overdue && !item.estimated)).toBe(true);
      expect(await user.balanceOf(account.id)).toBe(100_000);
      expect(await user.listAll()).toEqual([]);
      const d = await dashboard(user, user.today(20));
      expect(d.month.expenseCents).toBe(0);
      expect(d.totalBalanceCents).toBe(100_000);
    });

    it('entra em "Quanto posso gastar?" só dentro do horizonte, decomposta em forecastExpenses', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      await weekly(user, account.id, user.today(2)); // +2, +9, +16

      const curto = await dashboard(user, user.today(5));
      const longo = await dashboard(user, user.today(10));

      expect(curto.availableToSpend.components.forecastExpensesCents).toBe(10_000);
      expect(curto.availableToSpend.amountCents).toBe(90_000);
      expect(longo.availableToSpend.components.forecastExpensesCents).toBe(20_000);
      expect(longo.availableToSpend.amountCents).toBe(80_000);
    });

    it('receita recorrente prevista soma em forecastIncome', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 50_000 });
      await user.ok(
        user.post('/recurring', {
          name: 'Salário',
          type: 'income',
          amountCents: 300_000,
          accountId: account.id,
          frequency: 'weekly',
          startDate: user.today(1),
        }),
        201,
      );

      const d = await dashboard(user, user.today(3));

      expect(d.availableToSpend.components.forecastIncomeCents).toBe(300_000);
      expect(d.availableToSpend.amountCents).toBe(350_000);
    });

    it('includeInForecast=false: continua listada, mas não reduz o disponível', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      await weekly(user, account.id, user.today(2), { includeInForecast: false });

      const d = await dashboard(user, user.today(5));

      expect(await occurrences(user, user.today(5))).toHaveLength(1);
      expect(d.availableToSpend.components.forecastExpensesCents).toBe(0);
      expect(d.availableToSpend.amountCents).toBe(100_000);
    });

    it('conta fora do disponível: a previsão dela não entra na conta', async () => {
      const user = await registerUser(env.app);
      const liquid = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const reserve = await user.ok<{ id: string }>(
        user.post('/accounts', {
          name: 'Reserva',
          type: 'bank',
          initialBalanceCents: 500_000,
          includeInAvailable: false,
        }),
        201,
      );
      await weekly(user, reserve.id, user.today(2));

      const d = await dashboard(user, user.today(5));

      expect(liquid.id).not.toBe(reserve.id);
      expect(d.availableToSpend.components.forecastExpensesCents).toBe(0);
      expect(d.availableToSpend.amountCents).toBe(100_000);
    });

    it('ocorrências vencidas e não confirmadas aparecem como atrasadas e entram nas contas a pagar', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      await weekly(user, account.id, user.today(-9)); // -9, -2, +5

      const items = await occurrences(user, user.today(5));
      const d = await dashboard(user, user.today(5));

      expect(items.map((item) => [item.date, item.overdue])).toEqual([
        [user.today(-9), true],
        [user.today(-2), true],
        [user.today(5), false],
      ]);
      expect(d.availableToSpend.components.forecastExpensesCents).toBe(30_000);
      expect(d.pendingBills.count).toBe(3);
      expect(d.pendingBills.next.every((bill) => bill.kind === 'recurring')).toBe(true);
    });

    it('valor variável: usa o último confirmado como estimativa e marca como estimado', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const rule = await user.ok<Recurring>(
        user.post('/recurring', {
          name: 'Energia',
          type: 'expense',
          isVariableAmount: true,
          amountCents: 15_000,
          accountId: account.id,
          frequency: 'weekly',
          startDate: user.today(-7),
        }),
        201,
      );

      const antes = await occurrences(user, user.today(7));
      expect(antes.map((i) => [i.amountCents, i.estimated])).toEqual([
        [15_000, true],
        [15_000, true],
        [15_000, true],
      ]);

      // Confirma a mais antiga com o valor real da conta → vira a nova estimativa.
      await user.ok(
        user.post(`/recurring/${rule.id}/occurrences/${user.today(-7)}/confirm`, {
          amountCents: 18_750,
        }),
        201,
      );

      const depois = await occurrences(user, user.today(7));
      expect(depois.map((i) => [i.date, i.amountCents, i.estimated])).toEqual([
        [user.today(0), 18_750, true],
        [user.today(7), 18_750, true],
      ]);
    });
  });

  describe('confirmar e pular', () => {
    it('confirmar cria UM lançamento efetivado vinculado e a ocorrência some da previsão', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const rule = await weekly(user, account.id, user.today(-3)); // -3, +4

      const created = await user.ok<Transaction>(
        user.post(`/recurring/${rule.id}/occurrences/${user.today(-3)}/confirm`),
        201,
      );

      expect(created).toMatchObject({
        type: 'expense',
        status: 'completed',
        amountCents: 10_000,
        recurringId: rule.id,
        transactionDate: user.today(-3),
        description: 'Academia',
      });
      expect(await user.balanceOf(account.id)).toBe(90_000);
      expect((await occurrences(user, user.today(10))).map((i) => i.date)).toEqual([user.today(4)]);
      expect(await user.listAll()).toHaveLength(1);
    });

    it('SEM DUPLA CONTAGEM: confirmar não altera o "posso gastar" (sai da previsão e entra no saldo)', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const rule = await weekly(user, account.id, user.today(-3)); // -3 e +4 dentro do horizonte
      const until = user.today(6);

      const antes = await dashboard(user, until);
      await user.ok(user.post(`/recurring/${rule.id}/occurrences/${user.today(-3)}/confirm`), 201);
      const depois = await dashboard(user, until);

      expect(antes.availableToSpend.amountCents).toBe(80_000);
      expect(depois.availableToSpend.amountCents).toBe(80_000);
      expect(depois.availableToSpend.components).toMatchObject({
        liquidBalanceCents: 90_000,
        forecastExpensesCents: 10_000,
      });
      expect(depois.month.expenseCents).toBeGreaterThanOrEqual(0);
    });

    it('confirmar a mesma ocorrência duas vezes (ou em paralelo) cria só um lançamento', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const rule = await weekly(user, account.id, user.today(-3));
      const url = `/recurring/${rule.id}/occurrences/${user.today(-3)}/confirm`;

      const results = await Promise.all([user.post(url), user.post(url), user.post(url)]);

      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 409, 409]);
      expect(await user.listAll()).toHaveLength(1);
      expect(await user.balanceOf(account.id)).toBe(90_000);
    });

    it('permite ajustar valor e data (paga adiantado, valor diferente do previsto)', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const rule = await weekly(user, account.id, user.today(5));

      const created = await user.ok<Transaction>(
        user.post(`/recurring/${rule.id}/occurrences/${user.today(5)}/confirm`, {
          amountCents: 9_990,
          transactionDate: user.today(),
        }),
        201,
      );

      expect(created).toMatchObject({ amountCents: 9_990, transactionDate: user.today() });
      expect(await user.balanceOf(account.id)).toBe(90_010);
    });

    it('não efetiva ocorrência futura sem informar uma data até hoje', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const rule = await weekly(user, account.id, user.today(5));

      const res = await user.post(`/recurring/${rule.id}/occurrences/${user.today(5)}/confirm`);

      expect(res.statusCode).toBe(422);
      expect(await user.listAll()).toEqual([]);
    });

    it('rejeita data que não é uma ocorrência da regra', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const rule = await weekly(user, account.id, user.today(-3));

      const res = await user.post(`/recurring/${rule.id}/occurrences/${user.today(-2)}/confirm`);

      expect(res.statusCode).toBe(404);
    });

    it('pular tira a ocorrência da previsão sem mexer em saldo, despesas ou disponível', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const rule = await weekly(user, account.id, user.today(-3)); // -3 e +4
      const until = user.today(6);

      await user.ok(user.post(`/recurring/${rule.id}/occurrences/${user.today(-3)}/skip`), 201);
      const d = await dashboard(user, until);

      expect(await user.balanceOf(account.id)).toBe(100_000);
      expect((await occurrences(user, until)).map((i) => i.date)).toEqual([user.today(4)]);
      expect(d.availableToSpend.amountCents).toBe(90_000);
      expect(d.month.expenseCents).toBe(0);
      // A ocorrência pulada fica registrada como cancelada, para nunca reaparecer.
      const skipped = (await user.listAll('&status=cancelled'))[0];
      expect(skipped).toMatchObject({ status: 'cancelled', recurringId: rule.id });
    });

    it('depois de pulada não dá para confirmar (e vice-versa)', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const rule = await weekly(user, account.id, user.today(-3));
      const base = `/recurring/${rule.id}/occurrences/${user.today(-3)}`;

      await user.ok(user.post(`${base}/skip`), 201);

      expect((await user.post(`${base}/confirm`)).statusCode).toBe(409);
      expect((await user.post(`${base}/skip`)).statusCode).toBe(409);
    });

    it('regra desativada não permite confirmar', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const rule = await weekly(user, account.id, user.today(-3));
      await user.ok(user.post(`/recurring/${rule.id}/deactivate`));

      const res = await user.post(`/recurring/${rule.id}/occurrences/${user.today(-3)}/confirm`);

      expect(res.statusCode).toBe(409);
    });
  });

  describe('confirmação automática', () => {
    it('gera lançamentos efetivados das ocorrências já vencidas ao consultar, sem duplicar', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const rule = await weekly(user, account.id, user.today(-10), { autoConfirm: true }); // -10, -3, +4

      const primeira = await user.ok<{ balanceCents: number }>(user.get(`/accounts/${account.id}`));
      const segunda = await user.ok<{ balanceCents: number }>(user.get(`/accounts/${account.id}`));
      const [a, b] = await Promise.all([user.get('/dashboard'), user.get('/dashboard')]);

      expect(primeira.balanceCents).toBe(80_000);
      expect(segunda.balanceCents).toBe(80_000);
      expect(a.statusCode).toBe(200);
      expect(b.statusCode).toBe(200);
      const created = (await user.listAll()).filter((t) => t.recurringId === rule.id);
      expect(created.map((t) => t.transactionDate).sort()).toEqual([
        user.today(-10),
        user.today(-3),
      ]);
      expect(created.every((t) => t.status === 'completed')).toBe(true);
    });

    it('não materializa ocorrência futura, valor variável nem regra sem auto-confirmação', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      await weekly(user, account.id, user.today(4), { autoConfirm: true }); // só futuro
      await weekly(user, account.id, user.today(-3), { name: 'Manual' }); // sem autoConfirm

      await user.get('/dashboard');

      expect(await user.listAll()).toEqual([]);
      expect(await user.balanceOf(account.id)).toBe(100_000);
    });

    it('ocorrência já pulada não é recriada pela auto-confirmação', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const rule = await weekly(user, account.id, user.today(-3), { autoConfirm: true });
      // Auto-confirmação roda em qualquer GET; pula antes de consultar nada.
      await user.ok(user.post(`/recurring/${rule.id}/occurrences/${user.today(-3)}/skip`), 201);

      await user.get('/accounts');

      expect(await user.balanceOf(account.id)).toBe(100_000);
      expect((await user.listAll('&status=completed')).length).toBe(0);
    });
  });

  describe('isolamento entre usuários', () => {
    it('outro usuário não vê, edita nem confirma a recorrência', async () => {
      const owner = await registerUser(env.app);
      const intruder = await registerUser(env.app);
      const account = await owner.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const rule = await weekly(owner, account.id, owner.today(-3));

      expect((await intruder.get(`/recurring/${rule.id}`)).statusCode).toBe(404);
      expect((await intruder.patch(`/recurring/${rule.id}`, { name: 'x' })).statusCode).toBe(404);
      expect(
        (await intruder.post(`/recurring/${rule.id}/occurrences/${owner.today(-3)}/confirm`))
          .statusCode,
      ).toBe(404);
      expect((await intruder.post(`/recurring/${rule.id}/deactivate`)).statusCode).toBe(404);
      expect(await occurrences(intruder)).toEqual([]);
      const d = await dashboard(intruder, intruder.today(10));
      expect(d.availableToSpend.components.forecastExpensesCents).toBe(0);
      expect(await owner.balanceOf(account.id)).toBe(100_000);
    });
  });
});
