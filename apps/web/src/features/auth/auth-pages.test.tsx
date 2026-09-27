import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  authResponse,
  errorResponse,
  jsonResponse,
  mockAnonymousApi,
  mockAuthenticatedApi,
  renderRoute,
  sentBody,
} from '../../test/render';

describe('rotas protegidas', () => {
  it('sem sessão, qualquer página interna redireciona para o login', async () => {
    mockAnonymousApi();
    const { router } = renderRoute('/transactions');

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
  });

  it('com sessão válida (cookie), /login leva direto ao início', async () => {
    mockAuthenticatedApi();
    const { router } = renderRoute('/login');

    expect(await screen.findByRole('heading', { name: 'Início' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/');
  });
});

describe('LoginPage', () => {
  it('valida os campos antes de chamar a API', async () => {
    const fetchMock = mockAnonymousApi();
    renderRoute('/login');

    await userEvent.click(await screen.findByRole('button', { name: 'Entrar' }));

    expect(await screen.findByText('E-mail inválido.')).toBeInTheDocument();
    expect(screen.getByText('Informe a senha.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/auth/login'),
      expect.anything(),
    );
  });

  it('login correto volta para a página que o usuário tentou abrir', async () => {
    mockAnonymousApi({
      'POST /api/v1/auth/login': () => jsonResponse(authResponse()),
    });
    const { router } = renderRoute('/credit-cards');

    await userEvent.type(await screen.findByLabelText('E-mail'), 'Gabriel@Exemplo.com ');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-segura');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('heading', { name: 'Cartões' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/credit-cards');
  });

  it('envia o e-mail normalizado', async () => {
    const fetchMock = mockAnonymousApi({
      'POST /api/v1/auth/login': () => jsonResponse(authResponse()),
    });
    renderRoute('/login');

    await userEvent.type(await screen.findByLabelText('E-mail'), '  Gabriel@Exemplo.COM ');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-segura');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    await screen.findByRole('heading', { name: 'Início' });
    expect(sentBody(fetchMock, '/auth/login')).toEqual({
      email: 'gabriel@exemplo.com',
      password: 'senha-segura',
    });
  });

  it('credenciais inválidas mostram a mensagem genérica da API', async () => {
    mockAnonymousApi({
      'POST /api/v1/auth/login': () =>
        errorResponse(401, 'UNAUTHORIZED', 'E-mail ou senha inválidos.'),
    });
    renderRoute('/login');

    await userEvent.type(await screen.findByLabelText('E-mail'), 'a@b.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'errada');
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail ou senha inválidos.');
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeEnabled();
  });
});

describe('RegisterPage', () => {
  it('exige senha com no mínimo 8 caracteres', async () => {
    mockAnonymousApi();
    renderRoute('/register');

    await userEvent.type(await screen.findByLabelText('Nome'), 'Gabriel');
    await userEvent.type(screen.getByLabelText('E-mail'), 'g@exemplo.com');
    await userEvent.type(screen.getByLabelText('Senha'), '1234567');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(
      await screen.findByText('A senha deve ter pelo menos 8 caracteres.'),
    ).toBeInTheDocument();
  });

  it('cria a conta enviando o fuso do dispositivo e entra no app', async () => {
    const fetchMock = mockAnonymousApi({
      'POST /api/v1/auth/register': () => jsonResponse(authResponse(), 201),
    });
    renderRoute('/register');

    await userEvent.type(await screen.findByLabelText('Nome'), 'Gabriel Araujo');
    await userEvent.type(screen.getByLabelText('E-mail'), 'g@exemplo.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-segura');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('heading', { name: 'Início' })).toBeInTheDocument();
    const body = sentBody(fetchMock, '/auth/register') as { timezone?: string };
    expect(body.timezone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });

  it('e-mail já cadastrado mostra o erro da API', async () => {
    mockAnonymousApi({
      'POST /api/v1/auth/register': () =>
        errorResponse(409, 'CONFLICT', 'Este e-mail já está cadastrado.'),
    });
    renderRoute('/register');

    await userEvent.type(await screen.findByLabelText('Nome'), 'Gabriel');
    await userEvent.type(screen.getByLabelText('E-mail'), 'g@exemplo.com');
    await userEvent.type(screen.getByLabelText('Senha'), 'senha-segura');
    await userEvent.click(screen.getByRole('button', { name: 'Criar conta' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Este e-mail já está cadastrado.');
  });
});
