import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';
import {
  account,
  callsTo,
  category,
  importDetail,
  importRow,
  importSummary,
  merchantRule,
  mockLedgerApi,
} from '../../test/ledger-mocks';
import { errorResponse, jsonResponse, renderRoute } from '../../test/render';
import { readStatementFile } from './read-file';

const inter = account({ name: 'Banco Inter' });
const mp = account({ name: 'Mercado Pago', type: 'wallet' });
const cdb = account({ name: 'CDB', type: 'investment' });
const food = category({ name: 'Alimentação' });

function mockImports(
  extra: Parameters<typeof mockLedgerApi>[1] = {},
  history: ReturnType<typeof importSummary>[] = [],
  rules: ReturnType<typeof merchantRule>[] = [],
) {
  return mockLedgerApi(
    { accounts: [inter, mp, cdb], categories: [food] },
    {
      'GET /api/v1/imports': () => jsonResponse({ items: history }),
      'GET /api/v1/merchant-rules': () => jsonResponse({ items: rules }),
      ...extra,
    },
  );
}

const csvFile = (
  content = 'Data;Descrição;Valor\n01/09/2026;PADARIA;-10,00',
  name = 'extrato.csv',
) => new File([content], name, { type: 'text/csv' });

describe('ImportsPage — nova importação', () => {
  it('lê o arquivo, envia conta, nome e conteúdo e abre a revisão', async () => {
    const created = importDetail({
      accountId: inter.id,
      rows: [importRow({ description: 'PADARIA DO ZE' })],
    });
    const fetchMock = mockImports({
      'POST /api/v1/imports': () => jsonResponse(created, 201),
      [`GET /api/v1/imports/${created.id}`]: () => jsonResponse(created),
      'GET /api/v1/invoices/payable': () => jsonResponse({ items: [] }),
    });
    renderRoute('/imports');

    await userEvent.upload(await screen.findByLabelText('Arquivo do extrato (CSV)'), csvFile());
    await userEvent.click(screen.getByRole('button', { name: 'Ler extrato' }));

    expect(await screen.findByText('PADARIA DO ZE')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/api/v1/imports')[0]?.body).toEqual({
      accountId: inter.id,
      filename: 'extrato.csv',
      content: 'Data;Descrição;Valor\n01/09/2026;PADARIA;-10,00',
    });
  });

  it('não oferece conta de investimento e valida arquivo antes de enviar', async () => {
    const fetchMock = mockImports();
    renderRoute('/imports');
    const select = await screen.findByLabelText('Conta do extrato');

    const options = (await within(select).findAllByRole('option')).map(
      (option) => option.textContent,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ler extrato' }));

    expect(options).toEqual(['Banco Inter', 'Mercado Pago']);
    expect(await screen.findByText('Escolha o arquivo do extrato.')).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/api/v1/imports')).toHaveLength(0);
  });

  it('colunas não reconhecidas: pede o mapeamento e reenvia o mesmo arquivo com as colunas escolhidas', async () => {
    const created = importDetail({
      accountId: inter.id,
      rows: [importRow({ description: 'Padaria' })],
    });
    let attempts = 0;
    const fetchMock = mockImports({
      'POST /api/v1/imports': () => {
        attempts += 1;
        return attempts === 1
          ? errorResponse(422, 'BUSINESS_RULE_VIOLATION', 'Não consegui identificar as colunas.', {
              headers: ['Quando', 'Onde', 'Quanto'],
            })
          : jsonResponse(created, 201);
      },
      [`GET /api/v1/imports/${created.id}`]: () => jsonResponse(created),
      'GET /api/v1/invoices/payable': () => jsonResponse({ items: [] }),
    });
    renderRoute('/imports');
    const content = 'Quando;Onde;Quanto\n01/09/2026;Padaria;-10,00';
    await userEvent.upload(
      await screen.findByLabelText('Arquivo do extrato (CSV)'),
      csvFile(content),
    );
    await userEvent.click(screen.getByRole('button', { name: 'Ler extrato' }));

    expect(await screen.findByText('Indique as colunas do arquivo')).toBeInTheDocument();
    expect(screen.getByText('Não consegui identificar as colunas.')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Coluna da data'), 'Quando');
    await userEvent.selectOptions(screen.getByLabelText('Coluna da descrição'), 'Onde');
    await userEvent.selectOptions(screen.getByLabelText('Coluna do valor'), 'Quanto');
    await userEvent.click(screen.getByRole('button', { name: 'Tentar com estas colunas' }));

    expect(await screen.findByText('Padaria')).toBeInTheDocument();
    const [, second] = callsTo(fetchMock, 'POST', '/api/v1/imports');
    expect(second?.body).toMatchObject({
      content,
      mapping: { date: 'Quando', description: ['Onde'], amount: 'Quanto' },
    });
  });

  it('erro sem cabeçalhos (ex.: arquivo vazio) só mostra a mensagem', async () => {
    mockImports({
      'POST /api/v1/imports': () =>
        errorResponse(422, 'BUSINESS_RULE_VIOLATION', 'O arquivo está vazio.'),
    });
    renderRoute('/imports');
    await userEvent.upload(await screen.findByLabelText('Arquivo do extrato (CSV)'), csvFile('x'));

    await userEvent.click(screen.getByRole('button', { name: 'Ler extrato' }));

    expect(await screen.findByText('O arquivo está vazio.')).toBeInTheDocument();
    expect(screen.queryByText('Indique as colunas do arquivo')).not.toBeInTheDocument();
  });
});

describe('ImportsPage — histórico', () => {
  it('lista importações com situação e contagens; revisar só para as em revisão', async () => {
    const review = importSummary({ filename: 'a.csv', status: 'review', accountId: inter.id });
    const done = importSummary({
      filename: 'b.csv',
      status: 'confirmed',
      accountId: mp.id,
      importedCount: 8,
      skippedCount: 2,
      rowsCount: 10,
    });
    mockImports({}, [review, done]);
    renderRoute('/imports');

    const list = await screen.findByRole('list', { name: 'Importações' });
    const [first, second] = within(list).getAllByRole('listitem') as [HTMLElement, HTMLElement];

    expect(within(first).getByText('Em revisão')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'Revisar' })).toHaveAttribute(
      'href',
      `/imports/${review.id}`,
    );
    expect(second).toHaveTextContent('Confirmada');
    expect(second).toHaveTextContent(/Mercado Pago.*10 linhas.*8 importadas, 2 puladas/);
    expect(within(second).queryByRole('link', { name: 'Revisar' })).not.toBeInTheDocument();
  });

  it('desfazer pede confirmação e explica que nada é apagado', async () => {
    const done = importSummary({ filename: 'b.csv', status: 'confirmed', importedCount: 8 });
    const fetchMock = mockImports(
      {
        [`POST /api/v1/imports/${done.id}/revert`]: () =>
          jsonResponse({ ...importDetail(), ...done, status: 'reverted' }),
      },
      [done],
    );
    renderRoute('/imports');

    await userEvent.click(await screen.findByRole('button', { name: 'Desfazer importação b.csv' }));
    const dialog = await screen.findByRole('dialog', { name: 'Desfazer importação' });
    expect(dialog).toHaveTextContent(/8 lançamentos.*cancelados \(nada é apagado\)/);
    expect(callsTo(fetchMock, 'POST', `/api/v1/imports/${done.id}/revert`)).toHaveLength(0);

    await userEvent.click(within(dialog).getByRole('button', { name: 'Desfazer' }));

    await screen.findByRole('list', { name: 'Importações' });
    expect(callsTo(fetchMock, 'POST', `/api/v1/imports/${done.id}/revert`)).toHaveLength(1);
  });

  it('sem importações: estado vazio', async () => {
    mockImports();
    renderRoute('/imports');

    expect(await screen.findByText('Nenhuma importação ainda')).toBeInTheDocument();
  });
});

describe('ImportsPage — regras', () => {
  it('cria regra de despesa com categoria e regra de transferência com conta', async () => {
    const fetchMock = mockImports({
      'POST /api/v1/merchant-rules': () => jsonResponse(merchantRule(), 201),
    });
    renderRoute('/imports');
    const section = await screen.findByRole('region', { name: 'Regras de importação' });

    await userEvent.type(
      within(section).getByLabelText('Se a descrição contiver'),
      'Padaria do Zé',
    );
    await userEvent.selectOptions(within(section).getByLabelText('Categoria'), food.id);
    await userEvent.click(within(section).getByRole('button', { name: 'Adicionar regra' }));
    await screen.findByText('Nenhuma regra própria');

    await userEvent.type(within(section).getByLabelText('Se a descrição contiver'), 'Mercado Pago');
    await userEvent.selectOptions(within(section).getByLabelText('Tipo'), 'transfer');
    await userEvent.selectOptions(within(section).getByLabelText('Conta de destino'), mp.id);
    await userEvent.click(within(section).getByRole('button', { name: 'Adicionar regra' }));

    await screen.findByText('Nenhuma regra própria');
    const bodies = callsTo(fetchMock, 'POST', '/api/v1/merchant-rules').map((call) => call.body);
    expect(bodies).toEqual([
      { pattern: 'Padaria do Zé', suggestedType: 'expense', categoryId: food.id },
      { pattern: 'Mercado Pago', suggestedType: 'transfer', targetAccountId: mp.id },
    ]);
  });

  it('valida texto e conta antes de enviar; lista e remove', async () => {
    const rule = merchantRule({ pattern: 'PADARIA DO ZE', categoryId: food.id });
    const fetchMock = mockImports(
      { [`DELETE /api/v1/merchant-rules/${rule.id}`]: () => new Response(null, { status: 204 }) },
      [],
      [rule],
    );
    renderRoute('/imports');
    const section = await screen.findByRole('region', { name: 'Regras de importação' });

    await userEvent.click(within(section).getByRole('button', { name: 'Adicionar regra' }));
    expect(await within(section).findByText(/ao menos 2 caracteres/)).toBeInTheDocument();
    await userEvent.type(within(section).getByLabelText('Se a descrição contiver'), 'XY');
    await userEvent.selectOptions(within(section).getByLabelText('Tipo'), 'transfer');
    await userEvent.click(within(section).getByRole('button', { name: 'Adicionar regra' }));
    expect(
      await within(section).findByText('Escolha a conta da transferência.'),
    ).toBeInTheDocument();
    expect(callsTo(fetchMock, 'POST', '/api/v1/merchant-rules')).toHaveLength(0);

    const list = within(section).getByRole('list', { name: 'Regras de importação' });
    expect(list).toHaveTextContent(/PADARIA DO ZE.*Despesa · Alimentação/);
    await userEvent.click(
      within(list).getByRole('button', { name: 'Remover regra PADARIA DO ZE' }),
    );

    await screen.findByRole('region', { name: 'Regras de importação' });
    expect(callsTo(fetchMock, 'DELETE', `/api/v1/merchant-rules/${rule.id}`)).toHaveLength(1);
  });
});

describe('readStatementFile', () => {
  it('lê UTF-8 normalmente', async () => {
    expect(await readStatementFile(new Blob(['Descrição;Valor']))).toBe('Descrição;Valor');
  });

  it('cai para Windows-1252 quando o arquivo não é UTF-8 (acentos de bancos antigos)', async () => {
    // "Descrição" em Windows-1252: ç = 0xE7, ã = 0xE3 (inválidos como UTF-8).
    const bytes = new Uint8Array([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f]);

    expect(await readStatementFile(new Blob([bytes]))).toBe('Descrição');
  });
});
