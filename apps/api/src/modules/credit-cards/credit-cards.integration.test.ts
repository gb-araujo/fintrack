import {
  addDaysToDate,
  budgetListResponseSchema,
  creditCardSchema,
  dashboardSchema,
  invoiceDetailSchema,
  invoiceListResponseSchema,
  startOfMonth,
  type CreditCard,
  type Dashboard,
  type InvoiceDetail,
  type InvoiceSummary,
  type Purchase,
  type Transaction,
} from '@fintrack/shared';
import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLedgerTestEnv,
  databaseUrl,
  registerUser,
  type LedgerTestEnv,
  type TestClient,
} from '../../test/ledger-client.js';

/**
 * Cartão: fechamento dia 28 e vencimento dia 5 (vencimento no mês SEGUINTE ao fechamento). Uma compra
 * feita em `oldPurchaseDate` (5 dias antes do início do mês) cai na fatura que fecha no dia 28 do mês
 * anterior e vence no dia 5 do mês corrente — para qualquer "hoje". Uma compra feita hoje cai sempre
 * em fatura ainda ABERTA (fecha hoje ou depois).
 */
describe.skipIf(!databaseUrl)('cartão de crédito, faturas e parcelas (integração)', () => {
  let env: LedgerTestEnv;

  beforeAll(async () => {
    env = await createLedgerTestEnv();
  });
  afterAll(async () => {
    await env.close();
  });

  const currentMonth = (user: TestClient) => user.today().slice(0, 7);
  const oldPurchaseDate = (user: TestClient) => addDaysToDate(startOfMonth(user.today()), -5);

  function createCard(user: TestClient, extra: Record<string, unknown> = {}) {
    return user.ok<CreditCard>(
      user.post('/credit-cards', {
        name: 'Nubank',
        limitCents: 500_000,
        closingDay: 28,
        dueDay: 5,
        ...extra,
      }),
      201,
    );
  }

  function buy(
    user: TestClient,
    cardId: string,
    input: { totalAmountCents: number; installmentsCount?: number } & Record<string, unknown>,
  ) {
    return user.ok<Purchase>(
      user.post(`/credit-cards/${cardId}/purchases`, {
        description: 'Notebook',
        purchaseDate: user.today(),
        ...input,
      }),
      201,
    );
  }

  const invoices = async (user: TestClient, cardId: string) =>
    invoiceListResponseSchema.parse(await user.ok(user.get(`/credit-cards/${cardId}/invoices`)))
      .items;
  const invoice = async (user: TestClient, id: string) =>
    invoiceDetailSchema.parse(await user.ok(user.get(`/invoices/${id}`)));
  const card = async (user: TestClient, id: string) =>
    creditCardSchema.parse(await user.ok(user.get(`/credit-cards/${id}`)));
  const dashboard = async (user: TestClient, until = user.today(400)) =>
    dashboardSchema.parse(await user.ok(user.get(`/dashboard?until=${until}`)));
  const pay = (user: TestClient, invoiceId: string, body: Record<string, unknown>) =>
    user.post(`/invoices/${invoiceId}/payments`, body);

  describe('cartões', () => {
    it('cadastra o cartão sem criar lançamentos nem mexer em contas', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });

      const created = await createCard(user, { paymentAccountId: account.id });

      expect(created).toMatchObject({
        name: 'Nubank',
        limitCents: 500_000,
        closingDay: 28,
        dueDay: 5,
        paymentAccountId: account.id,
        usedLimitCents: 0,
        availableLimitCents: 500_000,
        openInvoice: null,
        archivedAt: null,
      });
      expect(await user.listAll()).toEqual([]);
      expect(await user.balanceOf(account.id)).toBe(100_000);
    });

    it('valida os campos e a conta de pagamento', async () => {
      const user = await registerUser(env.app);
      const other = await registerUser(env.app);
      const invest = await user.createAccount({ name: 'CDB', type: 'investment' });
      const foreign = await other.createAccount({ name: 'Dela' });
      const base = { name: 'X', limitCents: 100_000, closingDay: 10, dueDay: 20 };

      const post = (body: Record<string, unknown>) => user.post('/credit-cards', body);

      expect((await post({ ...base, closingDay: 32 })).statusCode).toBe(400);
      expect((await post({ ...base, dueDay: 0 })).statusCode).toBe(400);
      expect((await post({ ...base, limitCents: 0 })).statusCode).toBe(400);
      expect((await post({ ...base, name: '  ' })).statusCode).toBe(400);
      expect((await post({ ...base, paymentAccountId: invest.id })).statusCode).toBe(422);
      expect((await post({ ...base, paymentAccountId: foreign.id })).statusCode).toBe(404);
    });

    it('nome único entre cartões ativos; arquivado libera o nome', async () => {
      const user = await registerUser(env.app);
      const first = await createCard(user);

      expect(
        (
          await user.post('/credit-cards', {
            name: 'nubank',
            limitCents: 1,
            closingDay: 1,
            dueDay: 2,
          })
        ).statusCode,
      ).toBe(409);
      await user.ok(user.post(`/credit-cards/${first.id}/archive`));
      await createCard(user);

      const active = await user.ok<{ items: CreditCard[] }>(user.get('/credit-cards'));
      const all = await user.ok<{ items: CreditCard[] }>(
        user.get('/credit-cards?includeArchived=true'),
      );
      expect(active.items).toHaveLength(1);
      expect(all.items).toHaveLength(2);
    });

    it('edita nome, limite e dias; cartão arquivado não recebe compras', async () => {
      const user = await registerUser(env.app);
      const created = await createCard(user);

      const edited = await user.ok<CreditCard>(
        user.patch(`/credit-cards/${created.id}`, {
          name: 'Nubank Ultravioleta',
          limitCents: 800_000,
        }),
      );
      await user.ok(user.post(`/credit-cards/${created.id}/archive`));
      const blocked = await user.post(`/credit-cards/${created.id}/purchases`, {
        description: 'X',
        purchaseDate: user.today(),
        totalAmountCents: 1_000,
      });

      expect(edited).toMatchObject({ name: 'Nubank Ultravioleta', limitCents: 800_000 });
      expect(blocked.statusCode).toBe(409);
    });
  });

  describe('compras e parcelas', () => {
    it('R$ 900 em 3x: três parcelas de R$ 300, uma por fatura, em meses consecutivos', async () => {
      const user = await registerUser(env.app);
      const created = await createCard(user);

      const purchase = await buy(user, created.id, {
        totalAmountCents: 90_000,
        installmentsCount: 3,
      });

      expect(purchase.installments.map((item) => item.amountCents)).toEqual([
        30_000, 30_000, 30_000,
      ]);
      expect(purchase.installments.map((item) => item.installmentNumber)).toEqual([1, 2, 3]);
      const months = purchase.installments.map((item) => item.referenceMonth);
      expect(new Set(months).size).toBe(3);
      expect([...months].sort()).toEqual(months);
      const list = await invoices(user, created.id);
      expect(list).toHaveLength(3);
      expect(list.every((item) => item.totalCents === 30_000)).toBe(true);
    });

    it('resto dos centavos na primeira parcela: R$ 100 em 3x = 33,34 + 33,33 + 33,33', async () => {
      const user = await registerUser(env.app);
      const created = await createCard(user);

      const purchase = await buy(user, created.id, {
        totalAmountCents: 10_000,
        installmentsCount: 3,
      });

      expect(purchase.installments.map((item) => item.amountCents)).toEqual([3_334, 3_333, 3_333]);
    });

    it('compra não mexe em saldo, lançamentos nem o dinheiro disponível; só a fatura e o limite mudam', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 300_000 });
      const created = await createCard(user);
      const before = await dashboard(user);

      await buy(user, created.id, { totalAmountCents: 90_000, installmentsCount: 3 });
      const after = await dashboard(user);

      expect(await user.balanceOf(account.id)).toBe(300_000);
      expect(await user.listAll()).toEqual([]);
      // O disponível cai pelo que vence até o horizonte (as 3 faturas): compromisso real.
      expect(after.availableToSpend.amountCents).toBe(before.availableToSpend.amountCents - 90_000);
      expect(after.availableToSpend.components.invoicesCents).toBe(90_000);
      expect(after.cardLiabilitiesCents).toBe(90_000);
      expect(after.netWorthCents).toBe(before.netWorthCents - 90_000);
      const updated = await card(user, created.id);
      expect(updated.usedLimitCents).toBe(90_000);
      expect(updated.availableLimitCents).toBe(410_000);
    });

    it('compra feita hoje cai na fatura ABERTA do cartão', async () => {
      const user = await registerUser(env.app);
      const created = await createCard(user);

      await buy(user, created.id, { totalAmountCents: 5_000 });

      const updated = await card(user, created.id);
      expect(updated.openInvoice).toMatchObject({ status: 'open', totalCents: 5_000 });
    });

    it('compras simultâneas no mesmo período reutilizam UMA fatura (sem duplicar) e somam certo', async () => {
      const user = await registerUser(env.app);
      const created = await createCard(user);

      await Promise.all(
        [1, 2, 3, 4, 5].map((n) => buy(user, created.id, { totalAmountCents: n * 1_000 })),
      );

      const list = await invoices(user, created.id);
      expect(list).toHaveLength(1);
      expect(list[0]?.totalCents).toBe(15_000);
    });

    it('rejeita data futura, categoria de receita, parcelas demais e valor menor que as parcelas', async () => {
      const user = await registerUser(env.app);
      const created = await createCard(user);
      const salary = await user.categoryId('Salário', 'income');
      const post = (body: Record<string, unknown>) =>
        user.post(`/credit-cards/${created.id}/purchases`, {
          description: 'X',
          purchaseDate: user.today(),
          totalAmountCents: 10_000,
          ...body,
        });

      expect((await post({ purchaseDate: user.today(1) })).statusCode).toBe(422);
      expect((await post({ categoryId: salary })).statusCode).toBe(422);
      expect((await post({ installmentsCount: 49 })).statusCode).toBe(400);
      expect((await post({ installmentsCount: 0 })).statusCode).toBe(400);
      expect((await post({ totalAmountCents: 2, installmentsCount: 3 })).statusCode).toBe(422);
      expect((await post({ description: '' })).statusCode).toBe(400);
      expect((await post({ totalAmountCents: 0 })).statusCode).toBe(400);
    });

    it('compra antiga: a fatura correta é a que fecha no mês anterior e vence neste mês', async () => {
      const user = await registerUser(env.app);
      const created = await createCard(user);

      const purchase = await buy(user, created.id, {
        totalAmountCents: 20_000,
        purchaseDate: oldPurchaseDate(user),
      });

      const [installment] = purchase.installments;
      expect(installment?.referenceMonth).toBe(currentMonth(user));
      expect(installment?.dueDate).toBe(`${currentMonth(user)}-05`);
    });

    it('altera descrição e categoria; cancelada não pode mais ser alterada', async () => {
      const user = await registerUser(env.app);
      const created = await createCard(user);
      const food = await user.categoryId('Alimentação', 'expense');
      const purchase = await buy(user, created.id, { totalAmountCents: 9_000 });

      const edited = await user.ok<Purchase>(
        user.patch(`/purchases/${purchase.id}`, { description: 'Mercado', categoryId: food }),
      );
      await user.ok(user.post(`/purchases/${purchase.id}/cancel`));
      const blocked = await user.patch(`/purchases/${purchase.id}`, { description: 'x' });

      expect(edited).toMatchObject({ description: 'Mercado', categoryId: food });
      expect(blocked.statusCode).toBe(409);
    });
  });

  describe('fatura: total, status e pagamento', () => {
    it('detalha as parcelas que compõem a fatura', async () => {
      const user = await registerUser(env.app);
      const created = await createCard(user);
      await buy(user, created.id, {
        description: 'Notebook',
        totalAmountCents: 90_000,
        installmentsCount: 3,
      });
      await buy(user, created.id, { description: 'Café', totalAmountCents: 1_500 });

      const [first] = await invoices(user, created.id).then((list) => [...list].reverse());
      const detail = await invoice(user, (first as InvoiceSummary).id);

      expect(detail.cardName).toBe('Nubank');
      expect(detail.totalCents).toBe(31_500);
      expect(
        detail.installments.map((item) => [
          item.description,
          item.installmentNumber,
          item.installmentsCount,
          item.amountCents,
        ]),
      ).toEqual([
        ['Notebook', 1, 3, 30_000],
        ['Café', 1, 1, 1_500],
      ]);
      expect(detail.payments).toEqual([]);
    });

    it('fatura fechada com valor em aberto; vencida depois do vencimento', async () => {
      const user = await registerUser(env.app);
      const created = await createCard(user);
      await buy(user, created.id, {
        totalAmountCents: 20_000,
        purchaseDate: oldPurchaseDate(user),
      });

      const [item] = await invoices(user, created.id);

      expect(item).toMatchObject({
        status: 'closed',
        totalCents: 20_000,
        paidCents: 0,
        remainingCents: 20_000,
        dueDate: `${currentMonth(user)}-05`,
        overdue: user.today() > `${currentMonth(user)}-05`,
      });
    });

    it('pagar a fatura: sai da conta, NÃO é despesa, quita a fatura e libera o limite', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const created = await createCard(user);
      const food = await user.categoryId('Alimentação', 'expense');
      await buy(user, created.id, {
        totalAmountCents: 20_000,
        purchaseDate: oldPurchaseDate(user),
        categoryId: food,
      });
      const [item] = await invoices(user, created.id);
      const monthBefore = (await dashboard(user)).month;

      const payment = await user.ok<Transaction>(
        pay(user, (item as InvoiceSummary).id, { accountId: account.id }),
        201,
      );

      expect(payment).toMatchObject({
        type: 'card_payment',
        status: 'completed',
        amountCents: 20_000,
        accountId: account.id,
        categoryId: null,
        creditCardInvoiceId: (item as InvoiceSummary).id,
      });
      expect(await user.balanceOf(account.id)).toBe(480_000);
      const paid = await invoice(user, (item as InvoiceSummary).id);
      expect(paid).toMatchObject({
        status: 'paid',
        remainingCents: 0,
        paidCents: 20_000,
        overdue: false,
      });
      expect(paid.payments).toHaveLength(1);
      expect((await card(user, created.id)).usedLimitCents).toBe(0);
      // Despesa do mês: só a parcela (uma vez). Pagar a fatura não a duplica.
      const monthAfter = (await dashboard(user)).month;
      expect(monthAfter.expenseCents).toBe(monthBefore.expenseCents);
      expect(monthAfter.cardExpenseCents).toBe(20_000);
    });

    it('SEM DUPLA CONTAGEM: pagar a fatura não altera o dinheiro disponível nem o patrimônio', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const created = await createCard(user);
      await buy(user, created.id, { totalAmountCents: 90_000, installmentsCount: 3 });
      const [oldest] = (await invoices(user, created.id)).slice(-1);
      const before = await dashboard(user);

      await user.ok(pay(user, (oldest as InvoiceSummary).id, { accountId: account.id }), 201);
      const after = await dashboard(user);

      expect(before.availableToSpend.amountCents).toBe(500_000 - 90_000);
      expect(after.availableToSpend.amountCents).toBe(before.availableToSpend.amountCents);
      expect(after.netWorthCents).toBe(before.netWorthCents);
      expect(after.cardLiabilitiesCents).toBe(60_000);
      expect(after.availableToSpend.components.liquidBalanceCents).toBe(470_000);
      expect(after.availableToSpend.components.invoicesCents).toBe(60_000);
    });

    it('pagamento parcial e depois o restante; não permite pagar mais que o devido', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const created = await createCard(user);
      await buy(user, created.id, {
        totalAmountCents: 30_000,
        purchaseDate: oldPurchaseDate(user),
      });
      const [item] = await invoices(user, created.id);
      const id = (item as InvoiceSummary).id;

      await user.ok(pay(user, id, { accountId: account.id, amountCents: 10_000 }), 201);
      const partial = await invoice(user, id);
      const tooMuch = await pay(user, id, { accountId: account.id, amountCents: 20_001 });
      await user.ok(pay(user, id, { accountId: account.id }), 201);
      const settled = await invoice(user, id);
      const again = await pay(user, id, { accountId: account.id });

      expect(partial).toMatchObject({
        status: 'closed',
        paidCents: 10_000,
        remainingCents: 20_000,
      });
      expect(tooMuch.statusCode).toBe(422);
      expect(tooMuch.json<{ error: { message: string } }>().error.message).toContain('R$');
      expect(settled).toMatchObject({ status: 'paid', paidCents: 30_000, remainingCents: 0 });
      expect(again.statusCode).toBe(422);
      expect(await user.balanceOf(account.id)).toBe(470_000);
    });

    it('pagamentos simultâneos do valor total: só um passa (fatura travada)', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const created = await createCard(user);
      await buy(user, created.id, {
        totalAmountCents: 25_000,
        purchaseDate: oldPurchaseDate(user),
      });
      const [item] = await invoices(user, created.id);
      const id = (item as InvoiceSummary).id;

      const results = await Promise.all(
        [1, 2, 3].map(() => pay(user, id, { accountId: account.id })),
      );

      expect(results.map((r) => r.statusCode).sort()).toEqual([201, 422, 422]);
      expect(await user.balanceOf(account.id)).toBe(475_000);
      expect((await invoice(user, id)).paidCents).toBe(25_000);
    });

    it('pagamento futuro fica agendado: não mexe no saldo e não deixa pagar em dobro; cancelar libera', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const created = await createCard(user);
      await buy(user, created.id, {
        totalAmountCents: 20_000,
        purchaseDate: oldPurchaseDate(user),
      });
      const [item] = await invoices(user, created.id);
      const id = (item as InvoiceSummary).id;

      const scheduled = await user.ok<Transaction>(
        pay(user, id, { accountId: account.id, paymentDate: user.today(3) }),
        201,
      );
      const duplicate = await pay(user, id, { accountId: account.id });
      const detail = await invoice(user, id);
      await user.ok(user.post(`/transactions/${scheduled.id}/cancel`));
      const released = await invoice(user, id);

      expect(scheduled).toMatchObject({ status: 'pending', type: 'card_payment' });
      expect(await user.balanceOf(account.id)).toBe(500_000);
      expect(duplicate.statusCode).toBe(422);
      expect(detail).toMatchObject({
        scheduledCents: 20_000,
        paidCents: 0,
        remainingCents: 20_000,
      });
      expect(released).toMatchObject({ scheduledCents: 0, remainingCents: 20_000 });
      await user.ok(pay(user, id, { accountId: account.id }), 201);
    });

    it('efetivar um pagamento agendado move de "agendado" para "pago"', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const created = await createCard(user);
      await buy(user, created.id, {
        totalAmountCents: 20_000,
        purchaseDate: oldPurchaseDate(user),
      });
      const [item] = await invoices(user, created.id);
      const id = (item as InvoiceSummary).id;
      const scheduled = await user.ok<Transaction>(
        pay(user, id, { accountId: account.id, paymentDate: user.today(3) }),
        201,
      );

      await user.ok(
        user.post(`/transactions/${scheduled.id}/complete`, { transactionDate: user.today() }),
      );

      expect(await invoice(user, id)).toMatchObject({
        scheduledCents: 0,
        paidCents: 20_000,
        status: 'paid',
      });
      expect(await user.balanceOf(account.id)).toBe(480_000);
    });

    it('a conta pagadora não pode ser investimento, arquivada ou de outro usuário', async () => {
      const user = await registerUser(env.app);
      const other = await registerUser(env.app);
      const invest = await user.createAccount({ name: 'CDB', type: 'investment' });
      const archived = await user.createAccount({ name: 'Velha' });
      await user.ok(user.post(`/accounts/${archived.id}/archive`));
      const foreign = await other.createAccount({ name: 'Dela' });
      const created = await createCard(user);
      await buy(user, created.id, { totalAmountCents: 20_000 });
      const [item] = await invoices(user, created.id);
      const id = (item as InvoiceSummary).id;

      expect((await pay(user, id, { accountId: invest.id })).statusCode).toBe(422);
      expect((await pay(user, id, { accountId: archived.id })).statusCode).toBe(409);
      expect((await pay(user, id, { accountId: foreign.id })).statusCode).toBe(404);
    });

    it('o pagamento aparece no extrato e não pode ser editado', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const created = await createCard(user);
      await buy(user, created.id, {
        totalAmountCents: 20_000,
        purchaseDate: oldPurchaseDate(user),
      });
      const [item] = await invoices(user, created.id);
      const payment = await user.ok<Transaction>(
        pay(user, (item as InvoiceSummary).id, { accountId: account.id }),
        201,
      );

      const listed = await user.listAll('&type=card_payment');
      const edit = await user.patch(`/transactions/${payment.id}`, { amountCents: 1 });

      expect(listed.map((t) => t.id)).toEqual([payment.id]);
      expect(listed[0]?.description).toMatch(/^Fatura Nubank \d{2}\/\d{4}$/);
      expect(edit.statusCode).toBe(409);
    });
  });

  describe('cancelar compra (estorno)', () => {
    it('as parcelas saem da fatura, do limite, do painel e do orçamento; cancelar é idempotente', async () => {
      const user = await registerUser(env.app);
      const created = await createCard(user);
      const purchase = await buy(user, created.id, {
        totalAmountCents: 90_000,
        installmentsCount: 3,
      });

      const cancelled = await user.ok<Purchase>(user.post(`/purchases/${purchase.id}/cancel`));
      const again = await user.ok<Purchase>(user.post(`/purchases/${purchase.id}/cancel`));

      expect(cancelled.cancelled).toBe(true);
      expect(again.cancelled).toBe(true);
      expect((await invoices(user, created.id)).every((item) => item.totalCents === 0)).toBe(true);
      expect((await card(user, created.id)).usedLimitCents).toBe(0);
      const d = await dashboard(user);
      expect(d.cardLiabilitiesCents).toBe(0);
      expect(d.availableToSpend.components.invoicesCents).toBe(0);
    });

    it('estorno depois de pagar vira crédito na fatura (restante negativo, não vencida)', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const created = await createCard(user);
      const purchase = await buy(user, created.id, {
        totalAmountCents: 20_000,
        purchaseDate: oldPurchaseDate(user),
      });
      const [item] = await invoices(user, created.id);
      await user.ok(pay(user, (item as InvoiceSummary).id, { accountId: account.id }), 201);

      await user.ok(user.post(`/purchases/${purchase.id}/cancel`));

      expect(await invoice(user, (item as InvoiceSummary).id)).toMatchObject({
        status: 'paid',
        totalCents: 0,
        paidCents: 20_000,
        remainingCents: -20_000,
        overdue: false,
      });
      const d = await dashboard(user);
      // Crédito não vira "dinheiro disponível": só faturas com valor a pagar subtraem.
      expect(d.availableToSpend.components.invoicesCents).toBe(0);
      expect((await card(user, created.id)).usedLimitCents).toBe(0);
    });
  });

  describe('painel e orçamento', () => {
    it('despesa do mês inclui as parcelas das faturas que vencem no mês (uma vez só)', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const created = await createCard(user);
      await user.addTransaction({ accountId: account.id, type: 'expense', amountCents: 10_000 });
      await buy(user, created.id, {
        totalAmountCents: 20_000,
        purchaseDate: oldPurchaseDate(user),
      });

      const d = await dashboard(user);

      expect(d.month.cardExpenseCents).toBe(20_000);
      expect(d.month.expenseCents).toBe(30_000);
    });

    it('fatura a vencer aparece em "contas pendentes"; fatura vencida aparece como vencida', async () => {
      const user = await registerUser(env.app);
      const created = await createCard(user);
      await buy(user, created.id, {
        totalAmountCents: 20_000,
        purchaseDate: oldPurchaseDate(user),
      });
      const [item] = await invoices(user, created.id);

      const d = await dashboard(user);

      const bill = d.pendingBills.next.find((entry) => entry.kind === 'invoice');
      expect(bill).toMatchObject({
        id: `invoice:${(item as InvoiceSummary).id}`,
        invoiceId: (item as InvoiceSummary).id,
        amountCents: 20_000,
        date: `${currentMonth(user)}-05`,
        overdue: user.today() > `${currentMonth(user)}-05`,
      });
      expect(d.pendingBills.count).toBe(1);
      expect(d.availableToSpend.components.invoicesCents).toBe(20_000);
    });

    it('faturas depois do horizonte são compromissos futuros, não reduzem o disponível agora', async () => {
      const user = await registerUser(env.app);
      await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const created = await createCard(user);
      await buy(user, created.id, { totalAmountCents: 90_000, installmentsCount: 3 });

      const nearHorizon = await dashboard(user, user.today());
      const farHorizon = await dashboard(user, user.today(400));

      expect(nearHorizon.availableToSpend.amountCents).toBe(500_000);
      expect(nearHorizon.availableToSpend.components.invoicesCents).toBe(0);
      expect(nearHorizon.futureCommitments).toEqual({ count: 3, totalCents: 90_000 });
      expect(farHorizon.availableToSpend.amountCents).toBe(410_000);
      expect(farHorizon.futureCommitments).toEqual({ count: 0, totalCents: 0 });
    });

    it('orçamento conta as parcelas do mês da fatura na categoria da compra (uma vez só)', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter', initialBalanceCents: 500_000 });
      const created = await createCard(user);
      const food = await user.categoryId('Alimentação', 'expense');
      await user.ok(
        user.put('/budgets', { categoryId: food, month: currentMonth(user), limitCents: 100_000 }),
      );
      await user.addTransaction({
        accountId: account.id,
        type: 'expense',
        amountCents: 10_000,
        categoryId: food,
      });
      await buy(user, created.id, {
        totalAmountCents: 20_000,
        purchaseDate: oldPurchaseDate(user),
        categoryId: food,
      });
      const [item] = await invoices(user, created.id);
      await user.ok(pay(user, (item as InvoiceSummary).id, { accountId: account.id }), 201);

      const budgets = budgetListResponseSchema.parse(await user.ok(user.get('/budgets')));

      // R$ 100 no débito + R$ 200 da parcela; o pagamento da fatura (R$ 200) NÃO conta de novo.
      expect(budgets.items[0]).toMatchObject({ spentCents: 30_000, remainingCents: 70_000 });
    });

    it('compra cancelada sai do orçamento', async () => {
      const user = await registerUser(env.app);
      const created = await createCard(user);
      const food = await user.categoryId('Alimentação', 'expense');
      await user.ok(
        user.put('/budgets', { categoryId: food, month: currentMonth(user), limitCents: 100_000 }),
      );
      const purchase = await buy(user, created.id, {
        totalAmountCents: 20_000,
        purchaseDate: oldPurchaseDate(user),
        categoryId: food,
      });
      await user.ok(user.post(`/purchases/${purchase.id}/cancel`));

      const budgets = budgetListResponseSchema.parse(await user.ok(user.get('/budgets')));

      expect(budgets.items[0]?.spentCents).toBe(0);
    });
  });

  describe('isolamento entre usuários', () => {
    it('outro usuário não vê, edita, paga nem cancela nada do cartão', async () => {
      const owner = await registerUser(env.app);
      const intruder = await registerUser(env.app);
      const account = await owner.createAccount({ name: 'Inter', initialBalanceCents: 100_000 });
      const own = await intruder.createAccount({ name: 'Dele', initialBalanceCents: 100_000 });
      const created = await createCard(owner);
      const purchase = await buy(owner, created.id, { totalAmountCents: 20_000 });
      const [item] = await invoices(owner, created.id);
      const id = (item as InvoiceSummary).id;

      const attempts = await Promise.all([
        intruder.get(`/credit-cards/${created.id}`),
        intruder.patch(`/credit-cards/${created.id}`, { name: 'x' }),
        intruder.post(`/credit-cards/${created.id}/archive`),
        intruder.get(`/credit-cards/${created.id}/invoices`),
        intruder.get(`/credit-cards/${created.id}/purchases`),
        intruder.post(`/credit-cards/${created.id}/purchases`, {
          description: 'x',
          purchaseDate: intruder.today(),
          totalAmountCents: 100,
        }),
        intruder.get(`/invoices/${id}`),
        pay(intruder, id, { accountId: own.id }),
        intruder.get(`/purchases/${purchase.id}`),
        intruder.patch(`/purchases/${purchase.id}`, { description: 'x' }),
        intruder.post(`/purchases/${purchase.id}/cancel`),
      ]);

      expect(attempts.map((r) => r.statusCode)).toEqual(Array(attempts.length).fill(404));
      expect(
        (await intruder.ok<{ items: CreditCard[] }>(intruder.get('/credit-cards'))).items,
      ).toEqual([]);
      const d: Dashboard = await dashboard(intruder);
      expect(d.cardLiabilitiesCents).toBe(0);
      expect(d.pendingBills.count).toBe(0);
      expect(await owner.balanceOf(account.id)).toBe(100_000);
    });

    it('exige autenticação', async () => {
      const response = await env.app.inject({ method: 'GET', url: '/api/v1/credit-cards' });

      expect(response.statusCode).toBe(401);
    });
  });

  describe('integridade no banco (defesa em profundidade)', () => {
    async function ids(user: TestClient) {
      const created = await createCard(user);
      const purchase = await buy(user, created.id, {
        totalAmountCents: 10_000,
        installmentsCount: 2,
      });
      return {
        cardId: created.id,
        purchase,
        invoiceId: purchase.installments[0]?.invoiceId as string,
      };
    }

    it('parcelas que não somam o total da compra são rejeitadas no COMMIT', async () => {
      const user = await registerUser(env.app);
      const { cardId, invoiceId } = await ids(user);

      const insertBroken = env.database.db.transaction(async (tx) => {
        await tx.execute(sql`
          with purchase as (
            insert into credit_card_transactions (user_id, credit_card_id, description, purchase_date, total_amount_cents, installments_count)
            values (${user.userId}, ${cardId}, 'quebrada', current_date, 10000, 2) returning id
          )
          insert into credit_card_installments (user_id, credit_card_id, card_transaction_id, invoice_id, installment_number, amount_cents)
          select ${user.userId}, ${cardId}, id, ${invoiceId}, n, 4000 from purchase, generate_series(1, 2) n`);
      });

      // Trigger deferido: falha no COMMIT, então o erro chega sem o invólucro do Drizzle.
      await expect(insertBroken).rejects.toMatchObject({ code: '23514' });
    });

    it('parcela presa a fatura de OUTRO cartão é rejeitada (chave composta)', async () => {
      const user = await registerUser(env.app);
      const { invoiceId } = await ids(user);
      const otherCard = await createCard(user, { name: 'Inter Black' });

      const insertMismatch = env.database.db.transaction(async (tx) => {
        await tx.execute(sql`
          with purchase as (
            insert into credit_card_transactions (user_id, credit_card_id, description, purchase_date, total_amount_cents, installments_count)
            values (${user.userId}, ${otherCard.id}, 'cruzada', current_date, 5000, 1) returning id
          )
          insert into credit_card_installments (user_id, credit_card_id, card_transaction_id, invoice_id, installment_number, amount_cents)
          select ${user.userId}, ${otherCard.id}, id, ${invoiceId}, 1, 5000 from purchase`);
      });

      await expect(insertMismatch).rejects.toMatchObject({ cause: { code: '23503' } });
    });

    it('apagar uma parcela deixaria a compra incompleta: rejeitado; pagamento exige fatura', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Inter' });
      const { purchase } = await ids(user);

      const deleteOne = env.database.db.execute(
        sql`delete from credit_card_installments where card_transaction_id = ${purchase.id} and installment_number = 2`,
      );
      const orphanPayment = env.database.db.execute(sql`
        insert into transactions (user_id, account_id, type, amount_cents, transaction_date, status)
        values (${user.userId}, ${account.id}, 'card_payment', 100, current_date, 'completed')`);

      await expect(deleteOne).rejects.toMatchObject({ cause: { code: '23514' } });
      await expect(orphanPayment).rejects.toMatchObject({ cause: { code: '23514' } });
    });
  });

  it('a lista de faturas vem da mais recente para a mais antiga', async () => {
    const user = await registerUser(env.app);
    const created = await createCard(user);
    await buy(user, created.id, { totalAmountCents: 30_000, installmentsCount: 3 });

    const list: InvoiceSummary[] = await invoices(user, created.id);

    const months = list.map((item) => item.referenceMonth);
    expect([...months].sort().reverse()).toEqual(months);
    const detail: InvoiceDetail = await invoice(user, list[0]?.id as string);
    expect(detail.installments).toHaveLength(1);
  });
});
