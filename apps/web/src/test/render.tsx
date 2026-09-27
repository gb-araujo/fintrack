import type { AuthResponse } from '@fintrack/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import type { ReactElement } from 'react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { vi } from 'vitest';
import { AuthProvider } from '../features/auth/AuthProvider';
import { routes } from '../routes/routes';

function testQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

export function renderRoute(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(
    <QueryClientProvider client={testQueryClient()}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </QueryClientProvider>,
  );
  return { ...view, router };
}

export function renderWithQuery(ui: ReactElement) {
  return render(<QueryClientProvider client={testQueryClient()}>{ui}</QueryClientProvider>);
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): Response {
  return jsonResponse({ error: { code, message, ...(details ? { details } : {}) } }, status);
}

export const testUser = {
  id: '4b1f7a1e-3c1d-4a8e-9a55-0d3c2f1e9b77',
  name: 'Gabriel Araujo',
  email: 'gabriel@exemplo.com',
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  createdAt: '2026-09-26T12:00:00.000Z',
};

export function authResponse(accessToken = 'access-token-1'): AuthResponse {
  return {
    user: testUser,
    accessToken,
    accessTokenExpiresAt: '2026-09-26T12:15:00.000Z',
  };
}

export const healthyResponse = {
  status: 'ok',
  version: '0.0.0',
  uptimeSeconds: 1,
  timestamp: '2026-09-26T12:00:00.000Z',
  checks: { database: 'ok' },
};

/** Painel vazio (usuário sem dados): usado como padrão pelos mocks. */
export const emptyDashboard = {
  today: '2026-09-27',
  until: '2026-09-30',
  availableToSpend: {
    amountCents: 0,
    components: {
      liquidBalanceCents: 0,
      pendingIncomeCents: 0,
      pendingExpensesCents: 0,
      pendingTransfersInCents: 0,
      pendingTransfersOutCents: 0,
    },
  },
  totalBalanceCents: 0,
  investmentsCents: 0,
  netWorthCents: 0,
  month: { from: '2026-09-01', to: '2026-09-30', incomeCents: 0, expenseCents: 0 },
  pendingBills: { count: 0, totalCents: 0, overdueCount: 0, overdueCents: 0, next: [] },
  futureCommitments: { count: 0, totalCents: 0 },
};

type Handler = (request: { url: string; init: RequestInit }) => Response | Promise<Response>;

/**
 * Mock de fetch com roteamento por "MÉTODO /caminho". Rotas não declaradas falham o teste,
 * evitando chamadas acidentais.
 */
export function mockApi(routes: Record<string, Handler | Response>) {
  const fetchMock = vi.fn((input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = new URL(url, 'http://localhost').pathname;
    const key = `${(init.method ?? 'GET').toUpperCase()} ${path}`;
    const route = routes[key];
    if (!route) return Promise.reject(new Error(`Rota não mockada: ${key}`));
    return Promise.resolve(route instanceof Response ? route.clone() : route({ url, init }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Corpo JSON enviado na primeira chamada a um caminho da API. */
export function sentBody(fetchMock: ReturnType<typeof mockApi>, path: string): unknown {
  const call = fetchMock.mock.calls.find(([input]) =>
    (typeof input === 'string' ? input : input instanceof URL ? input.href : input.url).includes(
      path,
    ),
  );
  if (!call) throw new Error(`Nenhuma chamada para ${path}`);
  return JSON.parse(call[1]?.body as string);
}

/** Sessão existente (cookie válido) + API saudável. */
export function mockAuthenticatedApi(extra: Record<string, Handler | Response> = {}) {
  return mockApi({
    'POST /api/v1/auth/refresh': () => jsonResponse(authResponse()),
    'GET /health': () => jsonResponse(healthyResponse),
    'GET /api/v1/dashboard': () => jsonResponse(emptyDashboard),
    'GET /api/v1/accounts': () => jsonResponse({ items: [] }),
    ...extra,
  });
}

/** Sem sessão: /auth/refresh responde 401. */
export function mockAnonymousApi(extra: Record<string, Handler | Response> = {}) {
  return mockApi({
    'POST /api/v1/auth/refresh': () => errorResponse(401, 'UNAUTHORIZED', 'Sessão não encontrada.'),
    'GET /health': () => jsonResponse(healthyResponse),
    ...extra,
  });
}
