import { todayInTimeZone } from '@fintrack/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import { budget, callsTo, category, lastQuery, mockLedgerApi } from '../../test/ledger-mocks';
import { errorResponse, jsonResponse, renderRoute } from '../../test/render';
import { shiftMonth } from '../ledger/labels';

const month = todayInTimeZone('America/Sao_Paulo').slice(0, 7);
const food = category({ name: 'Alimentação' });
const leisure = category({ name: 'Lazer' });
const transport = category({ name: 'Transporte' });
const salary = category({ name: 'Salário', kind: 'income' });

const foodBudget = budget({
  categoryId: food.id,
  categoryName: 'Alimentação',
  month,
  limitCents: 80_000,
  spentCents: 20_000,
  remainingCents: 60_000,
  percentUsed: 25,
  status: 'ok',
});
const leisureBudget = budget({
  categoryId: leisure.id,
  categoryName: 'Lazer',
  month,
  limitCents: 40_000,
  spentCents: 52_000,
  remainingCents: -12_000,
  percentUsed: 130,
  status: 'exceeded',
  pendingCents: 3_000,
});

function list(items = [foodBudget, leisureBudget], unbudgetedSpentCents = 0) {
  const limitCents = items.reduce((sum, item) => sum + item.limitCents, 0);
  const spentCents = items.reduce((sum, item) => sum + item.spentCents, 0);
  return {
    month,
    items,
    totals: { limitCents, spentCents, remainingCents: limitCents - spentCents },
    unbudgetedSpentCents,
  };
}

function mockBudgets(extra: Parameters<typeof mockLedgerApi>[1] = {}, body = list()) {
  return mockLedgerApi(
    { categories: [food, leisure, transport, salary] },
    { 'GET /api/v1/budgets': () => jsonResponse(body), ...extra },
  );
}

describe('BudgetsPage', () => {
  it('mostra limite, gasto, restante e percentual calculados pelo backend', async () => {
    mockBudgets({}, list(undefined, 13_000));
    renderRoute('/budgets');

    const items = await screen.findByRole('list', { name: 'Orçamentos' });
    const [first, second] = within(items).getAllByRole('listitem') as [HTMLElement, HTMLElement];

    expect(first).toHaveTextContent('Alimentação');
    expect(first).toHaveTextContent('Dentro do limite');
    expect(first).toHaveTextContent(/Gasto \(25%\)/);
    expect(first).toHaveTextContent(/R\$\s600,00/);
    expect(
      within(first).getByRole('progressbar', { name: 'Uso do orçamento de Alimentação' }),
    ).toHaveAttribute('aria-valuenow', '25');

    // Estourado: percentual real (130%), barra limitada a 100%, restante negativo em vermelho.
    expect(second).toHaveTextContent('Estourado');
    expect(second).toHaveTextContent(/Gasto \(130%\)/);
    expect(
      within(second).getByRole('progressbar', { name: 'Uso do orçamento de Lazer' }),
    ).toHaveAttribute('aria-valuenow', '100');
    expect(second).toHaveTextContent(/-R\$\s120,00/);
    expect(second).toHaveTextContent(/R\$\s30,00 previstos\/pendentes/);

    const summary = screen.getByRole('region', { name: 'Resumo do mês' });
    expect(within(summary).getByLabelText('Orçado')).toHaveTextContent(/R\$\s1\.200,00/);
    expect(within(summary).getByLabelText('Gasto')).toHaveTextContent(/R\$\s720,00/);
    expect(within(summary).getByLabelText('Restante')).toHaveTextContent(/R\$\s480,00/);
    expect(screen.getByText(/Gasto em categorias sem orçamento/)).toHaveTextContent(/R\$\s130,00/);
  });

  it('atenção a partir de 80%', async () => {
    mockBudgets(
      {},
      list([
        budget({
          categoryId: transport.id,
          categoryName: 'Transporte',
          month,
          limitCents: 10_000,
          spentCents: 8_500,
          remainingCents: 1_500,
          percentUsed: 85,
          status: 'warning',
        }),
      ]),
    );
    renderRoute('/budgets');

    const items = await screen.findByRole('list', { name: 'Orçamentos' });

    expect(within(items).getByText('Atenção')).toBeInTheDocument();
    expect(within(items).getByText(/Você já usou 80% ou mais do limite/)).toBeInTheDocument();
  });

  it('navega entre meses consultando o backend com ?month=', async () => {
    const fetchMock = mockBudgets();
    renderRoute('/budgets');
    await screen.findByRole('list', { name: 'Orçamentos' });
    expect(lastQuery(fetchMock, '/api/v1/budgets').get('month')).toBe(month);

    await userEvent.click(screen.getByRole('button', { name: 'Mês anterior' }));

    await screen.findByRole('list', { name: 'Orçamentos' });
    expect(lastQuery(fetchMock, '/api/v1/budgets').get('month')).toBe(shiftMonth(month, -1));
  });

  it('mês sem orçamentos mostra o estado vazio', async () => {
    mockBudgets({}, list([]));
    renderRoute('/budgets');

    expect(await screen.findByText('Nenhum orçamento neste mês')).toBeInTheDocument();
  });

  it('cria orçamento só para categorias de despesa ainda sem orçamento', async () => {
    const fetchMock = mockBudgets(
      {
        'PUT /api/v1/budgets': () =>
          jsonResponse(budget({ categoryId: transport.id, categoryName: 'Transporte' })),
      },
      list([foodBudget]),
    );
    renderRoute('/budgets');

    await userEvent.click(await screen.findByRole('button', { name: 'Novo orçamento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo orçamento' });
    const select = within(dialog).getByLabelText('Categoria');
    const options = within(select)
      .getAllByRole('option')
      .map((option) => option.textContent);
    // Sem "Alimentação" (já orçada) e sem categorias de receita.
    expect(options).toEqual(['Escolha…', 'Lazer', 'Transporte']);

    await userEvent.selectOptions(select, transport.id);
    await userEvent.type(within(dialog).getByLabelText('Limite do mês'), '350,00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await screen.findByRole('list', { name: 'Orçamentos' });
    expect(callsTo(fetchMock, 'PUT', '/api/v1/budgets')[0]?.body).toEqual({
      categoryId: transport.id,
      month,
      limitCents: 35_000,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('valida categoria e limite antes de enviar', async () => {
    const fetchMock = mockBudgets();
    renderRoute('/budgets');
    await userEvent.click(await screen.findByRole('button', { name: 'Novo orçamento' }));
    const dialog = await screen.findByRole('dialog', { name: 'Novo orçamento' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    expect(await within(dialog).findByText('Escolha a categoria.')).toBeInTheDocument();
    expect(within(dialog).getByText('Informe o valor.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'PUT', '/api/v1/budgets')).toHaveLength(0);
  });

  it('edita o limite de um orçamento existente', async () => {
    const fetchMock = mockBudgets({
      'PUT /api/v1/budgets': () => jsonResponse({ ...foodBudget, limitCents: 90_000 }),
    });
    renderRoute('/budgets');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Editar orçamento de Alimentação' }),
    );
    const dialog = await screen.findByRole('dialog', { name: /Editar orçamento/ });
    const limit = within(dialog).getByLabelText('Limite do mês');
    expect(limit).toHaveValue('800,00');
    expect(within(dialog).queryByLabelText('Categoria')).not.toBeInTheDocument();
    await userEvent.clear(limit);
    await userEvent.type(limit, '900');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await screen.findByRole('list', { name: 'Orçamentos' });
    expect(callsTo(fetchMock, 'PUT', '/api/v1/budgets')[0]?.body).toEqual({
      categoryId: food.id,
      month,
      limitCents: 90_000,
    });
  });

  it('remove com confirmação; erro da API aparece no diálogo', async () => {
    let attempts = 0;
    const fetchMock = mockBudgets({
      [`DELETE /api/v1/budgets/${foodBudget.id}`]: () => {
        attempts += 1;
        return attempts === 1
          ? errorResponse(404, 'NOT_FOUND', 'Orçamento não encontrado.')
          : new Response(null, { status: 204 });
      },
    });
    renderRoute('/budgets');

    await userEvent.click(
      await screen.findByRole('button', { name: 'Remover orçamento de Alimentação' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Remover orçamento' });
    expect(dialog).toHaveTextContent(/Seus lançamentos não são afetados/);
    expect(callsTo(fetchMock, 'DELETE', `/api/v1/budgets/${foodBudget.id}`)).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    expect(await within(dialog).findByText('Orçamento não encontrado.')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Remover' }));
    await screen.findByRole('list', { name: 'Orçamentos' });
    expect(callsTo(fetchMock, 'DELETE', `/api/v1/budgets/${foodBudget.id}`)).toHaveLength(2);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
