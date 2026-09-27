import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { callsTo, category, mockLedgerApi } from '../../test/ledger-mocks';
import { errorResponse, jsonResponse, renderRoute } from '../../test/render';

const categories = () => [
  category({ name: 'Salário', kind: 'income' }),
  category({ name: 'Moradia', kind: 'expense' }),
  category({ name: 'Lazer', kind: 'expense' }),
];

describe('CategoriesPage', () => {
  it('separa receitas e despesas', async () => {
    mockLedgerApi({ categories: categories() });
    renderRoute('/categories');

    const income = await screen.findByRole('list', { name: 'Receitas' });
    const expense = screen.getByRole('list', { name: 'Despesas' });

    expect(within(income).getAllByRole('listitem')).toHaveLength(1);
    expect(within(income).getByText('Salário')).toBeInTheDocument();
    expect(within(expense).getAllByRole('listitem')).toHaveLength(2);
  });

  it('cria categoria personalizada no tipo da seção', async () => {
    const fetchMock = mockLedgerApi(
      { categories: categories() },
      {
        'POST /api/v1/categories': () =>
          jsonResponse(category({ name: 'Pets', isDefault: false }), 201),
      },
    );
    renderRoute('/categories');

    await userEvent.type(await screen.findByLabelText('Nova categoria de despesa'), '  Pets ');
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Despesas' })).getByRole('button', {
        name: 'Adicionar',
      }),
    );

    await screen.findByRole('list', { name: 'Despesas' });
    expect(callsTo(fetchMock, 'POST', '/api/v1/categories')[0]?.body).toEqual({
      name: 'Pets',
      kind: 'expense',
    });
    expect(screen.getByLabelText('Nova categoria de despesa')).toHaveValue('');
  });

  it('não envia nome vazio e mostra o erro da API para nome repetido', async () => {
    const fetchMock = mockLedgerApi(
      { categories: categories() },
      {
        'POST /api/v1/categories': () =>
          errorResponse(409, 'CONFLICT', 'Já existe uma categoria ativa com esse nome.'),
      },
    );
    renderRoute('/categories');
    const receitas = await screen.findByRole('region', { name: 'Receitas' });

    await userEvent.click(within(receitas).getByRole('button', { name: 'Adicionar' }));
    expect(await within(receitas).findByText('Informe o nome da categoria.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/api/v1/categories')).toHaveLength(0);

    await userEvent.type(within(receitas).getByLabelText('Nova categoria de receita'), 'Salário');
    await userEvent.click(within(receitas).getByRole('button', { name: 'Adicionar' }));
    expect(
      await within(receitas).findByText('Já existe uma categoria ativa com esse nome.'),
    ).toBeInTheDocument();
  });

  it('renomeia e arquiva', async () => {
    const [salary] = categories() as [ReturnType<typeof category>];
    const fetchMock = mockLedgerApi(
      { categories: [salary] },
      {
        [`PATCH /api/v1/categories/${salary.id}`]: () =>
          jsonResponse({ ...salary, name: 'Pró-labore' }),
        [`POST /api/v1/categories/${salary.id}/archive`]: () =>
          jsonResponse({ ...salary, archivedAt: '2026-09-27T00:00:00.000Z' }),
      },
    );
    renderRoute('/categories');

    await userEvent.click(await screen.findByRole('button', { name: 'Renomear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Renomear categoria' });
    await userEvent.clear(within(dialog).getByLabelText('Nome'));
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Pró-labore');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    await screen.findByRole('button', { name: 'Renomear' });
    expect(callsTo(fetchMock, 'PATCH', `/api/v1/categories/${salary.id}`)[0]?.body).toEqual({
      name: 'Pró-labore',
    });

    await userEvent.click(screen.getByRole('button', { name: 'Arquivar' }));
    await screen.findByRole('list', { name: 'Receitas' });
    expect(callsTo(fetchMock, 'POST', `/api/v1/categories/${salary.id}/archive`)).toHaveLength(1);
  });
});
