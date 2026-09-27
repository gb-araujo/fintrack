import { z } from 'zod';
import { dateOnlySchema } from '../dates/dates.js';
import { centsSchema, signedCentsSchema } from '../money/money.js';

/**
 * Rendimentos de investimento (FASE 8, ADR 0020). Rendimento nunca é um número solto: é sempre
 * DERIVADO de duas "avaliações" (o valor da posição em duas datas) descontando aportes e resgates
 * no meio do caminho — por isso todo histórico de avaliações é preservado, nunca sobrescrito.
 *
 *   rendimento(A → B) = saldo(B) − saldo(A) − aportes líquidos entre A e B
 */

/** Uma avaliação: "minha posição valia X nesta data" (o extrato da corretora, checado pelo usuário). */
export const investmentValuationSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  date: dateOnlySchema,
  balanceCents: centsSchema,
  note: z.string().nullable(),
  /** Rendimento desde a avaliação (ou aporte inicial) anterior — null na primeira avaliação. */
  yieldCents: signedCentsSchema.nullable(),
  /** Percentual do rendimento sobre o saldo anterior — null quando `yieldCents` é null ou a base é 0. */
  yieldPercent: z.number().nullable(),
  /** Aplicações − resgates no intervalo (para o usuário conferir a conta do rendimento). */
  contributedCents: signedCentsSchema,
  createdAt: z.iso.datetime(),
});
export type InvestmentValuation = z.infer<typeof investmentValuationSchema>;

export const upsertValuationRequestSchema = z.object({
  date: dateOnlySchema,
  balanceCents: centsSchema,
  note: z.string().trim().max(200).nullish(),
});
export type UpsertValuationRequest = z.input<typeof upsertValuationRequestSchema>;

export const valuationListResponseSchema = z.object({ items: z.array(investmentValuationSchema) });

/** Um investimento com o resumo de rendimento desde a primeira avaliação (ou desde sempre, se nenhuma). */
export const investmentSummarySchema = z.object({
  accountId: z.uuid(),
  accountName: z.string(),
  institution: z.string().nullable(),
  product: z.string().nullable(),
  balanceCents: signedCentsSchema,
  /** Aplicado − resgatado desde a criação da conta (não é rendimento). */
  netContributedCents: signedCentsSchema,
  /** null = nenhuma avaliação registrada ainda (rendimento desconhecido). */
  latestValuationDate: dateOnlySchema.nullable(),
  totalYieldCents: signedCentsSchema.nullable(),
  totalYieldPercent: z.number().nullable(),
});
export type InvestmentSummary = z.infer<typeof investmentSummarySchema>;

export const investmentListResponseSchema = z.object({ items: z.array(investmentSummarySchema) });

export const updateInvestmentDetailsRequestSchema = z
  .object({
    institution: z.string().trim().max(80).nullish(),
    product: z.string().trim().max(80).nullish(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    error: 'Informe ao menos um campo para atualizar.',
  });
export type UpdateInvestmentDetailsRequest = z.infer<typeof updateInvestmentDetailsRequestSchema>;
