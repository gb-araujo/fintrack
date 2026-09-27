import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLedgerTestEnv,
  databaseUrl,
  registerUser,
  type LedgerTestEnv,
  type TestClient,
} from '../../test/ledger-client.js';

describe.skipIf(!databaseUrl)('investimentos (integração)', () => {
  let env: LedgerTestEnv;

  beforeAll(async () => {
    env = await createLedgerTestEnv();
  });
  afterAll(async () => {
    await env.close();
  });

  async function setup() {
    const user: TestClient = await registerUser(env.app);
    const inter = await user.createAccount({ name: 'Inter', initialBalanceCents: 1_000_000 });
    const invest = await user.createAccount({ name: 'CDB Banco X', type: 'investment' });
    return { user, inter, invest };
  }

  describe('sem avaliação', () => {
    it('saldo = aportes; rendimento desconhecido (null)', async () => {
      const { user, inter, invest } = await setup();
      await user.transfer({ fromAccountId: inter.id, toAccountId: invest.id, amountCents: 100_000 });

      const { items } = await user.investments();
      expect(items).toEqual([
        expect.objectContaining({
          accountId: invest.id,
          accountName: 'CDB Banco X',
          institution: null,
          product: null,
          balanceCents: 100_000,
          netContributedCents: 100_000,
          latestValuationDate: null,
          totalYieldCents: null,
          totalYieldPercent: null,
        }),
      ]);
    });

    it('não lista contas comuns nem de outro usuário', async () => {
      const { user, invest } = await setup();
      const intruder = await registerUser(env.app);
      await intruder.createAccount({ name: 'Outro CDB', type: 'investment' });

      const { items } = await user.investments();
      expect(items.map((item) => item.accountId)).toEqual([invest.id]);
    });
  });

  describe('avaliações preservam histórico e derivam o rendimento', () => {
    it('primeira avaliação: sem rendimento (não há avaliação anterior)', async () => {
      const { user, inter, invest } = await setup();
      await user.transfer({ fromAccountId: inter.id, toAccountId: invest.id, amountCents: 100_000 });

      const valuation = await user.upsertValuation(invest.id, { balanceCents: 105_000 });

      expect(valuation).toMatchObject({
        balanceCents: 105_000,
        contributedCents: 100_000,
        yieldCents: null,
        yieldPercent: null,
      });
    });

    it('segunda avaliação: rendimento = Δsaldo − aportes líquidos no intervalo', async () => {
      const { user, inter, invest } = await setup();
      await user.transfer({
        fromAccountId: inter.id,
        toAccountId: invest.id,
        amountCents: 100_000,
        transferDate: user.today(-15),
      });
      await user.upsertValuation(invest.id, { date: user.today(-10), balanceCents: 100_000 });

      // Mais um aporte e um resgate entre as duas avaliações.
      await user.transfer({
        fromAccountId: inter.id,
        toAccountId: invest.id,
        amountCents: 20_000,
        transferDate: user.today(-5),
      });
      await user.transfer({
        fromAccountId: invest.id,
        toAccountId: inter.id,
        amountCents: 5_000,
        transferDate: user.today(-5),
      });

      // Saldo real ficaria em 115.000 só de aportes; a avaliação diz 120.000 → 5.000 de rendimento.
      const valuation = await user.upsertValuation(invest.id, { balanceCents: 120_000 });

      expect(valuation).toMatchObject({
        balanceCents: 120_000,
        contributedCents: 15_000, // +20.000 − 5.000
        yieldCents: 5_000, // 120.000 − 100.000 − 15.000
        yieldPercent: 5, // 5.000 / 100.000
      });

      const summary = (await user.investments()).items[0];
      expect(summary).toMatchObject({
        balanceCents: 120_000,
        latestValuationDate: user.today(),
        totalYieldCents: 5_000,
        totalYieldPercent: 5,
      });
    });

    it('corrigir uma avaliação (mesma data) nunca duplica — e recalcula o rendimento seguinte', async () => {
      const { user, inter, invest } = await setup();
      const firstDate = user.today(-10);
      await user.transfer({
        fromAccountId: inter.id,
        toAccountId: invest.id,
        amountCents: 100_000,
        transferDate: user.today(-15),
      });
      await user.upsertValuation(invest.id, { date: firstDate, balanceCents: 100_000 });
      await user.upsertValuation(invest.id, { balanceCents: 110_000 });

      let history = await user.valuations(invest.id);
      expect(history.items).toHaveLength(2);
      expect(history.items[1]?.yieldCents).toBe(10_000);

      // Usuário percebe que a primeira avaliação estava errada e corrige.
      await user.upsertValuation(invest.id, { date: firstDate, balanceCents: 95_000 });

      history = await user.valuations(invest.id);
      expect(history.items).toHaveLength(2); // ainda 2: corrigiu, não duplicou
      expect(history.items[0]?.balanceCents).toBe(95_000);
      expect(history.items[1]?.yieldCents).toBe(15_000); // 110.000 − 95.000 − 0
    });

    it('remove uma avaliação do histórico', async () => {
      const { user, inter, invest } = await setup();
      await user.transfer({ fromAccountId: inter.id, toAccountId: invest.id, amountCents: 100_000 });
      const valuation = await user.upsertValuation(invest.id, { balanceCents: 100_000 });

      expect(
        (await user.delete(`/investments/${invest.id}/valuations/${valuation.id}`)).statusCode,
      ).toBe(204);

      const history = await user.valuations(invest.id);
      expect(history.items).toEqual([]);
    });
  });

  describe('instituição e produto', () => {
    it('atualiza e reflete no resumo', async () => {
      const { user, invest } = await setup();

      const summary = await user.ok(
        user.patch(`/investments/${invest.id}`, { institution: 'Banco X', product: 'CDB 120% CDI' }),
      );

      expect(summary).toMatchObject({ institution: 'Banco X', product: 'CDB 120% CDI' });
    });

    it('sem nenhum campo → 400', async () => {
      const { user, invest } = await setup();
      await user.ok(user.patch(`/investments/${invest.id}`, {}), 400);
    });
  });

  describe('validações', () => {
    it('conta que não é investimento → 422', async () => {
      const { user, inter } = await setup();
      await user.ok(
        user.put(`/investments/${inter.id}/valuations`, { date: user.today(), balanceCents: 1_000 }),
        422,
      );
    });

    it('conta de outro usuário → 404', async () => {
      const { invest } = await setup();
      const intruder = await registerUser(env.app);
      await intruder.ok(
        intruder.put(`/investments/${invest.id}/valuations`, {
          date: intruder.today(),
          balanceCents: 1,
        }),
        404,
      );
    });

    it('conta arquivada → 409', async () => {
      const { user, invest } = await setup();
      await user.ok(user.post(`/accounts/${invest.id}/archive`), 200);
      await user.ok(
        user.put(`/investments/${invest.id}/valuations`, {
          date: user.today(),
          balanceCents: 1_000,
        }),
        409,
      );
    });

    it('data futura → 422', async () => {
      const { user, invest } = await setup();
      await user.ok(
        user.put(`/investments/${invest.id}/valuations`, {
          date: user.today(1),
          balanceCents: 1_000,
        }),
        422,
      );
    });

    it('saldo negativo → 400', async () => {
      const { user, invest } = await setup();
      await user.ok(
        user.put(`/investments/${invest.id}/valuations`, { date: user.today(), balanceCents: -1 }),
        400,
      );
    });
  });
});
