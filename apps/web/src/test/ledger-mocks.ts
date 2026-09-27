import { randomUUID } from 'node:crypto';
import type {
  Account,
  Budget,
  Category,
  Occurrence,
  Recurring,
  Transaction,
} from '@fintrack/shared';
import { authResponse, emptyDashboard, healthyResponse, jsonResponse, mockApi } from './render';

type Handler = Parameters<typeof mockApi>[0][string];

const NOW = '2026-09-27T12:00:00.000Z';

export function account(overrides: Partial<Account> = {}): Account {
  return {
    id: randomUUID(),
    name: 'Banco Inter',
    type: 'bank',
    initialBalanceCents: 0,
    balanceCents: 0,
    includeInAvailable: true,
    archivedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

export function category(overrides: Partial<Category> = {}): Category {
  return {
    id: randomUUID(),
    name: 'Alimentação',
    kind: 'expense',
    isDefault: true,
    archivedAt: null,
    createdAt: NOW,
    ...overrides,
  };
}

export function transaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: randomUUID(),
    accountId: randomUUID(),
    categoryId: null,
    type: 'expense',
    amountCents: 1000,
    description: '',
    transactionDate: '2026-09-20',
    paymentMethod: null,
    status: 'completed',
    transfer: null,
    recurringId: null,
    createdAt: NOW,
    updatedAt: NOW,
    ...overrides,
  };
}

export function recurring(overrides: Partial<Recurring> = {}): Recurring {
  return {
    id: randomUUID(),
    name: 'Aluguel',
    type: 'expense',
    amountCents: 150_000,
    isVariableAmount: false,
    accountId: randomUUID(),
    categoryId: null,
    frequency: 'monthly',
    interval: 1,
    dayOfMonth: 5,
    startDate: '2026-01-05',
    endDate: null,
    autoConfirm: false,
    includeInForecast: true,
    active: true,
    nextDate: '2026-10-05',
    createdAt: NOW,
    ...overrides,
  };
}

export function occurrence(overrides: Partial<Occurrence> = {}): Occurrence {
  return {
    recurringId: randomUUID(),
    name: 'Aluguel',
    type: 'expense',
    date: '2026-10-05',
    amountCents: 150_000,
    estimated: false,
    accountId: randomUUID(),
    categoryId: null,
    overdue: false,
    ...overrides,
  };
}

export function budget(overrides: Partial<Budget> = {}): Budget {
  return {
    id: randomUUID(),
    categoryId: randomUUID(),
    categoryName: 'Alimentação',
    month: '2026-09',
    limitCents: 80_000,
    spentCents: 20_000,
    pendingCents: 0,
    remainingCents: 60_000,
    percentUsed: 25,
    status: 'ok',
    ...overrides,
  };
}

export interface LedgerState {
  accounts?: Account[];
  categories?: Category[];
  /** Páginas de lançamentos por cursor ('' = primeira página). */
  pages?: Record<string, { items: Transaction[]; nextCursor: string | null }>;
}

/**
 * Mock de fetch para as telas do livro-caixa: sessão válida (cookie), health e as listagens.
 * `extra` acrescenta/sobrescreve rotas ("MÉTODO /caminho"), ex.: as mutações do teste.
 */
export function mockLedgerApi(state: LedgerState = {}, extra: Record<string, Handler> = {}) {
  const accounts = state.accounts ?? [];
  const categories = state.categories ?? [];
  const pages = state.pages ?? { '': { items: [], nextCursor: null } };

  const query = (url: string) => new URL(url, 'http://localhost').searchParams;

  return mockApi({
    'POST /api/v1/auth/refresh': () => jsonResponse(authResponse()),
    'GET /health': () => jsonResponse(healthyResponse),
    'GET /api/v1/dashboard': () => jsonResponse(emptyDashboard),
    'GET /api/v1/accounts': ({ url }) =>
      jsonResponse({
        items: accounts.filter(
          (item) => query(url).get('includeArchived') === 'true' || item.archivedAt === null,
        ),
      }),
    'GET /api/v1/categories': ({ url }) =>
      jsonResponse({
        items: categories.filter(
          (item) => query(url).get('includeArchived') === 'true' || item.archivedAt === null,
        ),
      }),
    'GET /api/v1/transactions': ({ url }) =>
      jsonResponse(pages[query(url).get('cursor') ?? ''] ?? { items: [], nextCursor: null }),
    ...extra,
  });
}

type FetchMock = ReturnType<typeof mockApi>;

function urlOf(input: unknown): string {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.href
      : (input as Request).url;
}

function pathOf(input: unknown): string {
  return new URL(urlOf(input), 'http://localhost').pathname;
}

/** Chamadas feitas a "MÉTODO /caminho", com o corpo JSON já decodificado. */
export function callsTo(fetchMock: FetchMock, method: string, path: string) {
  return fetchMock.mock.calls
    .filter(
      ([input, init]) => pathOf(input) === path && (init?.method ?? 'GET').toUpperCase() === method,
    )
    .map(([input, init]) => ({
      url: urlOf(input),
      body: init?.body ? (JSON.parse(init.body as string) as Record<string, unknown>) : undefined,
    }));
}

export function lastQuery(fetchMock: FetchMock, path: string): URLSearchParams {
  const calls = callsTo(fetchMock, 'GET', path);
  const last = calls.at(-1);
  if (!last) throw new Error(`Nenhuma chamada GET ${path}`);
  return new URL(last.url, 'http://localhost').searchParams;
}
