import { z } from 'zod';
import { dateOnlySchema } from '../dates/dates.js';
import { positiveCentsSchema } from '../money/money.js';
import { descriptionSchema } from './transactions.js';

/**
 * Importação de extratos (docs/financial-rules.md §6, ADR 0018). Fluxo:
 * arquivo → parser → normalização → detecção de duplicidade → sugestão (regras) → REVISÃO → confirmação.
 * Nada é gravado como lançamento antes da confirmação, e nada duvidoso é descartado em silêncio.
 */

/** Só CSV é implementado; a arquitetura de parsers já comporta OFX e PDF. */
export const IMPORT_SOURCES = ['csv', 'ofx', 'pdf'] as const;
export const importSourceSchema = z.enum(IMPORT_SOURCES);

export const MAX_IMPORT_ROWS = 5_000;
export const MAX_IMPORT_CHARS = 3_000_000;
/** Janela (± dias) para considerar um lançamento existente como possível duplicata. */
export const DUPLICATE_WINDOW_DAYS = 3;

export const importStatusSchema = z.enum(['review', 'confirmed', 'cancelled', 'reverted']);
export type ImportStatus = z.infer<typeof importStatusSchema>;

export const importRowStatusSchema = z.enum(['pending', 'imported', 'skipped']);

/** O que a linha vira ao importar. `card_payment` exige a fatura paga (nunca é despesa). */
export const importRowTypeSchema = z.enum(['income', 'expense', 'transfer', 'card_payment']);
export type ImportRowType = z.infer<typeof importRowTypeSchema>;

export const suggestionSourceSchema = z.enum([
  'user_rule',
  'default_rule',
  'own_account',
  'card_invoice',
  'none',
]);
export type SuggestionSource = z.infer<typeof suggestionSourceSchema>;

export const duplicateKindSchema = z.enum(['exact', 'possible']);
export type DuplicateKind = z.infer<typeof duplicateKindSchema>;

export const importDelimiterSchema = z.enum([';', ',', '\t', '|']);

/** Nomes de colunas (como aparecem no cabeçalho) para o caso de a detecção automática não bastar. */
export const columnMappingSchema = z.object({
  date: z.string().min(1).optional(),
  /** Uma ou mais colunas, juntadas com " - " (ex.: Histórico + Descrição). */
  description: z.array(z.string().min(1)).min(1).optional(),
  /** Valor com sinal (negativo = saída). */
  amount: z.string().min(1).optional(),
  /** Colunas separadas de débito/crédito (valores positivos). */
  debit: z.string().min(1).optional(),
  credit: z.string().min(1).optional(),
  externalId: z.string().min(1).optional(),
});
export type ColumnMapping = z.infer<typeof columnMappingSchema>;

export const createImportRequestSchema = z.object({
  accountId: z.uuid({ error: 'Escolha a conta do extrato.' }),
  filename: z.string().trim().min(1).max(200),
  content: z
    .string({ error: 'Envie o conteúdo do arquivo.' })
    .min(1, { error: 'O arquivo está vazio.' })
    .max(MAX_IMPORT_CHARS, { error: 'Arquivo grande demais (máximo ~3 MB).' }),
  source: importSourceSchema.default('csv'),
  delimiter: importDelimiterSchema.optional(),
  mapping: columnMappingSchema.optional(),
});
export type CreateImportRequest = z.input<typeof createImportRequestSchema>;

export const importRowSchema = z.object({
  id: z.uuid(),
  /** Linha do arquivo (1 = primeira), para o usuário localizar. */
  rowNumber: z.number().int().positive(),
  date: dateOnlySchema,
  amountCents: positiveCentsSchema,
  direction: z.enum(['in', 'out']),
  description: z.string(),
  normalizedDescription: z.string(),
  suggestedType: importRowTypeSchema,
  suggestedCategoryId: z.uuid().nullable(),
  /** Transferência: a outra conta. */
  suggestedTargetAccountId: z.uuid().nullable(),
  /** Pagamento de fatura: a fatura provável (mesmo valor em aberto). */
  suggestedInvoiceId: z.uuid().nullable(),
  suggestionSource: suggestionSourceSchema,
  /** Duplicidade: exata (mesma linha já importada) ou possível (lançamento parecido na janela). */
  duplicate: z
    .object({
      kind: duplicateKindSchema,
      transactionId: z.uuid().nullable(),
    })
    .nullable(),
  /** Ação padrão sugerida: duplicatas e pagamentos de fatura começam como "pular" (mas ficam visíveis). */
  defaultAction: z.enum(['import', 'skip']),
  status: importRowStatusSchema,
});
export type ImportRow = z.infer<typeof importRowSchema>;

export const importSummarySchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  source: importSourceSchema,
  filename: z.string(),
  status: importStatusSchema,
  rowsCount: z.number().int().nonnegative(),
  importedCount: z.number().int().nonnegative(),
  skippedCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime(),
  confirmedAt: z.iso.datetime().nullable(),
});
export type ImportSummary = z.infer<typeof importSummarySchema>;

export const importDetailSchema = importSummarySchema.extend({
  /** Como o arquivo foi lido (para conferir e corrigir o mapeamento, se preciso). */
  detected: z.object({
    delimiter: importDelimiterSchema,
    headers: z.array(z.string()),
    mapping: columnMappingSchema,
  }),
  /** Linhas do arquivo que NÃO viraram item (cabeçalho, total, valor zero, data inválida…). */
  ignoredRows: z.array(z.object({ line: z.number().int().positive(), reason: z.string() })),
  ignoredRowsCount: z.number().int().nonnegative(),
  rows: z.array(importRowSchema),
});
export type ImportDetail = z.infer<typeof importDetailSchema>;

export const importListResponseSchema = z.object({ items: z.array(importSummarySchema) });

export const importDecisionSchema = z.object({
  rowId: z.uuid(),
  action: z.enum(['import', 'skip']),
  /** Padrão: o tipo sugerido. */
  type: importRowTypeSchema.optional(),
  categoryId: z.uuid().nullish(),
  targetAccountId: z.uuid().nullish(),
  invoiceId: z.uuid().nullish(),
  description: descriptionSchema.optional(),
  /** Grava uma regra de comerciante a partir desta escolha (categoria/tipo/conta). */
  saveRule: z.boolean().optional(),
});
export type ImportDecision = z.infer<typeof importDecisionSchema>;

export const confirmImportRequestSchema = z.object({
  /** Linhas não listadas seguem a ação padrão sugerida. */
  decisions: z.array(importDecisionSchema).max(MAX_IMPORT_ROWS).default([]),
});
export type ConfirmImportRequest = z.input<typeof confirmImportRequestSchema>;

export const confirmImportResponseSchema = z.object({
  importId: z.uuid(),
  imported: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
  transfers: z.number().int().nonnegative(),
  cardPayments: z.number().int().nonnegative(),
  rulesSaved: z.number().int().nonnegative(),
});
export type ConfirmImportResponse = z.infer<typeof confirmImportResponseSchema>;

// ---------- Regras de comerciante ----------

export const MERCHANT_MATCH_TYPES = ['contains', 'starts_with'] as const;
export const merchantMatchTypeSchema = z.enum(MERCHANT_MATCH_TYPES);

const merchantPatternSchema = z
  .string({ error: 'Informe o texto a procurar.' })
  .trim()
  .min(2, { error: 'O texto precisa ter ao menos 2 caracteres.' })
  .max(100, { error: 'Texto muito longo (máximo 100 caracteres).' });

export const merchantRuleSchema = z.object({
  id: z.uuid(),
  /** Já normalizado (maiúsculas, sem acentos): é comparado com a descrição normalizada. */
  pattern: z.string(),
  matchType: merchantMatchTypeSchema,
  suggestedType: z.enum(['income', 'expense', 'transfer']),
  categoryId: z.uuid().nullable(),
  targetAccountId: z.uuid().nullable(),
  priority: z.number().int(),
  createdAt: z.iso.datetime(),
});
export type MerchantRule = z.infer<typeof merchantRuleSchema>;

export const createMerchantRuleRequestSchema = z
  .object({
    pattern: merchantPatternSchema,
    matchType: merchantMatchTypeSchema.default('contains'),
    suggestedType: z.enum(['income', 'expense', 'transfer']),
    categoryId: z.uuid().nullish(),
    targetAccountId: z.uuid().nullish(),
    priority: z.number().int().min(-100).max(100).default(0),
  })
  .superRefine((value, ctx) => {
    if (value.suggestedType === 'transfer' && !value.targetAccountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetAccountId'],
        message: 'Escolha a conta da transferência.',
      });
    }
    if (value.suggestedType !== 'transfer' && value.targetAccountId) {
      ctx.addIssue({
        code: 'custom',
        path: ['targetAccountId'],
        message: 'Conta de destino só vale para transferências.',
      });
    }
    if (value.suggestedType === 'transfer' && value.categoryId) {
      ctx.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: 'Transferências não têm categoria.',
      });
    }
  });
export type CreateMerchantRuleRequest = z.input<typeof createMerchantRuleRequestSchema>;

export const merchantRuleListResponseSchema = z.object({ items: z.array(merchantRuleSchema) });
