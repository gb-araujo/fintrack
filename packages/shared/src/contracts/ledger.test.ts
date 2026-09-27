import { describe, expect, it } from 'vitest';
import { createAccountRequestSchema, updateAccountRequestSchema } from './accounts.js';
import { createTransactionRequestSchema, listTransactionsQuerySchema } from './transactions.js';
import { createTransferRequestSchema } from './transfers.js';

const ID_A = '4b1f7a1e-3c1d-4a8e-9a55-0d3c2f1e9b77';
const ID_B = '9c2e8b2f-4d2e-4b9f-8b66-1e4d3a2f0c88';

describe('createAccountRequestSchema', () => {
  it('saldo inicial padrão é zero e pode ser negativo', () => {
    expect(createAccountRequestSchema.parse({ name: ' Inter ', type: 'bank' })).toMatchObject({
      name: 'Inter',
      initialBalanceCents: 0,
    });
    expect(
      createAccountRequestSchema.parse({ name: 'Inter', type: 'bank', initialBalanceCents: -15000 })
        .initialBalanceCents,
    ).toBe(-15000);
  });

  it('rejeita centavos fracionados e tipo desconhecido', () => {
    expect(
      createAccountRequestSchema.safeParse({ name: 'X', type: 'bank', initialBalanceCents: 10.5 })
        .success,
    ).toBe(false);
    expect(createAccountRequestSchema.safeParse({ name: 'X', type: 'poupanca' }).success).toBe(
      false,
    );
  });

  it('atualização exige ao menos um campo', () => {
    expect(updateAccountRequestSchema.safeParse({}).success).toBe(false);
    expect(updateAccountRequestSchema.safeParse({ name: 'Novo' }).success).toBe(true);
  });
});

describe('createTransactionRequestSchema', () => {
  const base = {
    accountId: ID_A,
    type: 'expense',
    amountCents: 9099,
    transactionDate: '2026-09-27',
  };

  it('aceita lançamento mínimo e aplica padrões', () => {
    expect(createTransactionRequestSchema.parse(base)).toMatchObject({ description: '' });
  });

  it('valor deve ser positivo e inteiro', () => {
    expect(createTransactionRequestSchema.safeParse({ ...base, amountCents: 0 }).success).toBe(
      false,
    );
    expect(createTransactionRequestSchema.safeParse({ ...base, amountCents: -5 }).success).toBe(
      false,
    );
    expect(createTransactionRequestSchema.safeParse({ ...base, amountCents: 1.5 }).success).toBe(
      false,
    );
  });

  it('não aceita "transfer" nem "card_payment" como lançamento manual', () => {
    expect(createTransactionRequestSchema.safeParse({ ...base, type: 'transfer' }).success).toBe(
      false,
    );
    expect(
      createTransactionRequestSchema.safeParse({ ...base, type: 'card_payment' }).success,
    ).toBe(false);
  });

  it('data precisa existir no calendário', () => {
    expect(
      createTransactionRequestSchema.safeParse({ ...base, transactionDate: '2026-02-30' }).success,
    ).toBe(false);
  });
});

describe('createTransferRequestSchema', () => {
  const base = {
    fromAccountId: ID_A,
    toAccountId: ID_B,
    amountCents: 10000,
    transferDate: '2026-09-27',
  };

  it('exige contas diferentes', () => {
    expect(createTransferRequestSchema.safeParse(base).success).toBe(true);
    const same = createTransferRequestSchema.safeParse({ ...base, toAccountId: ID_A });
    expect(same.success).toBe(false);
  });
});

describe('listTransactionsQuerySchema', () => {
  it('converte limit e booleanos da query string', () => {
    expect(
      listTransactionsQuerySchema.parse({ limit: '20', includeCancelled: 'true' }),
    ).toMatchObject({
      limit: 20,
      includeCancelled: true,
    });
  });

  it('limita o tamanho da página', () => {
    expect(listTransactionsQuerySchema.safeParse({ limit: '101' }).success).toBe(false);
  });

  it('período invertido é inválido', () => {
    expect(
      listTransactionsQuerySchema.safeParse({ from: '2026-09-30', to: '2026-09-01' }).success,
    ).toBe(false);
  });
});
