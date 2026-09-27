import type { Account, Category, Transaction } from '@fintrack/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  createLedgerTestEnv,
  databaseUrl,
  registerUser,
  type LedgerTestEnv,
} from '../../test/ledger-client.js';

/**
 * "Cada usuário enxerga somente seus próprios dados" — a garantia mais importante do sistema.
 * A usuária Alice cria dados; o usuário Bob tenta ler, alterar e referenciar cada um deles.
 */
describe.skipIf(!databaseUrl)('isolamento entre usuários (integração)', () => {
  let env: LedgerTestEnv;

  beforeAll(async () => {
    env = await createLedgerTestEnv();
  });
  afterAll(async () => {
    await env.close();
  });

  async function twoUsers() {
    const alice = await registerUser(env.app);
    const bob = await registerUser(env.app);
    const account = await alice.createAccount({
      name: 'Conta da Alice',
      initialBalanceCents: 100_000,
    });
    const other = await alice.createAccount({ name: 'Outra da Alice' });
    const category = await alice.categoryId('Lazer', 'expense');
    const transaction = await alice.addTransaction({
      accountId: account.id,
      type: 'expense',
      amountCents: 1_000,
      categoryId: category,
    });
    const transfer = await alice.transfer({
      fromAccountId: account.id,
      toAccountId: other.id,
      amountCents: 500,
      status: 'pending',
    });
    return { alice, bob, account, other, category, transaction, transfer };
  }

  it('as listagens do Bob nunca contêm dados da Alice', async () => {
    const { bob } = await twoUsers();
    const bobAccount = await bob.createAccount({ name: 'Conta do Bob' });

    const accounts = await bob.ok<{ items: Account[] }>(bob.get('/accounts?includeArchived=true'));
    expect(accounts.items.map((a) => a.id)).toEqual([bobAccount.id]);
    expect(await bob.listAll('&includeCancelled=true')).toHaveLength(0);
    const categories = await bob.ok<{ items: Category[] }>(
      bob.get('/categories?includeArchived=true'),
    );
    expect(categories.items).toHaveLength(17);
  });

  it('Bob não lê, altera nem arquiva recursos da Alice: sempre 404 (não revela existência)', async () => {
    const { bob, account, category, transaction, transfer } = await twoUsers();
    const requests = [
      bob.get(`/accounts/${account.id}`),
      bob.patch(`/accounts/${account.id}`, { name: 'Invadida' }),
      bob.post(`/accounts/${account.id}/archive`),
      bob.post(`/accounts/${account.id}/unarchive`),
      bob.patch(`/categories/${category}`, { name: 'Invadida' }),
      bob.post(`/categories/${category}/archive`),
      bob.get(`/transactions/${transaction.id}`),
      bob.patch(`/transactions/${transaction.id}`, { description: 'Invadido' }),
      bob.post(`/transactions/${transaction.id}/complete`),
      bob.post(`/transactions/${transaction.id}/cancel`),
      bob.get(`/transfers/${transfer.id}`),
      bob.patch(`/transfers/${transfer.id}`, { amountCents: 1 }),
      bob.post(`/transfers/${transfer.id}/complete`),
      bob.post(`/transfers/${transfer.id}/cancel`),
    ];

    const statuses = (await Promise.all(requests)).map((r) => r.statusCode);

    expect(statuses).toEqual(statuses.map(() => 404));
  });

  it('Bob não consegue lançar nas contas/categorias da Alice nem transferir de/para elas', async () => {
    const { bob, account, other, category } = await twoUsers();
    const bobAccount = await bob.createAccount({ name: 'Conta do Bob' });
    const bobCategory = await bob.categoryId('Lazer', 'expense');

    const inAliceAccount = await bob.post('/transactions', {
      accountId: account.id,
      type: 'expense',
      amountCents: 100,
      transactionDate: bob.today(),
    });
    const withAliceCategory = await bob.post('/transactions', {
      accountId: bobAccount.id,
      type: 'expense',
      amountCents: 100,
      transactionDate: bob.today(),
      categoryId: category,
    });
    const fromAlice = await bob.post('/transfers', {
      fromAccountId: account.id,
      toAccountId: bobAccount.id,
      amountCents: 100,
      transferDate: bob.today(),
    });
    const toAlice = await bob.post('/transfers', {
      fromAccountId: bobAccount.id,
      toAccountId: other.id,
      amountCents: 100,
      transferDate: bob.today(),
    });
    const ownData = await bob.post('/transactions', {
      accountId: bobAccount.id,
      type: 'expense',
      amountCents: 100,
      transactionDate: bob.today(),
      categoryId: bobCategory,
    });

    expect(
      [inAliceAccount, withAliceCategory, fromAlice, toAlice].map((r) => r.statusCode),
    ).toEqual([404, 404, 404, 404]);
    expect(ownData.statusCode).toBe(201);
  });

  it('Bob não consegue mover um lançamento dele para a conta da Alice (PATCH)', async () => {
    const { bob, account } = await twoUsers();
    const bobAccount = await bob.createAccount({ name: 'Conta do Bob' });
    const mine = await bob.addTransaction({
      accountId: bobAccount.id,
      type: 'expense',
      amountCents: 100,
    });

    const response = await bob.patch(`/transactions/${mine.id}`, { accountId: account.id });

    expect(response.statusCode).toBe(404);
    expect((await bob.ok<Transaction>(bob.get(`/transactions/${mine.id}`))).accountId).toBe(
      bobAccount.id,
    );
  });

  it('nada do que o Bob faz altera o saldo ou os dados da Alice', async () => {
    const { alice, bob, account, transaction } = await twoUsers();
    const balanceBefore = await alice.balanceOf(account.id);
    const bobAccount = await bob.createAccount({ name: 'Conta do Bob' });
    await bob.addTransaction({ accountId: bobAccount.id, type: 'income', amountCents: 999_999 });
    await bob.post(`/transactions/${transaction.id}/cancel`);

    expect(await alice.balanceOf(account.id)).toBe(balanceBefore);
    expect((await alice.ok<Transaction>(alice.get(`/transactions/${transaction.id}`))).status).toBe(
      'completed',
    );
  });

  it('o userId enviado pelo cliente é ignorado: o dono é sempre o usuário do token', async () => {
    const { alice, bob } = await twoUsers();

    const created = await bob.ok<Account>(
      bob.post('/accounts', { name: 'Forjada', type: 'bank', userId: alice.userId }),
      201,
    );

    const aliceAccounts = await alice.ok<{ items: Account[] }>(alice.get('/accounts'));
    expect(aliceAccounts.items.map((a) => a.id)).not.toContain(created.id);
    const bobAccounts = await bob.ok<{ items: Account[] }>(bob.get('/accounts'));
    expect(bobAccounts.items.map((a) => a.id)).toContain(created.id);
  });

  it('a mesma conta pode ter o mesmo nome para usuários diferentes', async () => {
    const alice = await registerUser(env.app);
    const bob = await registerUser(env.app);
    await alice.createAccount({ name: 'Banco Inter' });
    await bob.createAccount({ name: 'Banco Inter' });
  });
});
