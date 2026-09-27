import { todayInTimeZone } from '@fintrack/shared';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  account,
  callsTo,
  category,
  mockLedgerApi,
  occurrence,
  recurring,
  transaction,
} from '../../test/ledger-mocks';
import { errorResponse, jsonResponse, renderRoute } from '../../test/render';

const inter = account({ name: 'Banco Inter' });
const rent = recurring({ name: 'Aluguel', accountId: inter.id, amountCents: 150_000 });
const energy = recurring({
  name: 'Enel',
  accountId: inter.id,
  amountCents: 18_000,
  isVariableAmount: true,
  nextDate: '2026-10-10',
});
const today = todayInTimeZone('America/Sao_Paulo');
const future = (days: number) => {
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
};

function occurrences() {
  return [
    occurrence({
      recurringId: rent.id,
      name: 'Aluguel',
      date: future(-3),
      amountCents: 150_000,
      overdue: true,
      accountId: inter.id,
    }),
    occurrence({
      recurringId: energy.id,
      name: 'Enel',
      date: future(5),
      amountCents: 18_000,
      estimated: true,
      accountId: inter.id,
    }),
  ];
}

function mockRecurring(extra: Parameters<typeof mockLedgerApi>[1] = {}) {
  return mockLedgerApi(
    { accounts: [inter], categories: [category({ name: 'Moradia' })] },
    {
      'GET /api/v1/recurring': () => jsonResponse({ items: [rent, energy] }),
      'GET /api/v1/recurring/occurrences': () =>
        jsonResponse({ from: future(-62), until: future(60), items: occurrences() }),
      ...extra,
    },
  );
}

describe('RecurringPage', () => {
  it('lista previsões (atrasadas e estimadas) e as regras cadastradas', async () => {
    mockRecurring();
    renderRoute('/recurring');

    const list = await screen.findByRole('list', { name: 'Ocorrências previstas' });
    const [first, second] = within(list).getAllByRole('listitem') as [HTMLElement, HTMLElement];
    expect(within(first).getByText('Atrasada')).toBeInTheDocument();
    expect(first).toHaveTextContent(/−R\$\s1\.500,00/);
    expect(within(second).getByText('Estimado')).toBeInTheDocument();

    const rules = await screen.findByRole('list', { name: 'Recorrências' });
    expect(within(rules).getAllByText(/Todo mês, dia 5/)).toHaveLength(2);
    expect(within(rules).getByText(/próxima 05\/10\/2026/)).toBeInTheDocument();
    expect(within(rules).getByText(/próxima 10\/10\/2026/)).toBeInTheDocument();
    // Valor variável aparece como aproximado.
    expect(within(rules).getByText(/~R\$\s180,00/)).toBeInTheDocument();
  });

  it('confirma a ocorrência com o valor real e a data em que foi paga', async () => {
    const fetchMock = mockRecurring({
      [`POST /api/v1/recurring/${energy.id}/occurrences/${future(5)}/confirm`]: () =>
        jsonResponse(transaction({ recurringId: energy.id, amountCents: 19_550 }), 201),
    });
    renderRoute('/recurring');

    await userEvent.click(
      await screen.findByRole('button', {
        name: `Confirmar Enel de ${future(5).split('-').reverse().join('/')}`,
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar ocorrência' });
    const amount = within(dialog).getByLabelText('Valor pago');
    expect(amount).toHaveValue('180,00');
    // Ocorrência futura: a data vem limitada a hoje (nada é efetivado no futuro).
    const date = within(dialog).getByLabelText('Data em que foi paga');
    expect(date).toHaveValue(today);
    expect(date).toHaveAttribute('max', today);

    await userEvent.clear(amount);
    await userEvent.type(amount, '195,50');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    await screen.findByRole('list', { name: 'Ocorrências previstas' });
    expect(
      callsTo(
        fetchMock,
        'POST',
        `/api/v1/recurring/${energy.id}/occurrences/${future(5)}/confirm`,
      )[0]?.body,
    ).toEqual({ amountCents: 19_550, transactionDate: today });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('ocorrência atrasada mantém a data prevista como padrão', async () => {
    mockRecurring();
    renderRoute('/recurring');

    await userEvent.click(
      await screen.findByRole('button', {
        name: `Confirmar Aluguel de ${future(-3).split('-').reverse().join('/')}`,
      }),
    );

    const dialog = await screen.findByRole('dialog', { name: 'Confirmar ocorrência' });
    expect(within(dialog).getByLabelText('Data em que foi paga')).toHaveValue(future(-3));
  });

  it('não envia valor inválido nem data futura', async () => {
    const fetchMock = mockRecurring();
    renderRoute('/recurring');
    await userEvent.click(
      await screen.findByRole('button', {
        name: `Confirmar Aluguel de ${future(-3).split('-').reverse().join('/')}`,
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar ocorrência' });

    await userEvent.clear(within(dialog).getByLabelText('Valor pago'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    expect(await within(dialog).findByText('Informe o valor.')).toBeInTheDocument();
    expect(
      callsTo(fetchMock, 'POST', `/api/v1/recurring/${rent.id}/occurrences/${future(-3)}/confirm`),
    ).toHaveLength(0);
  });

  it('pular pede confirmação e não cria lançamento no cliente', async () => {
    const fetchMock = mockRecurring({
      [`POST /api/v1/recurring/${rent.id}/occurrences/${future(-3)}/skip`]: () =>
        jsonResponse(transaction({ status: 'cancelled', recurringId: rent.id }), 201),
    });
    renderRoute('/recurring');

    await userEvent.click(
      await screen.findByRole('button', {
        name: `Pular Aluguel de ${future(-3).split('-').reverse().join('/')}`,
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Pular ocorrência' });
    expect(dialog).toHaveTextContent(/não conta em saldo, relatórios nem orçamento/);
    expect(
      callsTo(fetchMock, 'POST', `/api/v1/recurring/${rent.id}/occurrences/${future(-3)}/skip`),
    ).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Pular' }));

    await screen.findByRole('list', { name: 'Ocorrências previstas' });
    expect(
      callsTo(fetchMock, 'POST', `/api/v1/recurring/${rent.id}/occurrences/${future(-3)}/skip`),
    ).toHaveLength(1);
  });

  it('mostra o erro da API ao confirmar uma ocorrência já tratada', async () => {
    mockRecurring({
      [`POST /api/v1/recurring/${rent.id}/occurrences/${future(-3)}/confirm`]: () =>
        errorResponse(409, 'CONFLICT', 'Esta ocorrência já foi confirmada ou pulada.'),
    });
    renderRoute('/recurring');
    await userEvent.click(
      await screen.findByRole('button', {
        name: `Confirmar Aluguel de ${future(-3).split('-').reverse().join('/')}`,
      }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Confirmar ocorrência' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    expect(
      await within(dialog).findByText('Esta ocorrência já foi confirmada ou pulada.'),
    ).toBeInTheDocument();
  });

  it('cadastra uma recorrência mensal', async () => {
    const created = recurring({ name: 'Netflix', accountId: inter.id, amountCents: 5_590 });
    const fetchMock = mockRecurring({
      'POST /api/v1/recurring': () => jsonResponse(created, 201),
    });
    renderRoute('/recurring');

    await userEvent.click(await screen.findByRole('button', { name: 'Nova recorrência' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova recorrência' });
    await userEvent.type(within(dialog).getByLabelText('Nome'), 'Netflix');
    await userEvent.type(within(dialog).getByLabelText('Valor'), '55,90');
    await userEvent.selectOptions(within(dialog).getByLabelText('Conta'), inter.id);
    await userEvent.clear(within(dialog).getByLabelText('Dia do vencimento'));
    await userEvent.type(within(dialog).getByLabelText('Dia do vencimento'), '12');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await screen.findByRole('list', { name: 'Recorrências' });
    expect(callsTo(fetchMock, 'POST', '/api/v1/recurring')[0]?.body).toMatchObject({
      name: 'Netflix',
      type: 'expense',
      amountCents: 5_590,
      isVariableAmount: false,
      accountId: inter.id,
      frequency: 'monthly',
      dayOfMonth: 12,
      autoConfirm: false,
      includeInForecast: true,
    });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('valida nome e valor antes de enviar; valor variável dispensa o valor e desliga a confirmação automática', async () => {
    const fetchMock = mockRecurring();
    renderRoute('/recurring');
    await userEvent.click(await screen.findByRole('button', { name: 'Nova recorrência' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nova recorrência' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));
    expect(await within(dialog).findByText('Informe o nome.')).toBeInTheDocument();
    expect(within(dialog).getByText('Informe o valor.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/api/v1/recurring')).toHaveLength(0);

    const auto = within(dialog).getByLabelText('Confirmar automaticamente quando chegar o dia');
    await userEvent.click(auto);
    expect(auto).toBeChecked();
    await userEvent.click(within(dialog).getByLabelText('Valor variável'));
    expect(auto).not.toBeChecked();
    expect(auto).toBeDisabled();
    expect(within(dialog).getByLabelText('Valor estimado (opcional)')).toBeInTheDocument();
  });

  it('desativa e reativa uma regra', async () => {
    const fetchMock = mockRecurring({
      [`POST /api/v1/recurring/${rent.id}/deactivate`]: () =>
        jsonResponse({ ...rent, active: false, nextDate: null }),
    });
    renderRoute('/recurring');

    await userEvent.click(await screen.findByRole('button', { name: 'Desativar Aluguel' }));

    await screen.findByRole('list', { name: 'Recorrências' });
    expect(callsTo(fetchMock, 'POST', `/api/v1/recurring/${rent.id}/deactivate`)).toHaveLength(1);
  });

  it('edita a regra sem permitir trocar tipo, frequência nem início', async () => {
    const fetchMock = mockRecurring({
      [`PATCH /api/v1/recurring/${rent.id}`]: () => jsonResponse({ ...rent, amountCents: 160_000 }),
    });
    renderRoute('/recurring');

    await userEvent.click(await screen.findByRole('button', { name: 'Editar Aluguel' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar recorrência' });
    expect(within(dialog).queryByLabelText('Tipo')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Frequência')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Começa em')).not.toBeInTheDocument();

    await userEvent.clear(within(dialog).getByLabelText('Valor'));
    await userEvent.type(within(dialog).getByLabelText('Valor'), '1.600,00');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await screen.findByRole('list', { name: 'Recorrências' });
    expect(callsTo(fetchMock, 'PATCH', `/api/v1/recurring/${rent.id}`)[0]?.body).toMatchObject({
      amountCents: 160_000,
      accountId: inter.id,
    });
  });

  it('sem regras: mostra o estado vazio', async () => {
    mockLedgerApi(
      { accounts: [inter] },
      {
        'GET /api/v1/recurring': () => jsonResponse({ items: [] }),
        'GET /api/v1/recurring/occurrences': () =>
          jsonResponse({ from: future(-62), until: future(60), items: [] }),
      },
    );
    renderRoute('/recurring');

    expect(await screen.findByText('Nenhuma recorrência cadastrada')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma previsão')).toBeInTheDocument();
  });
});
