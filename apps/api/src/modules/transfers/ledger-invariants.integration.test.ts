import { randomUUID } from 'node:crypto';
import type { Account } from '@fintrack/shared';
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
import { computeBalance, type BalanceEntry } from '../accounts/domain/balance.js';

/** Código SQLSTATE do erro, percorrendo a cadeia de causas (o Drizzle encapsula o erro do driver). */
function pgCode(error: unknown): string | undefined {
  let current: unknown = error;
  for (let depth = 0; current && depth < 6; depth++) {
    const candidate = current as { code?: unknown; cause?: unknown };
    if (typeof candidate.code === 'string' && /^[0-9A-Z]{5}$/.test(candidate.code))
      return candidate.code;
    current = candidate.cause;
  }
  return undefined;
}

const CHECK_VIOLATION = '23514';
const FOREIGN_KEY_VIOLATION = '23503';

/**
 * As garantias financeiras valem NO BANCO, independentemente da aplicação: um bug, um script manual
 * ou uma migration futura não conseguem gravar dados que quebrem o saldo ou o isolamento.
 */
describe.skipIf(!databaseUrl)('invariantes do livro-caixa no banco (integração)', () => {
  let env: LedgerTestEnv;
  let db: DrizzleDb;

  beforeAll(async () => {
    env = await createLedgerTestEnv();
    db = env.database.db;
  });
  afterAll(async () => {
    await env.close();
  });

  async function world() {
    const user = await registerUser(env.app);
    const from = await user.createAccount({ name: 'Origem', initialBalanceCents: 100_000 });
    const to = await user.createAccount({ name: 'Destino' });
    return { user, from, to };
  }

  type Executor = Pick<DrizzleDb, 'execute'>;

  // `run` permite executar dentro de uma transação (`tx`). Sem ele, cada comando confirma sozinho —
  // e a verificação adiada das transferências rodaria a cada comando, não ao fim do conjunto.
  const insertTransfer = (
    userId: string,
    id: string,
    from: string,
    to: string,
    cents = 1_000,
    run: Executor = db,
  ) =>
    run.execute(sql`insert into transfers (id, user_id, from_account_id, to_account_id, amount_cents, transfer_date, status)
                    values (${id}, ${userId}, ${from}, ${to}, ${cents}, '2026-09-27', 'completed')`);

  const insertLeg = (
    userId: string,
    transferId: string,
    accountId: string,
    direction: 'in' | 'out',
    cents = 1_000,
    run: Executor = db,
  ) =>
    run.execute(sql`insert into transactions (user_id, account_id, type, amount_cents, transaction_date, status, transfer_id, transfer_direction)
                    values (${userId}, ${accountId}, 'transfer', ${cents}, '2026-09-27', 'completed', ${transferId}, ${direction}::transfer_direction)`);

  describe('transferência sempre tem exatamente duas pernas consistentes', () => {
    it('cabeçalho sem pernas não é gravado', async () => {
      const { user, from, to } = await world();
      const id = randomUUID();

      const attempt = db.transaction(async (tx) => {
        await tx.execute(sql`insert into transfers (id, user_id, from_account_id, to_account_id, amount_cents, transfer_date, status)
                             values (${id}, ${user.userId}, ${from.id}, ${to.id}, 1000, '2026-09-27', 'completed')`);
      });

      await expect(attempt).rejects.toSatisfy((e) => pgCode(e) === CHECK_VIOLATION);
      expect(await user.totalBalance()).toBe(100_000);
    });

    it('apenas a perna de saída (dinheiro que sai sem entrar) não é gravado', async () => {
      const { user, from, to } = await world();
      const id = randomUUID();

      const attempt = db.transaction(async (tx) => {
        await tx.execute(sql`insert into transfers (id, user_id, from_account_id, to_account_id, amount_cents, transfer_date, status)
                             values (${id}, ${user.userId}, ${from.id}, ${to.id}, 1000, '2026-09-27', 'completed')`);
        await tx.execute(sql`insert into transactions (user_id, account_id, type, amount_cents, transaction_date, status, transfer_id, transfer_direction)
                             values (${user.userId}, ${from.id}, 'transfer', 1000, '2026-09-27', 'completed', ${id}, 'out')`);
      });

      await expect(attempt).rejects.toSatisfy((e) => pgCode(e) === CHECK_VIOLATION);
      expect(await user.balanceOf(from.id)).toBe(100_000);
    });

    it('pernas com valor diferente do cabeçalho não são gravadas', async () => {
      const { user, from, to } = await world();
      const id = randomUUID();

      const attempt = db.transaction(async (tx) => {
        await tx.execute(sql`insert into transfers (id, user_id, from_account_id, to_account_id, amount_cents, transfer_date, status)
                             values (${id}, ${user.userId}, ${from.id}, ${to.id}, 1000, '2026-09-27', 'completed')`);
        await tx.execute(sql`insert into transactions (user_id, account_id, type, amount_cents, transaction_date, status, transfer_id, transfer_direction)
                             values (${user.userId}, ${from.id}, 'transfer', 1000, '2026-09-27', 'completed', ${id}, 'out'),
                                    (${user.userId}, ${to.id}, 'transfer', 999, '2026-09-27', 'completed', ${id}, 'in')`);
      });

      await expect(attempt).rejects.toSatisfy((e) => pgCode(e) === CHECK_VIOLATION);
    });

    it('pernas nas contas erradas (entrada na origem) não são gravadas', async () => {
      const { user, from, to } = await world();
      const id = randomUUID();

      const attempt = db.transaction(async (tx) => {
        await insertTransfer(user.userId, id, from.id, to.id, 1_000, tx);
        await insertLeg(user.userId, id, from.id, 'out', 1_000, tx);
        await insertLeg(user.userId, id, from.id, 'in', 1_000, tx); // deveria ser na conta de destino
      });

      await expect(attempt).rejects.toSatisfy((e) => pgCode(e) === CHECK_VIOLATION);
    });

    it('duas pernas corretas na mesma transação são aceitas e movem o saldo', async () => {
      const { user, from, to } = await world();
      const id = randomUUID();

      await db.transaction(async (tx) => {
        await tx.execute(sql`insert into transfers (id, user_id, from_account_id, to_account_id, amount_cents, transfer_date, status)
                             values (${id}, ${user.userId}, ${from.id}, ${to.id}, 25000, '2026-09-27', 'completed')`);
        await tx.execute(sql`insert into transactions (user_id, account_id, type, amount_cents, transaction_date, status, transfer_id, transfer_direction)
                             values (${user.userId}, ${from.id}, 'transfer', 25000, '2026-09-27', 'completed', ${id}, 'out'),
                                    (${user.userId}, ${to.id}, 'transfer', 25000, '2026-09-27', 'completed', ${id}, 'in')`);
      });

      expect(await user.balanceOf(from.id)).toBe(75_000);
      expect(await user.balanceOf(to.id)).toBe(25_000);
    });

    it('alterar só uma perna (valor ou status) de uma transferência existente é recusado', async () => {
      const { user, from, to } = await world();
      const transfer = await user.transfer({
        fromAccountId: from.id,
        toAccountId: to.id,
        amountCents: 5_000,
      });

      const changeAmount = db.execute(
        sql`update transactions set amount_cents = 4999 where transfer_id = ${transfer.id} and transfer_direction = 'in'`,
      );
      const changeStatus = db.execute(
        sql`update transactions set status = 'cancelled' where transfer_id = ${transfer.id} and transfer_direction = 'out'`,
      );

      await expect(changeAmount).rejects.toSatisfy((e) => pgCode(e) === CHECK_VIOLATION);
      await expect(changeStatus).rejects.toSatisfy((e) => pgCode(e) === CHECK_VIOLATION);
      expect(await user.balanceOf(from.id)).toBe(95_000);
      expect(await user.balanceOf(to.id)).toBe(5_000);
    });

    it('remover uma perna (deixando a transferência pela metade) é recusado', async () => {
      const { user, from, to } = await world();
      const transfer = await user.transfer({
        fromAccountId: from.id,
        toAccountId: to.id,
        amountCents: 5_000,
      });

      const attempt = db.execute(
        sql`delete from transactions where transfer_id = ${transfer.id} and transfer_direction = 'in'`,
      );

      await expect(attempt).rejects.toSatisfy((e) => pgCode(e) === CHECK_VIOLATION);
      expect(await user.balanceOf(to.id)).toBe(5_000);
    });

    it('apagar a transferência inteira (cabeçalho e pernas juntos) continua possível', async () => {
      const { user, from, to } = await world();
      const transfer = await user.transfer({
        fromAccountId: from.id,
        toAccountId: to.id,
        amountCents: 5_000,
      });

      await db.transaction(async (tx) => {
        await tx.execute(sql`delete from transactions where transfer_id = ${transfer.id}`);
        await tx.execute(sql`delete from transfers where id = ${transfer.id}`);
      });

      expect(await user.balanceOf(from.id)).toBe(100_000);
      expect(await user.balanceOf(to.id)).toBe(0);
    });
  });

  describe('restrições de formato', () => {
    it('conta de origem = destino é recusada', async () => {
      const { user, from } = await world();
      const attempt = insertTransfer(user.userId, randomUUID(), from.id, from.id);
      await expect(attempt).rejects.toSatisfy((e) => pgCode(e) === CHECK_VIOLATION);
    });

    it('valor zero ou negativo é recusado em lançamentos e transferências', async () => {
      const { user, from, to } = await world();
      for (const cents of [0, -100]) {
        const tx =
          db.execute(sql`insert into transactions (user_id, account_id, type, amount_cents, transaction_date, status)
                                  values (${user.userId}, ${from.id}, 'expense', ${cents}, '2026-09-27', 'completed')`);
        await expect(tx, String(cents)).rejects.toSatisfy((e) => pgCode(e) === CHECK_VIOLATION);
        const tr = insertTransfer(user.userId, randomUUID(), from.id, to.id, cents);
        await expect(tr, String(cents)).rejects.toSatisfy((e) => pgCode(e) === CHECK_VIOLATION);
      }
    });

    it('perna de transferência não pode ter categoria; despesa não pode ter transfer_id', async () => {
      const { user, from, to } = await world();
      const category = await user.categoryId('Lazer', 'expense');
      const id = randomUUID();

      const legWithCategory = db.transaction(async (tx) => {
        await tx.execute(sql`insert into transfers (id, user_id, from_account_id, to_account_id, amount_cents, transfer_date, status)
                             values (${id}, ${user.userId}, ${from.id}, ${to.id}, 1000, '2026-09-27', 'completed')`);
        await tx.execute(sql`insert into transactions (user_id, account_id, category_id, type, amount_cents, transaction_date, status, transfer_id, transfer_direction)
                             values (${user.userId}, ${from.id}, ${category}, 'transfer', 1000, '2026-09-27', 'completed', ${id}, 'out')`);
      });
      await expect(legWithCategory).rejects.toSatisfy((e) => pgCode(e) === CHECK_VIOLATION);

      const expenseWithTransferId = db.execute(
        sql`insert into transactions (user_id, account_id, type, amount_cents, transaction_date, status, transfer_id, transfer_direction)
            values (${user.userId}, ${from.id}, 'expense', 1000, '2026-09-27', 'completed', ${id}, 'out')`,
      );
      await expect(expenseWithTransferId).rejects.toSatisfy((e) => pgCode(e) !== undefined);
    });
  });

  describe('isolamento imposto pelo banco (chaves estrangeiras compostas)', () => {
    it('lançamento do usuário B não pode apontar para conta do usuário A', async () => {
      const { from } = await world();
      const bob: TestClient = await registerUser(env.app);

      const attempt =
        db.execute(sql`insert into transactions (user_id, account_id, type, amount_cents, transaction_date, status)
                                     values (${bob.userId}, ${from.id}, 'expense', 100, '2026-09-27', 'completed')`);

      await expect(attempt).rejects.toSatisfy((e) => pgCode(e) === FOREIGN_KEY_VIOLATION);
    });

    it('lançamento do usuário B não pode usar categoria do usuário A', async () => {
      const { user } = await world();
      const bob = await registerUser(env.app);
      const bobAccount = await bob.createAccount({ name: 'Conta' });
      const aliceCategory = await user.categoryId('Lazer', 'expense');

      const attempt =
        db.execute(sql`insert into transactions (user_id, account_id, category_id, type, amount_cents, transaction_date, status)
                                     values (${bob.userId}, ${bobAccount.id}, ${aliceCategory}, 'expense', 100, '2026-09-27', 'completed')`);

      await expect(attempt).rejects.toSatisfy((e) => pgCode(e) === FOREIGN_KEY_VIOLATION);
    });

    it('transferência do usuário B não pode envolver conta do usuário A', async () => {
      const { from } = await world();
      const bob = await registerUser(env.app);
      const bobAccount = await bob.createAccount({ name: 'Conta' });

      const attempt = insertTransfer(bob.userId, randomUUID(), from.id, bobAccount.id);

      await expect(attempt).rejects.toSatisfy((e) => pgCode(e) === FOREIGN_KEY_VIOLATION);
    });
  });

  describe('propriedade: o saldo do SQL concorda com a especificação do domínio', () => {
    /** PRNG determinístico (mulberry32): uma falha é reproduzível pela semente. */
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

    it.each([1, 2, 3, 4, 5, 6])(
      'semente %i: 40 lançamentos aleatórios em 3 contas',
      async (seed) => {
        const random = prng(seed * 7919);
        const pick = <T>(items: readonly T[]) => items[Math.floor(random() * items.length)] as T;
        const user = await registerUser(env.app);
        const accounts: Account[] = [];
        const initial: Record<string, number> = {};
        const entries: Record<string, BalanceEntry[]> = {};
        for (const [i, name] of ['A', 'B', 'C'].entries()) {
          const account = await user.createAccount({ name, initialBalanceCents: (i - 1) * 12_345 });
          accounts.push(account);
          initial[account.id] = account.initialBalanceCents;
          entries[account.id] = [];
        }

        const statuses = ['completed', 'completed', 'completed', 'pending', 'cancelled'] as const;
        let externalFlow = 0; // Σ receitas − Σ despesas efetivadas (transferências não entram)

        for (let n = 0; n < 40; n++) {
          const amount = 1 + Math.floor(random() * 99_999);
          const status = pick(statuses);
          if (random() < 0.3) {
            const [from, to] = [pick(accounts), pick(accounts)];
            if (from.id === to.id) continue;
            const id = randomUUID();
            await db.transaction(async (tx) => {
              await tx.execute(sql`insert into transfers (id, user_id, from_account_id, to_account_id, amount_cents, transfer_date, status)
                                 values (${id}, ${user.userId}, ${from.id}, ${to.id}, ${amount}, '2026-09-20', ${status}::transaction_status)`);
              await tx.execute(sql`insert into transactions (user_id, account_id, type, amount_cents, transaction_date, status, transfer_id, transfer_direction)
                                 values (${user.userId}, ${from.id}, 'transfer', ${amount}, '2026-09-20', ${status}::transaction_status, ${id}, 'out'),
                                        (${user.userId}, ${to.id}, 'transfer', ${amount}, '2026-09-20', ${status}::transaction_status, ${id}, 'in')`);
            });
            entries[from.id]!.push({
              type: 'transfer',
              transferDirection: 'out',
              amountCents: amount,
              status,
            });
            entries[to.id]!.push({
              type: 'transfer',
              transferDirection: 'in',
              amountCents: amount,
              status,
            });
          } else {
            const account = pick(accounts);
            const type = pick(['income', 'expense'] as const);
            await db.execute(sql`insert into transactions (user_id, account_id, type, amount_cents, transaction_date, status)
                               values (${user.userId}, ${account.id}, ${type}::transaction_type, ${amount}, '2026-09-20', ${status}::transaction_status)`);
            entries[account.id]!.push({
              type,
              transferDirection: null,
              amountCents: amount,
              status,
            });
            if (status === 'completed') externalFlow += type === 'income' ? amount : -amount;
          }
        }

        const { items } = await user.ok<{ items: Account[] }>(user.get('/accounts'));
        for (const account of items) {
          expect(account.balanceCents, `conta ${account.name}`).toBe(
            computeBalance(initial[account.id] as number, entries[account.id] as BalanceEntry[]),
          );
        }
        // Transferências nunca alteram o total: só receitas e despesas efetivadas mudam o patrimônio.
        const initialTotal = Object.values(initial).reduce((a, b) => a + b, 0);
        expect(items.reduce((sum, a) => sum + a.balanceCents, 0)).toBe(initialTotal + externalFlow);
      },
    );
  });
});
