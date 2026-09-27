import type { Transaction, Transfer } from '@fintrack/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLedgerTestEnv,
  databaseUrl,
  registerUser,
  type LedgerTestEnv,
  type TestClient,
} from '../../test/ledger-client.js';

describe.skipIf(!databaseUrl)('transferências (integração)', () => {
  let env: LedgerTestEnv;

  beforeAll(async () => {
    env = await createLedgerTestEnv();
  });
  afterAll(async () => {
    await env.close();
  });

  /** Inter (R$ 1.000) e Mercado Pago (R$ 50) — exemplo do enunciado do projeto. */
  async function setup() {
    const user: TestClient = await registerUser(env.app);
    const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 100_000 });
    const mercadoPago = await user.createAccount({
      name: 'Mercado Pago',
      type: 'wallet',
      initialBalanceCents: 5_000,
    });
    return { user, inter, mercadoPago };
  }

  it('Inter → Mercado Pago move o dinheiro e o total continua o mesmo', async () => {
    const { user, inter, mercadoPago } = await setup();
    const totalBefore = await user.totalBalance();

    await user.transfer({
      fromAccountId: inter.id,
      toAccountId: mercadoPago.id,
      amountCents: 30_000,
    });

    expect(await user.balanceOf(inter.id)).toBe(70_000);
    expect(await user.balanceOf(mercadoPago.id)).toBe(35_000);
    expect(await user.totalBalance()).toBe(totalBefore);
  });

  it('gera exatamente duas pernas, sem categoria, com direção e transferência vinculada', async () => {
    const { user, inter, mercadoPago } = await setup();
    const transfer = await user.transfer({
      fromAccountId: inter.id,
      toAccountId: mercadoPago.id,
      amountCents: 12_345,
    });

    const legs = (await user.listAll()).filter((t) => t.transfer?.id === transfer.id);

    expect(legs).toHaveLength(2);
    const out = legs.find((t) => t.transfer?.direction === 'out') as Transaction;
    const inLeg = legs.find((t) => t.transfer?.direction === 'in') as Transaction;
    expect(out).toMatchObject({
      accountId: inter.id,
      type: 'transfer',
      categoryId: null,
      amountCents: 12_345,
    });
    expect(inLeg).toMatchObject({ accountId: mercadoPago.id, type: 'transfer', categoryId: null });
    expect(out.transfer).toMatchObject({ fromAccountId: inter.id, toAccountId: mercadoPago.id });
  });

  it('transferência não é despesa nem receita: some dos filtros de receita/despesa', async () => {
    const { user, inter, mercadoPago } = await setup();
    await user.transfer({
      fromAccountId: inter.id,
      toAccountId: mercadoPago.id,
      amountCents: 1_000,
    });
    await user.addTransaction({ accountId: mercadoPago.id, type: 'expense', amountCents: 200 });

    expect((await user.listAll('&type=expense')).map((t) => t.amountCents)).toEqual([200]);
    expect(await user.listAll('&type=income')).toHaveLength(0);
    expect(await user.listAll('&type=transfer')).toHaveLength(2);
  });

  it('compra no Mercado Pago com o saldo transferido é despesa da conta Mercado Pago', async () => {
    const { user, inter, mercadoPago } = await setup();
    await user.transfer({
      fromAccountId: inter.id,
      toAccountId: mercadoPago.id,
      amountCents: 20_000,
    });
    await user.addTransaction({ accountId: mercadoPago.id, type: 'expense', amountCents: 8_000 });

    expect(await user.balanceOf(inter.id)).toBe(80_000);
    expect(await user.balanceOf(mercadoPago.id)).toBe(5_000 + 20_000 - 8_000);
  });

  it('aplicação e resgate: transferência de/para conta de investimento (não é despesa nem receita)', async () => {
    const { user, inter } = await setup();
    const tesouro = await user.createAccount({ name: 'Tesouro Selic', type: 'investment' });

    await user.transfer({ fromAccountId: inter.id, toAccountId: tesouro.id, amountCents: 40_000 });
    expect(await user.balanceOf(tesouro.id)).toBe(40_000);
    await user.transfer({ fromAccountId: tesouro.id, toAccountId: inter.id, amountCents: 10_000 });

    expect(await user.balanceOf(inter.id)).toBe(100_000 - 40_000 + 10_000);
    expect(await user.balanceOf(tesouro.id)).toBe(30_000);
    expect(await user.listAll('&type=expense')).toHaveLength(0);
    expect(await user.listAll('&type=income')).toHaveLength(0);
  });

  it('pendente não move saldo; efetivar move as duas contas juntas', async () => {
    const { user, inter, mercadoPago } = await setup();
    const transfer = await user.transfer({
      fromAccountId: inter.id,
      toAccountId: mercadoPago.id,
      amountCents: 30_000,
      status: 'pending',
    });
    expect(await user.balanceOf(inter.id)).toBe(100_000);
    expect(await user.balanceOf(mercadoPago.id)).toBe(5_000);

    const done = await user.ok<Transfer>(user.post(`/transfers/${transfer.id}/complete`));

    expect(done.status).toBe('completed');
    expect(await user.balanceOf(inter.id)).toBe(70_000);
    expect(await user.balanceOf(mercadoPago.id)).toBe(35_000);
  });

  it('cancelar desfaz as duas pernas e o saldo volta ao original', async () => {
    const { user, inter, mercadoPago } = await setup();
    const transfer = await user.transfer({
      fromAccountId: inter.id,
      toAccountId: mercadoPago.id,
      amountCents: 30_000,
    });

    const cancelled = await user.ok<Transfer>(user.post(`/transfers/${transfer.id}/cancel`));

    expect(cancelled.status).toBe('cancelled');
    expect(await user.balanceOf(inter.id)).toBe(100_000);
    expect(await user.balanceOf(mercadoPago.id)).toBe(5_000);
    const legs = (await user.listAll('&includeCancelled=true')).filter((t) => t.transfer);
    expect(legs.map((t) => t.status)).toEqual(['cancelled', 'cancelled']);
    // Idempotente; e cancelada não volta atrás.
    await user.ok(user.post(`/transfers/${transfer.id}/cancel`));
    expect((await user.post(`/transfers/${transfer.id}/complete`)).statusCode).toBe(409);
    expect((await user.patch(`/transfers/${transfer.id}`, { amountCents: 1 })).statusCode).toBe(
      409,
    );
  });

  it('editar valor, data e contas atualiza as duas pernas de uma vez', async () => {
    const { user, inter, mercadoPago } = await setup();
    const nubank = await user.createAccount({ name: 'Nubank', initialBalanceCents: 0 });
    const transfer = await user.transfer({
      fromAccountId: inter.id,
      toAccountId: mercadoPago.id,
      amountCents: 30_000,
    });

    const updated = await user.ok<Transfer>(
      user.patch(`/transfers/${transfer.id}`, {
        amountCents: 10_000,
        toAccountId: nubank.id,
        description: 'Ajuste',
        transferDate: user.today(-2),
      }),
    );

    expect(updated).toMatchObject({
      amountCents: 10_000,
      toAccountId: nubank.id,
      description: 'Ajuste',
    });
    expect(await user.balanceOf(inter.id)).toBe(90_000);
    expect(await user.balanceOf(mercadoPago.id)).toBe(5_000);
    expect(await user.balanceOf(nubank.id)).toBe(10_000);
    const legs = (await user.listAll()).filter((t) => t.transfer?.id === transfer.id);
    expect(legs).toHaveLength(2);
    expect(new Set(legs.map((l) => l.transactionDate))).toEqual(new Set([user.today(-2)]));
  });

  it('as pernas não podem ser mexidas isoladamente pelas rotas de lançamento', async () => {
    const { user, inter, mercadoPago } = await setup();
    await user.transfer({
      fromAccountId: inter.id,
      toAccountId: mercadoPago.id,
      amountCents: 1_000,
    });
    const [leg] = (await user.listAll()).filter((t) => t.transfer);
    const id = (leg as Transaction).id;

    expect((await user.patch(`/transactions/${id}`, { amountCents: 5 })).statusCode).toBe(409);
    expect((await user.post(`/transactions/${id}/cancel`)).statusCode).toBe(409);
    expect((await user.post(`/transactions/${id}/complete`)).statusCode).toBe(409);
  });

  describe('validações', () => {
    it('origem igual ao destino → 400', async () => {
      const { user, inter } = await setup();
      const response = await user.post('/transfers', {
        fromAccountId: inter.id,
        toAccountId: inter.id,
        amountCents: 100,
        transferDate: user.today(),
      });
      expect(response.statusCode).toBe(400);
    });

    it('editar para origem = destino → 422', async () => {
      const { user, inter, mercadoPago } = await setup();
      const transfer = await user.transfer({
        fromAccountId: inter.id,
        toAccountId: mercadoPago.id,
        amountCents: 100,
      });
      expect(
        (await user.patch(`/transfers/${transfer.id}`, { toAccountId: inter.id })).statusCode,
      ).toBe(422);
    });

    it('efetivada com data futura → 422', async () => {
      const { user, inter, mercadoPago } = await setup();
      const response = await user.post('/transfers', {
        fromAccountId: inter.id,
        toAccountId: mercadoPago.id,
        amountCents: 100,
        transferDate: user.today(2),
        status: 'completed',
      });
      expect(response.statusCode).toBe(422);
    });

    it('conta arquivada → 409; conta inexistente → 404', async () => {
      const { user, inter, mercadoPago } = await setup();
      await user.ok(user.post(`/accounts/${mercadoPago.id}/archive`));

      const archived = await user.post('/transfers', {
        fromAccountId: inter.id,
        toAccountId: mercadoPago.id,
        amountCents: 100,
        transferDate: user.today(),
      });
      const missing = await user.post('/transfers', {
        fromAccountId: inter.id,
        toAccountId: '00000000-0000-4000-8000-000000000000',
        amountCents: 100,
        transferDate: user.today(),
      });

      expect(archived.statusCode).toBe(409);
      expect(missing.statusCode).toBe(404);
    });

    it('valor zero, negativo ou fracionado → 400', async () => {
      const { user, inter, mercadoPago } = await setup();
      for (const amountCents of [0, -1, 2.5]) {
        const response = await user.post('/transfers', {
          fromAccountId: inter.id,
          toAccountId: mercadoPago.id,
          amountCents,
          transferDate: user.today(),
        });
        expect(response.statusCode, String(amountCents)).toBe(400);
      }
    });
  });
});
