import type { ImportRowType, SuggestionSource } from '@fintrack/shared';
import { CARD_PAYMENT_PATTERNS, DEFAULT_MERCHANT_RULES } from './default-rules.js';
import { normalizeDescription, tokens } from './normalize.js';

export interface RuleLike {
  id: string;
  /** Já normalizado. */
  pattern: string;
  matchType: 'contains' | 'starts_with';
  suggestedType: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  targetAccountId: string | null;
  priority: number;
}

export interface CategoryLike {
  id: string;
  name: string;
  kind: 'income' | 'expense';
}

export interface AccountLike {
  id: string;
  name: string;
}

export interface PayableInvoiceLike {
  id: string;
  payableCents: number;
  dueDate: string;
}

export interface SuggestionContext {
  /** Conta do extrato (nunca é destino de transferência sugerida). */
  accountId: string;
  userRules: readonly RuleLike[];
  /** Categorias ativas do usuário. */
  categories: readonly CategoryLike[];
  /** Contas ativas do usuário. */
  accounts: readonly AccountLike[];
  payableInvoices: readonly PayableInvoiceLike[];
}

export interface RowToSuggest {
  direction: 'in' | 'out';
  amountCents: number;
  normalized: string;
}

export interface Suggestion {
  type: ImportRowType;
  categoryId: string | null;
  targetAccountId: string | null;
  invoiceId: string | null;
  source: SuggestionSource;
}

/** Palavras genéricas que não identificam uma conta ("Banco Inter" é reconhecida por "INTER"). */
const GENERIC_ACCOUNT_WORDS = new Set([
  'BANCO',
  'CONTA',
  'CORRENTE',
  'POUPANCA',
  'CARTEIRA',
  'DIGITAL',
  'DE',
  'DO',
  'DA',
  'MEU',
  'MINHA',
]);

function distinctiveName(accountName: string): string {
  const normalized = normalizeDescription(accountName);
  const distinctive = tokens(normalized).filter((token) => !GENERIC_ACCOUNT_WORDS.has(token));
  return distinctive.length > 0 ? distinctive.join(' ') : normalized;
}

const includesWord = (normalized: string, pattern: string) =>
  ` ${normalized} `.includes(` ${pattern} `);

function ruleMatches(rule: RuleLike, normalized: string): boolean {
  return rule.matchType === 'starts_with'
    ? normalized.startsWith(rule.pattern)
    : normalized.includes(rule.pattern);
}

/** O tipo da regra precisa fazer sentido para o sentido do dinheiro (receita só entra, despesa só sai). */
function typeFitsDirection(type: 'income' | 'expense' | 'transfer', direction: 'in' | 'out') {
  return type === 'transfer' || (type === 'income') === (direction === 'in');
}

const defaultType = (direction: 'in' | 'out'): 'income' | 'expense' =>
  direction === 'in' ? 'income' : 'expense';

/**
 * Sugere o que a linha é. Ordem (a primeira que casa vence; nada é decidido pelo usuário aqui):
 * 1. regra do próprio usuário (maior prioridade e padrão mais específico primeiro);
 * 2. pagamento de fatura de cartão (NUNCA despesa: já foi contado nas parcelas) — com a fatura
 *    provável quando o valor bate com o em aberto de exatamente uma;
 * 3. movimentação entre contas do usuário (descrição cita outra conta dele) → transferência;
 * 4. regras padrão (TELEFONICA BRAS → Internet, SABESP → Água…);
 * 5. sem sugestão: receita/despesa sem categoria.
 */
export function suggest(row: RowToSuggest, context: SuggestionContext): Suggestion {
  const rules = [...context.userRules].sort(
    (a, b) =>
      b.priority - a.priority || b.pattern.length - a.pattern.length || a.id.localeCompare(b.id),
  );
  for (const rule of rules) {
    if (
      !ruleMatches(rule, row.normalized) ||
      !typeFitsDirection(rule.suggestedType, row.direction)
    ) {
      continue;
    }
    if (rule.suggestedType === 'transfer') {
      if (!rule.targetAccountId || rule.targetAccountId === context.accountId) continue;
      return {
        type: 'transfer',
        categoryId: null,
        targetAccountId: rule.targetAccountId,
        invoiceId: null,
        source: 'user_rule',
      };
    }
    return {
      type: rule.suggestedType,
      categoryId: rule.categoryId,
      targetAccountId: null,
      invoiceId: null,
      source: 'user_rule',
    };
  }

  if (row.direction === 'out' && CARD_PAYMENT_PATTERNS.some((p) => p.test(row.normalized))) {
    const matching = context.payableInvoices
      .filter((invoice) => invoice.payableCents === row.amountCents)
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
    const invoice = matching[0];
    return {
      type: 'card_payment',
      categoryId: null,
      targetAccountId: null,
      invoiceId: invoice?.id ?? null,
      source: invoice ? 'card_invoice' : 'default_rule',
    };
  }

  const ownAccount = context.accounts
    .filter((account) => account.id !== context.accountId)
    .map((account) => ({ account, name: distinctiveName(account.name) }))
    .filter(({ name }) => name.length >= 4 && includesWord(row.normalized, name))
    .sort((a, b) => b.name.length - a.name.length || a.account.id.localeCompare(b.account.id))[0];
  if (ownAccount) {
    return {
      type: 'transfer',
      categoryId: null,
      targetAccountId: ownAccount.account.id,
      invoiceId: null,
      source: 'own_account',
    };
  }

  const kind = defaultType(row.direction);
  for (const rule of DEFAULT_MERCHANT_RULES) {
    if (rule.direction !== row.direction || !includesWord(row.normalized, rule.pattern)) continue;
    const wanted = normalizeDescription(rule.categoryName);
    const category = context.categories.find(
      (item) => item.kind === kind && normalizeDescription(item.name) === wanted,
    );
    if (category) {
      return {
        type: kind,
        categoryId: category.id,
        targetAccountId: null,
        invoiceId: null,
        source: 'default_rule',
      };
    }
  }

  return { type: kind, categoryId: null, targetAccountId: null, invoiceId: null, source: 'none' };
}
