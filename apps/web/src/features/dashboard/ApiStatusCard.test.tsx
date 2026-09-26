import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderWithQuery } from '../../test/render';
import { ApiStatusCard } from './ApiStatusCard';

const healthy = {
  status: 'ok',
  version: '1.2.3',
  uptimeSeconds: 10,
  timestamp: new Date().toISOString(),
  checks: { database: 'ok' },
};

describe('ApiStatusCard', () => {
  it('mostra API online quando /health responde ok', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(healthy)));
    renderWithQuery(<ApiStatusCard />);

    expect(await screen.findByText('API online')).toBeInTheDocument();
    expect(screen.getByText(/Banco de dados: conectado/)).toBeInTheDocument();
  });

  it('mostra degradação quando o banco está fora', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ ...healthy, status: 'degraded', checks: { database: 'error' } }, 503),
        ),
    );
    renderWithQuery(<ApiStatusCard />);

    expect(await screen.findByText('API com problemas')).toBeInTheDocument();
    expect(screen.getByText(/Banco de dados: indisponível/)).toBeInTheDocument();
  });

  it('mostra API indisponível em falha de rede', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    renderWithQuery(<ApiStatusCard />);

    expect(await screen.findByText('API indisponível')).toBeInTheDocument();
  });
});
