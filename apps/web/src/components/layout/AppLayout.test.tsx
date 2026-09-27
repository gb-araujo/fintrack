import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { mockAuthenticatedApi, renderRoute, testUser } from '../../test/render';
import { NAV_ITEMS } from './navigation';

describe('AppLayout (usuário autenticado)', () => {
  it('mostra todas as seções na sidebar (desktop) e o usuário logado', async () => {
    mockAuthenticatedApi();
    renderRoute('/');

    const sidebar = await screen.findByRole('navigation', { name: 'Navegação principal' });
    for (const item of NAV_ITEMS) {
      expect(within(sidebar).getByRole('link', { name: item.label })).toBeInTheDocument();
    }
    expect(screen.getByText(testUser.email)).toBeInTheDocument();
    expect(screen.getByText(/Olá, Gabriel!/)).toBeInTheDocument();
  });

  it('bottom navigation (mobile) tem no máximo 5 itens e inclui "Mais"', async () => {
    mockAuthenticatedApi();
    renderRoute('/');

    const bottom = await screen.findByRole('navigation', { name: 'Navegação inferior' });
    expect(within(bottom).getAllByRole('link')).toHaveLength(5);
    expect(within(bottom).getByRole('link', { name: 'Mais' })).toBeInTheDocument();
  });

  it('marca o item ativo com aria-current', async () => {
    mockAuthenticatedApi();
    renderRoute('/budgets');

    const sidebar = await screen.findByRole('navigation', { name: 'Navegação principal' });
    expect(within(sidebar).getByRole('link', { name: 'Orçamentos' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByText(/disponível na FASE 4/i)).toBeInTheDocument();
  });

  it('mostra página 404 para rotas desconhecidas', async () => {
    mockAuthenticatedApi();
    renderRoute('/nao-existe');
    expect(
      await screen.findByRole('heading', { name: 'Página não encontrada' }),
    ).toBeInTheDocument();
  });

  it('"Sair" encerra a sessão na API e volta para o login', async () => {
    const fetchMock = mockAuthenticatedApi({
      'POST /api/v1/auth/logout': () => new Response(null, { status: 204 }),
    });
    renderRoute('/');

    const [logoutButton] = await screen.findAllByRole('button', { name: 'Sair' });
    await userEvent.click(logoutButton!);

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/logout'),
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });
});
