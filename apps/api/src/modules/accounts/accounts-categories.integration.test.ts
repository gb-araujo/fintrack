import { readFileSync } from 'node:fs';
import type { Account, Category } from '@fintrack/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { migrationsFolder } from '../../db/migrations.js';
import {
  createLedgerTestEnv,
  databaseUrl,
  registerUser,
  type LedgerTestEnv,
} from '../../test/ledger-client.js';
import { DEFAULT_CATEGORIES } from '../categories/default-categories.js';

describe.skipIf(!databaseUrl)('contas e categorias (integração)', () => {
  let env: LedgerTestEnv;

  beforeAll(async () => {
    env = await createLedgerTestEnv();
  });
  afterAll(async () => {
    await env.close();
  });

  describe('categorias', () => {
    it('novo usuário recebe as 17 categorias padrão (4 de receita e 13 de despesa)', async () => {
      const user = await registerUser(env.app);

      const { items } = await user.ok<{ items: Category[] }>(user.get('/categories'));

      expect(items).toHaveLength(DEFAULT_CATEGORIES.length);
      expect(items.filter((c) => c.kind === 'income').map((c) => c.name)).toEqual([
        'Salário',
        'VR',
        'VT',
        'Outros',
      ]);
      expect(items.filter((c) => c.kind === 'expense')).toHaveLength(13);
      expect(items.every((c) => c.isDefault && c.archivedAt === null)).toBe(true);
    });

    it('a lista de padrão no código é a mesma usada na migration (backfill de usuários antigos)', () => {
      const migration = readFileSync(
        `${migrationsFolder}/0002_ledger_accounts_categories_transactions.sql`,
        'utf8',
      );
      for (const { name, kind } of DEFAULT_CATEGORIES) {
        expect(migration, `${name}/${kind}`).toContain(`('${name}', '${kind}', `);
      }
    });

    it('cria categoria personalizada e rejeita nome repetido (sem diferenciar maiúsculas)', async () => {
      const user = await registerUser(env.app);

      const created = await user.ok<Category>(
        user.post('/categories', { name: ' Pets ', kind: 'expense' }),
        201,
      );
      expect(created).toMatchObject({ name: 'Pets', kind: 'expense', isDefault: false });

      const duplicate = await user.post('/categories', { name: 'PETS', kind: 'expense' });
      expect(duplicate.statusCode).toBe(409);

      // O mesmo nome em outro tipo é permitido (ex.: "Outros" existe em receita e despesa).
      await user.ok(user.post('/categories', { name: 'Pets', kind: 'income' }), 201);
    });

    it('renomeia e arquiva; arquivadas saem da lista mas podem voltar', async () => {
      const user = await registerUser(env.app);
      const category = await user.ok<Category>(
        user.post('/categories', { name: 'Hobby', kind: 'expense' }),
        201,
      );

      const renamed = await user.ok<Category>(
        user.patch(`/categories/${category.id}`, { name: 'Hobbies' }),
      );
      expect(renamed.name).toBe('Hobbies');

      const archived = await user.ok<Category>(user.post(`/categories/${category.id}/archive`));
      expect(archived.archivedAt).not.toBeNull();
      const active = await user.ok<{ items: Category[] }>(user.get('/categories'));
      expect(active.items.some((c) => c.id === category.id)).toBe(false);
      const all = await user.ok<{ items: Category[] }>(
        user.get('/categories?includeArchived=true'),
      );
      expect(all.items.some((c) => c.id === category.id)).toBe(true);

      // Nome liberado ao arquivar: pode criar outra com o mesmo nome; desarquivar então conflita.
      await user.ok(user.post('/categories', { name: 'Hobbies', kind: 'expense' }), 201);
      const clash = await user.post(`/categories/${category.id}/unarchive`);
      expect(clash.statusCode).toBe(409);
    });

    it('validação: nome vazio → 400', async () => {
      const user = await registerUser(env.app);
      const response = await user.post('/categories', { name: '  ', kind: 'expense' });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('contas', () => {
    it('cria conta com saldo inicial (inclusive negativo); saldo começa igual ao inicial', async () => {
      const user = await registerUser(env.app);

      const inter = await user.createAccount({ name: 'Banco Inter', initialBalanceCents: 250_000 });
      const overdraft = await user.createAccount({ name: 'Nubank', initialBalanceCents: -15_000 });

      expect(inter).toMatchObject({
        name: 'Banco Inter',
        type: 'bank',
        initialBalanceCents: 250_000,
        balanceCents: 250_000,
        includeInAvailable: true,
        archivedAt: null,
      });
      expect(overdraft.balanceCents).toBe(-15_000);
    });

    it('conta de investimento não entra no "disponível" por padrão', async () => {
      const user = await registerUser(env.app);
      const investment = await user.createAccount({ name: 'Tesouro', type: 'investment' });
      const wallet = await user.createAccount({ name: 'Mercado Pago', type: 'wallet' });

      expect(investment.includeInAvailable).toBe(false);
      expect(wallet.includeInAvailable).toBe(true);
    });

    it('nome único entre contas ativas (sem diferenciar maiúsculas); arquivar libera o nome', async () => {
      const user = await registerUser(env.app);
      const first = await user.createAccount({ name: 'Dinheiro' });

      expect((await user.post('/accounts', { name: 'dinheiro', type: 'wallet' })).statusCode).toBe(
        409,
      );

      await user.ok(user.post(`/accounts/${first.id}/archive`));
      await user.createAccount({ name: 'Dinheiro' });
    });

    it('atualiza nome e saldo inicial; o tipo não muda', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Conta', initialBalanceCents: 1_000 });

      const updated = await user.ok<Account>(
        user.patch(`/accounts/${account.id}`, {
          name: 'Conta corrente',
          initialBalanceCents: 5_000,
          type: 'investment',
        }),
      );

      expect(updated).toMatchObject({
        name: 'Conta corrente',
        initialBalanceCents: 5_000,
        balanceCents: 5_000,
        type: 'bank',
      });
    });

    it('arquivar é idempotente, preserva a conta e a esconde da lista padrão', async () => {
      const user = await registerUser(env.app);
      const account = await user.createAccount({ name: 'Antiga' });

      await user.ok(user.post(`/accounts/${account.id}/archive`));
      const again = await user.ok<Account>(user.post(`/accounts/${account.id}/archive`));
      expect(again.archivedAt).not.toBeNull();

      const active = await user.ok<{ items: Account[] }>(user.get('/accounts'));
      expect(active.items.map((a) => a.id)).not.toContain(account.id);
      const all = await user.ok<{ items: Account[] }>(user.get('/accounts?includeArchived=true'));
      expect(all.items.map((a) => a.id)).toContain(account.id);

      const restored = await user.ok<Account>(user.post(`/accounts/${account.id}/unarchive`));
      expect(restored.archivedAt).toBeNull();
    });

    it.each([
      ['nome vazio', { name: '', type: 'bank' }],
      ['tipo inválido', { name: 'X', type: 'poupanca' }],
      ['saldo fracionado', { name: 'X', type: 'bank', initialBalanceCents: 10.5 }],
    ])('validação: %s → 400', async (_label, payload) => {
      const user = await registerUser(env.app);
      expect((await user.post('/accounts', payload)).statusCode).toBe(400);
    });

    it('exige autenticação', async () => {
      const response = await env.app.inject({ method: 'GET', url: '/api/v1/accounts' });
      expect(response.statusCode).toBe(401);
    });
  });
});
