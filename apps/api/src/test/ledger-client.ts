import {
  authResponseSchema,
  todayInTimeZone,
  type Account,
  type Category,
  type InvestmentSummary,
  type InvestmentValuation,
  type Transaction,
  type Transfer,
} from '@fintrack/shared';
import type { LightMyRequestResponse } from 'fastify';
import { expect } from 'vitest';
import { buildApp, type App } from '../app.js';
import { createDatabase, type DatabaseConnection } from '../db/client.js';
import { randomIp, testConfig, uniqueEmail } from './helpers.js';

export const databaseUrl = process.env.TEST_DATABASE_URL;

export interface LedgerTestEnv {
  app: App;
  database: DatabaseConnection;
  close(): Promise<void>;
}

/** App real + PostgreSQL de teste. Limite de taxa alto: estes testes fazem muitas requisições. */
export async function createLedgerTestEnv(): Promise<LedgerTestEnv> {
  const database = createDatabase(databaseUrl ?? '', { maxConnections: 5 });
  const app = await buildApp({
    config: testConfig({ DATABASE_URL: databaseUrl ?? '', RATE_LIMIT_MAX: '100000' }),
    database,
  });
  await app.ready();
  return {
    app,
    database,
    close: async () => {
      await app.close();
      await database.close();
    },
  };
}

export class TestClient {
  constructor(
    readonly app: App,
    readonly token: string,
    readonly userId: string,
    readonly email: string,
    readonly timezone: string,
  ) {}

  /** "Hoje" para este usuário (no fuso dele), como a API calcula. */
  today(offsetDays = 0): string {
    const base = todayInTimeZone(this.timezone);
    if (offsetDays === 0) return base;
    const [y, m, d] = base.split('-').map(Number) as [number, number, number];
    return new Date(Date.UTC(y, m - 1, d + offsetDays)).toISOString().slice(0, 10);
  }

  request(method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
    return this.app.inject({
      method,
      url: `/api/v1${url}`,
      headers: { authorization: `Bearer ${this.token}` },
      remoteAddress: randomIp(),
      ...(payload !== undefined ? { payload: payload as Record<string, unknown> } : {}),
    });
  }

  get = (url: string) => this.request('GET', url);
  post = (url: string, payload?: unknown) => this.request('POST', url, payload);
  patch = (url: string, payload: unknown) => this.request('PATCH', url, payload);
  put = (url: string, payload: unknown) => this.request('PUT', url, payload);
  delete = (url: string) => this.request('DELETE', url);

  /** Executa e exige o status esperado; devolve o corpo JSON. */
  async ok<T>(response: LightMyRequestResponse | Promise<LightMyRequestResponse>, status = 200) {
    const res = await response;
    expect(res.statusCode, res.body).toBe(status);
    return res.json<T>();
  }

  createAccount(input: {
    name: string;
    type?: 'bank' | 'wallet' | 'investment';
    initialBalanceCents?: number;
  }) {
    return this.ok<Account>(this.post('/accounts', { type: 'bank', ...input }), 201);
  }

  async categoryId(name: string, kind: 'income' | 'expense'): Promise<string> {
    const { items } = await this.ok<{ items: Category[] }>(this.get(`/categories?kind=${kind}`));
    const category = items.find((c) => c.name === name);
    if (!category) throw new Error(`Categoria padrão não encontrada: ${name}`);
    return category.id;
  }

  addTransaction(input: {
    accountId: string;
    type: 'income' | 'expense';
    amountCents: number;
    transactionDate?: string;
    status?: 'pending' | 'completed';
    categoryId?: string;
    description?: string;
  }) {
    return this.ok<Transaction>(
      this.post('/transactions', { transactionDate: this.today(), ...input }),
      201,
    );
  }

  transfer(input: {
    fromAccountId: string;
    toAccountId: string;
    amountCents: number;
    transferDate?: string;
    status?: 'pending' | 'completed';
  }) {
    return this.ok<Transfer>(
      this.post('/transfers', { transferDate: this.today(), ...input }),
      201,
    );
  }

  async balanceOf(accountId: string): Promise<number> {
    const account = await this.ok<Account>(this.get(`/accounts/${accountId}`));
    return account.balanceCents;
  }

  async totalBalance(): Promise<number> {
    const { items } = await this.ok<{ items: Account[] }>(
      this.get('/accounts?includeArchived=true'),
    );
    return items.reduce((sum, account) => sum + account.balanceCents, 0);
  }

  investments() {
    return this.ok<{ items: InvestmentSummary[] }>(this.get('/investments'));
  }

  valuations(accountId: string) {
    return this.ok<{ items: InvestmentValuation[] }>(
      this.get(`/investments/${accountId}/valuations`),
    );
  }

  upsertValuation(
    accountId: string,
    input: { date?: string; balanceCents: number; note?: string | null },
  ) {
    return this.ok<InvestmentValuation>(
      this.put(`/investments/${accountId}/valuations`, { date: this.today(), ...input }),
    );
  }

  async listAll(query = ''): Promise<Transaction[]> {
    const all: Transaction[] = [];
    let cursor: string | null = null;
    do {
      const page: { items: Transaction[]; nextCursor: string | null } = await this.ok(
        this.get(`/transactions?limit=100${query}${cursor ? `&cursor=${cursor}` : ''}`),
      );
      all.push(...page.items);
      cursor = page.nextCursor;
    } while (cursor);
    return all;
  }
}

/** Cadastra um usuário novo (IP exclusivo: o cadastro tem limite de 5/min por IP). */
export async function registerUser(app: App, timezone = 'America/Sao_Paulo'): Promise<TestClient> {
  const email = uniqueEmail('ledger');
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    headers: { 'x-client': 'android' },
    remoteAddress: randomIp(),
    payload: { name: 'Pessoa Teste', email, password: 'senha-muito-segura', timezone },
  });
  expect(response.statusCode, response.body).toBe(201);
  const body = authResponseSchema.parse(response.json());
  return new TestClient(app, body.accessToken, body.user.id, email, timezone);
}
