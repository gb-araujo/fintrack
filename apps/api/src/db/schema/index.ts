/**
 * Schema Drizzle do FINTRACK (desenho completo em docs/architecture.md).
 * Migrations geradas vão para database/migrations (ver drizzle.config.ts).
 *
 * FASE 1: users, refresh_tokens.
 * FASE 2: accounts, categories, transfers, transactions.
 */
export * from './enums.js';
export * from './users.js';
export * from './refresh-tokens.js';
export * from './accounts.js';
export * from './categories.js';
export * from './transfers.js';
export * from './recurring.js';
export * from './transactions.js';
export * from './budgets.js';
