/**
 * Schema Drizzle do FINTRACK (desenho completo em docs/architecture.md).
 * Migrations geradas vão para database/migrations (ver drizzle.config.ts).
 *
 * FASE 1: users, refresh_tokens.
 * FASE 2: accounts, categories, transfers, transactions.
 * FASE 4: recurring_transactions, budgets. FASE 5: credit_cards, invoices, compras e parcelas.
 * FASE 6: imports, imported_transactions, merchant_rules.
 */
export * from './enums.js';
export * from './users.js';
export * from './refresh-tokens.js';
export * from './accounts.js';
export * from './categories.js';
export * from './transfers.js';
export * from './recurring.js';
export * from './credit-cards.js';
export * from './investments.js';
export * from './transactions.js';
export * from './budgets.js';
export * from './imports.js';
