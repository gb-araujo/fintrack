import { z } from 'zod';
import { positiveCentsSchema } from '../money/money.js';

/** Mês de referência "AAAA-MM". */
export const monthSchema = z
  .string({ error: 'Informe o mês.' })
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'Mês inválido. Use AAAA-MM.' });

export const upsertBudgetRequestSchema = z.object({
  categoryId: z.uuid({ error: 'Escolha a categoria.' }),
  month: monthSchema,
  limitCents: positiveCentsSchema,
});
export type UpsertBudgetRequest = z.infer<typeof upsertBudgetRequestSchema>;

export const listBudgetsQuerySchema = z.object({ month: monthSchema.optional() });

export const budgetSchema = z.object({
  id: z.uuid(),
  categoryId: z.uuid(),
  categoryName: z.string(),
  month: monthSchema,
  limitCents: positiveCentsSchema,
  /** Despesas efetivadas da categoria no mês (transferências não contam). */
  spentCents: z.number().int(),
  /** Despesas pendentes já previstas no mês (ainda não gastas). */
  pendingCents: z.number().int(),
  /** limite − gasto (negativo = estourou). */
  remainingCents: z.number().int(),
  /** Percentual do limite já gasto (arredondado; pode passar de 100). */
  percentUsed: z.number().int().nonnegative(),
  status: z.enum(['ok', 'warning', 'exceeded']),
});
export type Budget = z.infer<typeof budgetSchema>;

export const budgetListResponseSchema = z.object({
  month: monthSchema,
  items: z.array(budgetSchema),
  totals: z.object({
    limitCents: z.number().int(),
    spentCents: z.number().int(),
    remainingCents: z.number().int(),
  }),
  /** Despesas efetivadas do mês em categorias SEM orçamento (ou sem categoria). */
  unbudgetedSpentCents: z.number().int(),
});
export type BudgetList = z.infer<typeof budgetListResponseSchema>;

/** 80% do limite ou mais = atenção. */
export const BUDGET_WARNING_PERCENT = 80;
