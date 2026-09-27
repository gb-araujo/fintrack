import { describe, expect, it } from 'vitest';
import {
  createCreditCardRequestSchema,
  createPurchaseRequestSchema,
  payInvoiceRequestSchema,
  updateCreditCardRequestSchema,
} from './credit-cards.js';

const accountId = '4b1f7a1e-3c1d-4a8e-9a55-0d3c2f1e9b77';

describe('createCreditCardRequestSchema', () => {
  const base = { name: ' Nubank ', limitCents: 500_000, closingDay: 28, dueDay: 5 };

  it('aceita cartão válido e normaliza o nome', () => {
    expect(createCreditCardRequestSchema.parse(base).name).toBe('Nubank');
  });

  it('dias entre 1 e 31; limite positivo em centavos inteiros; nome obrigatório', () => {
    const parse = (patch: Record<string, unknown>) =>
      createCreditCardRequestSchema.safeParse({ ...base, ...patch }).success;

    expect(parse({ closingDay: 0 })).toBe(false);
    expect(parse({ closingDay: 32 })).toBe(false);
    expect(parse({ dueDay: 1.5 })).toBe(false);
    expect(parse({ limitCents: 0 })).toBe(false);
    expect(parse({ limitCents: 99.5 })).toBe(false);
    expect(parse({ name: '   ' })).toBe(false);
    expect(parse({ closingDay: 31, dueDay: 1 })).toBe(true);
  });

  it('atualização exige ao menos um campo', () => {
    expect(updateCreditCardRequestSchema.safeParse({}).success).toBe(false);
    expect(updateCreditCardRequestSchema.safeParse({ limitCents: 1_000 }).success).toBe(true);
    expect(updateCreditCardRequestSchema.safeParse({ paymentAccountId: null }).success).toBe(true);
  });
});

describe('createPurchaseRequestSchema', () => {
  const base = { description: 'Notebook', purchaseDate: '2026-09-27', totalAmountCents: 90_000 };

  it('1 parcela por padrão; até 48', () => {
    expect(createPurchaseRequestSchema.parse(base).installmentsCount).toBe(1);
    expect(createPurchaseRequestSchema.safeParse({ ...base, installmentsCount: 48 }).success).toBe(
      true,
    );
    expect(createPurchaseRequestSchema.safeParse({ ...base, installmentsCount: 49 }).success).toBe(
      false,
    );
    expect(createPurchaseRequestSchema.safeParse({ ...base, installmentsCount: 0 }).success).toBe(
      false,
    );
    expect(createPurchaseRequestSchema.safeParse({ ...base, installmentsCount: 2.5 }).success).toBe(
      false,
    );
  });

  it('descrição obrigatória, valor positivo em centavos inteiros e data válida', () => {
    const parse = (patch: Record<string, unknown>) =>
      createPurchaseRequestSchema.safeParse({ ...base, ...patch }).success;

    expect(parse({ description: '' })).toBe(false);
    expect(parse({ totalAmountCents: 0 })).toBe(false);
    expect(parse({ totalAmountCents: 10.5 })).toBe(false);
    expect(parse({ purchaseDate: '2026-02-30' })).toBe(false);
  });
});

describe('payInvoiceRequestSchema', () => {
  it('só a conta é obrigatória; valor, se informado, é positivo', () => {
    expect(payInvoiceRequestSchema.safeParse({ accountId }).success).toBe(true);
    expect(payInvoiceRequestSchema.safeParse({ accountId, amountCents: 0 }).success).toBe(false);
    expect(payInvoiceRequestSchema.safeParse({ amountCents: 100 }).success).toBe(false);
    expect(
      payInvoiceRequestSchema.safeParse({ accountId, paymentDate: '2026-10-05' }).success,
    ).toBe(true);
  });
});
