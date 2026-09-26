import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { jsonResponse, renderRoute } from '../../test/render';
import { NAV_ITEMS } from './navigation';

function stubHealthyApi() {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue(
      jsonResponse({
        status: 'ok',
        version: '0.0.0',
        uptimeSeconds: 1,
        timestamp: new Date().toISOString(),
        checks: { database: 'ok' },
      }),
    ),
  );
}

describe('AppLayout', () => {
  it('mostra todas as seções na sidebar (desktop)', () => {
    stubHealthyApi();
    renderRoute('/');

    const sidebar = screen.getByRole('navigation', { name: 'Navegação principal' });
    for (const item of NAV_ITEMS) {
      expect(within(sidebar).getByRole('link', { name: item.label })).toBeInTheDocument();
    }
  });

  it('bottom navigation (mobile) tem no máximo 5 itens e inclui "Mais"', () => {
    stubHealthyApi();
    renderRoute('/');

    const bottom = screen.getByRole('navigation', { name: 'Navegação inferior' });
    const links = within(bottom).getAllByRole('link');
    expect(links).toHaveLength(5);
    expect(within(bottom).getByRole('link', { name: 'Mais' })).toBeInTheDocument();
  });

  it('marca o item ativo com aria-current', () => {
    renderRoute('/transactions');

    const sidebar = screen.getByRole('navigation', { name: 'Navegação principal' });
    expect(within(sidebar).getByRole('link', { name: 'Transações' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Transações' })).toBeInTheDocument();
    expect(screen.getByText(/disponível na FASE 2/i)).toBeInTheDocument();
  });

  it('mostra página 404 para rotas desconhecidas', () => {
    renderRoute('/nao-existe');
    expect(screen.getByRole('heading', { name: 'Página não encontrada' })).toBeInTheDocument();
  });
});
