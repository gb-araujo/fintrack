import type { Account, Transaction } from '@fintrack/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLedgerTestEnv,
  databaseUrl,
  registerUser,
  type LedgerTestEnv,
} from '../../test/ledger-client.js';

describe.skipIf(!databaseUrl)('lançamentos (integração)', () => {
  let env: LedgerTestEnv;

  beforeAll(async () => {
    env = await createLedgerTestEnv();
  });
  afterAll(async () => {
    await env.close();
  });

  describe('saldo da conta', () => {
    it('receita soma, despesa subtrai; valores em centavos exatos', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 250_000 });

      await user.addTransaction({ accountId: account.id, type: 'income', amountCents: 500_000 });
      await user.addTransaction({ accountId: account.id, type: 'expense', amountCents: 9_099 });
      await user.addTransaction({ accountId: account.id, type: 'expense', amountCents: 7_699 });

      expect(await user.balanceOf(account.id)).toBe(250_000 + 500_000 - 9_099 - 7_699);
    });

    it('pendente (previsão) e cancelado não alteram o saldo; efetivar passa a contar', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });

      const pending = await user.addTransaction({
        accountId: account.id,
        type: 'expense',
        amountCents: 30_000,
        status: 'pending',
      });
      expect(pending.status).toBe('pending');
      expect(await user.balanceOf(account.id)).toBe(100_000);

      const completed = await user.ok<Transaction>(
        user.post(`/transactions/${pending.id}/complete`),
      );
      expect(completed.status).toBe('completed');
      expect(await user.balanceOf(account.id)).toBe(70_000);

      const cancelled = await user.ok<Transaction>(user.post(`/transactions/${pending.id}/cancel`));
      expect(cancelled.status).toBe('cancelled');
      expect(await user.balanceOf(account.id)).toBe(100_000);
    });
  });

  describe('regra do tempo (status × data, no fuso do usuário)', () => {
    it('sem status informado: hoje = efetivado, amanhã = pendente', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });

      const now = await user.addTransaction({
        accountId: account.id,
        type: 'income',
        amountCents: 100,
      });
      const tomorrow = await user.addTransaction({
        accountId: account.id,
        type: 'income',
        amountCents: 100,
        transactionDate: user.today(1),
      });

      expect(now.status).toBe('completed');
      expect(tomorrow.status).toBe('pending');
    });

    it('efetivado com data futura → 422 (BUSINESS_RULE_VIOLATION)', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });

      const response = await user.post('/transactions', {
        accountId: account.id,
        type: 'expense',
        amountCents: 100,
        transactionDate: user.today(1),
        status: 'completed',
      });

      expect(response.statusCode).toBe(422);
      expect(response.json()).toMatchObject({ error: { code: 'BUSINESS_RULE_VIOLATION' } });
    });

    it('"hoje" depende do fuso do usuário, não do servidor', async () => {
      // UTC+14 e UTC−11 estão 25 h apart: o "hoje" de um é sempre futuro para o outro.
      const kiritimati = await registerUser(env.app, 'Pacific/Kiritimati');
      const pagoPago = await registerUser(env.app, 'Pacific/Pago_Pago');
      const ahead = kiritimati.today();
      expect(ahead > pagoPago.today()).toBe(true);

      const aheadAccount = await kiritimati.createAccount({ name: 'Conta' });
      const behindAccount = await pagoPago.createAccount({ name: 'Conta' });
      const payload = (accountId: string) => ({
        accountId,
        type: 'expense',
        amountCents: 500,
        transactionDate: ahead,
        status: 'completed',
      });

      expect((await kiritimati.post('/transactions', payload(aheadAccount.id))).statusCode).toBe(
        201,
      );
      expect((await pagoPago.post('/transactions', payload(behindAccount.id))).statusCode).toBe(
        422,
      );
    });

    it('efetivar pendente futuro exige informar a data real (até hoje)', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 10_000 });
      const boleto = await user.addTransaction({
        accountId: account.id,
        type: 'expense',
        amountCents: 4_000,
        transactionDate: user.today(10),
      });

      expect((await user.post(`/transactions/${boleto.id}/complete`)).statusCode).toBe(422);
      expect(
        (await user.post(`/transactions/${boleto.id}/complete`, { transactionDate: user.today(1) }))
          .statusCode,
      ).toBe(422);

      const paid = await user.ok<Transaction>(
        user.post(`/transactions/${boleto.id}/complete`, { transactionDate: user.today() }),
      );
      expect(paid).toMatchObject({ status: 'completed', transactionDate: user.today() });
      expect(await user.balanceOf(account.id)).toBe(6_000);
    });

    it('efetivar e cancelar são idempotentes; cancelado é definitivo', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const tx = await user.addTransaction({
        accountId: account.id,
        type: 'income',
        amountCents: 100,
      });

      await user.ok(user.post(`/transactions/${tx.id}/complete`));
      await user.ok(user.post(`/transactions/${tx.id}/cancel`));
      await user.ok(user.post(`/transactions/${tx.id}/cancel`));

      expect((await user.post(`/transactions/${tx.id}/complete`)).statusCode).toBe(409);
      expect((await user.patch(`/transactions/${tx.id}`, { description: 'x' })).statusCode).toBe(
        409,
      );
    });
  });

  describe('regras de conta e categoria', () => {
    it('conta de investimento não aceita receita nem despesa (só transferência)', async () => {
      const user = await registerUser(env.app);
      const investment = await user.createAccount({ name: 'Tesouro', type: 'investment' });

      for (const type of ['income', 'expense']) {
        const response = await user.post('/transactions', {
          accountId: investment.id,
          type,
          amountCents: 100,
          transactionDate: user.today(),
        });
        expect(response.statusCode).toBe(422);
      }
    });

    it('conta arquivada não recebe lançamentos → 409', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Antiga' });
      await user.ok(user.post(`/accounts/${account.id}/archive`));

      const response = await user.post('/transactions', {
        accountId: account.id,
        type: 'expense',
        amountCents: 100,
        transactionDate: user.today(),
      });
      expect(response.statusCode).toBe(409);
    });

    it('a categoria precisa ser do mesmo tipo do lançamento', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const salary = await user.categoryId('Salário', 'income');
      const food = await user.categoryId('Alimentação', 'expense');

      const ok = await user.addTransaction({
        accountId: account.id,
        type: 'income',
        amountCents: 100,
        categoryId: salary,
      });
      expect(ok.categoryId).toBe(salary);

      const wrong = await user.post('/transactions', {
        accountId: account.id,
        type: 'income',
        amountCents: 100,
        transactionDate: user.today(),
        categoryId: food,
      });
      expect(wrong.statusCode).toBe(422);
    });

    it('categoria arquivada é recusada; lançamentos antigos mantêm a categoria', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const category = await user.categoryId('Lazer', 'expense');
      const tx = await user.addTransaction({
        accountId: account.id,
        type: 'expense',
        amountCents: 100,
        categoryId: category,
      });

      await user.ok(user.post(`/categories/${category}/archive`));

      const again = await user.post('/transactions', {
        accountId: account.id,
        type: 'expense',
        amountCents: 100,
        transactionDate: user.today(),
        categoryId: category,
      });
      expect(again.statusCode).toBe(409);
      expect((await user.ok<Transaction>(user.get(`/transactions/${tx.id}`))).categoryId).toBe(
        category,
      );
    });
  });

  describe('edição', () => {
    it('edita valor, descrição, data, categoria e forma de pagamento; o saldo acompanha', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const other = await user.createAccount({ name: 'Carteira' });
      const category = await user.categoryId('Transporte', 'expense');
      const tx = await user.addTransaction({
        accountId: account.id,
        type: 'expense',
        amountCents: 5_000,
      });

      const updated = await user.ok<Transaction>(
        user.patch(`/transactions/${tx.id}`, {
          amountCents: 7_500,
          description: 'Uber',
          categoryId: category,
          paymentMethod: 'pix',
          accountId: other.id,
        }),
      );

      expect(updated).toMatchObject({
        amountCents: 7_500,
        description: 'Uber',
        categoryId: category,
        paymentMethod: 'pix',
        accountId: other.id,
        type: 'expense',
      });
      expect(await user.balanceOf(account.id)).toBe(100_000);
      expect(await user.balanceOf(other.id)).toBe(-7_500);

      const cleared = await user.ok<Transaction>(
        user.patch(`/transactions/${tx.id}`, { categoryId: null }),
      );
      expect(cleared.categoryId).toBeNull();
    });

    it('lançamento efetivado não pode ganhar data futura', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const tx = await user.addTransaction({
        accountId: account.id,
        type: 'expense',
        amountCents: 100,
      });

      const response = await user.patch(`/transactions/${tx.id}`, {
        transactionDate: user.today(3),
      });
      expect(response.statusCode).toBe(422);
    });

    it('atualização vazia → 400', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const tx = await user.addTransaction({
        accountId: account.id,
        type: 'expense',
        amountCents: 100,
      });
      expect((await user.patch(`/transactions/${tx.id}`, {})).statusCode).toBe(400);
    });
  });

  describe('listagem', () => {
    it('ordena do mais recente ao mais antigo e pagina por cursor sem repetir nem perder itens', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const created: Transaction[] = [];
      for (let i = 0; i < 12; i++) {
        created.push(
          await user.addTransaction({
            accountId: account.id,
            type: 'expense',
            amountCents: 100 + i,
            // Várias na mesma data: o desempate por criação/id precisa ser estável.
            transactionDate: user.today(-(i % 4)),
          }),
        );
      }

      const collected: Transaction[] = [];
      let cursor: string | null = null;
      let pages = 0;
      do {
        const page: { items: Transaction[]; nextCursor: string | null } = await user.ok(
          user.get(`/transactions?limit=5${cursor ? `&cursor=${cursor}` : ''}`),
        );
        expect(page.items.length).toBeLessThanOrEqual(5);
        collected.push(...page.items);
        cursor = page.nextCursor;
        pages++;
      } while (cursor);

      expect(pages).toBe(3);
      expect(new Set(collected.map((t) => t.id)).size).toBe(12);
      expect(collected.map((t) => t.id).sort()).toEqual(created.map((t) => t.id).sort());
      const dates = collected.map((t) => t.transactionDate);
      expect(dates).toEqual([...dates].sort().reverse());
    });

    it('filtros: conta, tipo, status, período, categoria e busca por texto', async () => {
      const user = await registerUser(env.app);
      const a = await user.createAccount({ name: 'A' });
      const b = await user.createAccount({ name: 'B' });
      const food = await user.categoryId('Alimentação', 'expense');
      await user.addTransaction({
        accountId: a.id,
        type: 'expense',
        amountCents: 100,
        categoryId: food,
        description: 'Mercado do bairro',
      });
      await user.addTransaction({
        accountId: b.id,
        type: 'income',
        amountCents: 200,
        description: 'Salário',
      });
      await user.addTransaction({
        accountId: b.id,
        type: 'expense',
        amountCents: 300,
        status: 'pending',
        transactionDate: user.today(5),
        description: '100% desconto',
      });

      const ids = async (query: string) =>
        (await user.listAll(query)).map((t) => t.amountCents).sort();

      expect(await ids(`&accountId=${a.id}`)).toEqual([100]);
      expect(await ids('&type=income')).toEqual([200]);
      expect(await ids('&status=pending')).toEqual([300]);
      expect(await ids(`&categoryId=${food}`)).toEqual([100]);
      expect(await ids(`&from=${user.today(1)}`)).toEqual([300]);
      expect(await ids(`&to=${user.today()}`)).toEqual([100, 200]);
      expect(await ids('&q=mercado')).toEqual([100]);
      // "%" é literal, não curinga.
      expect(await ids('&q=100%25')).toEqual([300]);
      expect(await ids('&q=%25')).toEqual([300]);
    });

    it('cancelados ficam ocultos, a menos que se peça', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const keep = await user.addTransaction({
        accountId: account.id,
        type: 'income',
        amountCents: 100,
      });
      const drop = await user.addTransaction({
        accountId: account.id,
        type: 'income',
        amountCents: 200,
      });
      await user.ok(user.post(`/transactions/${drop.id}/cancel`));

      expect((await user.listAll()).map((t) => t.id)).toEqual([keep.id]);
      expect((await user.listAll('&includeCancelled=true')).map((t) => t.id).sort()).toEqual(
        [keep.id, drop.id].sort(),
      );
      expect((await user.listAll('&status=cancelled')).map((t) => t.id)).toEqual([drop.id]);
    });

    it('cursor adulterado → 400; limite acima de 100 → 400', async () => {
      const user = await registerUser(env.app);
      expect((await user.get('/transactions?cursor=lixo')).statusCode).toBe(400);
      expect((await user.get('/transactions?limit=101')).statusCode).toBe(400);
    });
  });

  it('valores inválidos: zero, negativo e fracionado → 400', async () => {
    const user = await registerUser(env.app);
    const account: Account = await user.createAccount({ name: 'Inter' });
    for (const amountCents of [0, -5, 10.5]) {
      const response = await user.post('/transactions', {
        accountId: account.id,
        type: 'expense',
        amountCents,
        transactionDate: user.today(),
      });
      expect(response.statusCode, String(amountCents)).toBe(400);
    }
  });
});
