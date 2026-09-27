import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { detectDelimiter, parseCsv } from './csv.js';
import { detectDuplicates, type DedupeRow, type ExistingEntry } from './duplicates.js';
import { fingerprints, normalizeDescription, similarity } from './normalize.js';
import { parseStatement, StatementParseError } from './statement.js';
import { suggest, type RuleLike, type SuggestionContext } from './suggestions.js';
import { parseAmountToCents, parseStatementDate } from './values.js';

describe('parseCsv', () => {
  it('lê aspas, delimitador dentro de aspas, "" literal e quebra de linha dentro do campo', () => {
    const records = parseCsv('a;b;c\n"x;y";"diz ""oi""";"linha1\nlinha2"\n', ';');

    expect(records).toEqual([
      { line: 1, cells: ['a', 'b', 'c'] },
      { line: 2, cells: ['x;y', 'diz "oi"', 'linha1\nlinha2'] },
    ]);
  });

  it('BOM, CRLF, linhas vazias e número da linha física', () => {
    const records = parseCsv('﻿data;valor\r\n\r\n01/09/2026;10,00\r\n02/09/2026;20,00', ';');

    expect(records.map((r) => [r.line, r.cells])).toEqual([
      [1, ['data', 'valor']],
      [3, ['01/09/2026', '10,00']],
      [4, ['02/09/2026', '20,00']],
    ]);
  });

  it('detecta o delimitador pelo padrão consistente (ignora linhas de título)', () => {
    expect(detectDelimiter('Extrato\nConta;1\nData;Descrição;Valor\n1;2;3\n4;5;6')).toBe(';');
    expect(detectDelimiter('Data,Descrição,Valor\n1,2,3\n4,5,6')).toBe(',');
    expect(detectDelimiter('Data\tDescrição\tValor\n1\t2\t3')).toBe('\t');
    expect(detectDelimiter('a;b;c\n"1,5";"2,5";"3,5"')).toBe(';');
    expect(detectDelimiter('só uma coluna')).toBe(';');
  });
});

describe('parseAmountToCents', () => {
  it.each([
    ['1.234,56', 123_456],
    ['-1.234,56', -123_456],
    ['R$ 90,99', 9_099],
    ['-R$ 90,99', -9_099],
    ['1234.56', 123_456],
    ['1,234.56', 123_456],
    ['90,9', 9_090],
    ['(45,90)', -4_590],
    ['45,90-', -4_590],
    ['−45,90', -4_590],
    ['+10,00', 1_000],
    ['1.234', 123_400],
    ['1.234.567', 123_456_700],
    ['1,234,567', 123_456_700],
    ['0,05', 5],
    ['100', 10_000],
    ['10.5', 1_050],
  ])('%s → %i centavos', (input, expected) => {
    expect(parseAmountToCents(input)).toBe(expected);
  });

  it.each(['', 'abc', '1,2,3', '1.2.3', '12,345', '1.234,567', '--5', '10,00,00', '1e5'])(
    'inválido: "%s"',
    (input) => {
      expect(parseAmountToCents(input)).toBeNull();
    },
  );

  it('sem ponto flutuante: 0,10 + 0,20 é exatamente 30 centavos', () => {
    expect((parseAmountToCents('0,10') ?? 0) + (parseAmountToCents('0,20') ?? 0)).toBe(30);
  });
});

describe('parseStatementDate', () => {
  it.each([
    ['27/09/2026', '2026-09-27'],
    ['27-09-2026', '2026-09-27'],
    ['27.09.2026', '2026-09-27'],
    ['27/09/26', '2026-09-27'],
    ['2026-09-27', '2026-09-27'],
    ['2026/09/27', '2026-09-27'],
    ['1/2/2026', '2026-02-01'],
    ['27/09/2026 10:32', '2026-09-27'],
    ['2026-09-27T10:32:00Z', '2026-09-27'],
    ['29/02/2028', '2028-02-29'],
  ])('%s → %s', (input, expected) => {
    expect(parseStatementDate(input)).toBe(expected);
  });

  it.each(['', 'abc', '31/02/2026', '29/02/2026', '32/01/2026', '2026-13-01', '27/13/2026'])(
    'inválida: "%s"',
    (input) => {
      expect(parseStatementDate(input)).toBeNull();
    },
  );
});

describe('normalizeDescription, similaridade e fingerprint', () => {
  it('maiúsculas, sem acentos, só letras e números', () => {
    expect(normalizeDescription('  Pix Enviado – José D’Ávila  ')).toBe('PIX ENVIADO JOSE D AVILA');
    expect(normalizeDescription('Água/Esgoto (SABESP)')).toBe('AGUA ESGOTO SABESP');
    expect(normalizeDescription('')).toBe('');
  });

  it('similaridade de Jaccard', () => {
    expect(similarity('PIX ENVIADO JOSE', 'PIX ENVIADO JOSE')).toBe(1);
    expect(similarity('A B', 'C D')).toBe(0);
    expect(similarity('A B C', 'A B D')).toBeCloseTo(0.5);
  });

  it('linhas idênticas no mesmo arquivo ganham ordinais diferentes; o mesmo arquivo repete as impressões', () => {
    const rows = [
      { date: '2026-09-01', signedCents: -500, normalized: 'CAFE' },
      { date: '2026-09-01', signedCents: -500, normalized: 'CAFE' },
      { date: '2026-09-02', signedCents: -500, normalized: 'CAFE' },
    ];

    const first = fingerprints('conta-1', rows);
    const second = fingerprints('conta-1', rows);

    expect(new Set(first).size).toBe(3);
    expect(second).toEqual(first);
    expect(fingerprints('conta-2', rows)[0]).not.toBe(first[0]);
    expect(first[0]).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('parseStatement', () => {
  const inter = [
    'Extrato Conta Corrente',
    'Conta;123456',
    'Período;01/09/2026 a 30/09/2026',
    '',
    'Data Lançamento;Histórico;Descrição;Valor;Saldo',
    '02/09/2026;Pix enviado;PIX ENVIADO MERCADO PAGO;-300,00;1.200,00',
    '05/09/2026;Pagamento efetuado;TELEFONICA BRAS;-90,99;1.109,01',
    '10/09/2026;Pix recebido;SALARIO EMPRESA X;5.000,00;6.109,01',
    'Saldo final;;;;6.109,01',
  ].join('\n');

  it('extrato do Inter: acha o cabeçalho depois do título, junta histórico + descrição', () => {
    const result = parseStatement(inter);

    expect(result.detected.delimiter).toBe(';');
    expect(result.detected.mapping).toEqual({
      date: 'Data Lançamento',
      description: ['Histórico', 'Descrição'],
      amount: 'Valor',
    });
    expect(result.rows.map((r) => [r.rowNumber, r.date, r.signedCents, r.description])).toEqual([
      [6, '2026-09-02', -30_000, 'Pix enviado - PIX ENVIADO MERCADO PAGO'],
      [7, '2026-09-05', -9_099, 'Pagamento efetuado - TELEFONICA BRAS'],
      [8, '2026-09-10', 500_000, 'Pix recebido - SALARIO EMPRESA X'],
    ]);
    // A linha "Saldo final" não vira item, mas é REPORTADA com o motivo.
    expect(result.ignored).toEqual([{ line: 9, reason: 'Data não reconhecida: "Saldo final".' }]);
    expect(result.rows[0]?.raw).toMatchObject({ Valor: '-300,00', Saldo: '1.200,00' });
  });

  it('Mercado Pago: descrição = tipo, id externo = REFERENCE_ID, data ISO com hora', () => {
    const csv =
      'RELEASE_DATE;TRANSACTION_TYPE;REFERENCE_ID;TRANSACTION_NET_AMOUNT;PARTIAL_BALANCE\n' +
      '2026-09-02T10:00:00Z;Transferência recebida;98765;300,00;300,00\n' +
      '2026-09-03T12:00:00Z;Pagamento com Mercado Pago;98766;-24,90;275,10';

    const result = parseStatement(csv);

    expect(result.rows).toMatchObject([
      { date: '2026-09-02', signedCents: 30_000, externalId: '98765' },
      { date: '2026-09-03', signedCents: -2_490, description: 'Pagamento com Mercado Pago' },
    ]);
  });

  it('colunas separadas de débito e crédito, com vírgula como delimitador e aspas', () => {
    const csv = [
      'Data,Histórico,Débito,Crédito',
      '"27/09/2026","COMPRA, LOJA X","1.234,56",""',
      '"28/09/2026","DEPOSITO","","500,00"',
    ].join('\n');

    const result = parseStatement(csv);

    expect(result.detected.delimiter).toBe(',');
    expect(result.rows.map((r) => [r.description, r.signedCents])).toEqual([
      ['COMPRA, LOJA X', -123_456],
      ['DEPOSITO', 50_000],
    ]);
  });

  it('valor zero, data inválida e valor inválido são ignorados COM motivo', () => {
    const csv = [
      'Data;Descrição;Valor',
      '01/09/2026;OK;10,00',
      '02/09/2026;ZERO;0,00',
      'xx;RUIM;5,00',
      '03/09/2026;ABC;abc',
    ].join('\n');

    const result = parseStatement(csv);

    expect(result.rows).toHaveLength(1);
    expect(result.ignored.map((i) => i.reason)).toEqual([
      'Valor zero.',
      'Data não reconhecida: "xx".',
      'Valor não reconhecido: "abc".',
    ]);
  });

  it('mapeamento manual quando os nomes das colunas são incomuns', () => {
    const csv = 'Quando;Onde;Quanto\n01/09/2026;Padaria;-12,50';

    expect(() => parseStatement(csv)).toThrow(StatementParseError);
    const result = parseStatement(csv, {
      mapping: { date: 'Quando', description: ['Onde'], amount: 'Quanto' },
    });

    expect(result.rows[0]).toMatchObject({
      date: '2026-09-01',
      signedCents: -1_250,
      description: 'Padaria',
    });
  });

  it('erros úteis: arquivo vazio, sem colunas reconhecíveis, mapeamento inexistente, nada importável', () => {
    expect(() => parseStatement('')).toThrow('O arquivo está vazio.');
    expect(() => parseStatement('foo;bar\n1;2')).toThrow(/Não consegui identificar as colunas/);
    expect(() =>
      parseStatement('Data;Descrição;Valor\n01/09/2026;X;1,00', {
        mapping: { date: 'Nope', description: ['Descrição'], amount: 'Valor' },
      }),
    ).toThrow(/colunas informadas/);
    expect(() => parseStatement('Data;Descrição;Valor\nabc;X;1,00')).toThrow(
      /nenhuma movimentação/,
    );
  });

  it('erro de cabeçalho devolve amostra dos cabeçalhos para o usuário mapear', () => {
    try {
      parseStatement('Quando;Onde;Quanto\n1;2;3');
    } catch (error) {
      expect(error).toBeInstanceOf(StatementParseError);
      expect((error as StatementParseError).headers).toEqual(['Quando', 'Onde', 'Quanto']);
    }
  });

  it('limite de linhas por arquivo', () => {
    const lines = ['Data;Descrição;Valor'];
    for (let i = 0; i < 5_001; i++) lines.push('01/09/2026;ITEM ' + i + ';1,00');

    expect(() => parseStatement(lines.join('\n'))).toThrow(/mais de 5000/);
  });

  it('descrição vazia vira "(sem descrição)" e é truncada em 300', () => {
    const csv = `Data;Descrição;Valor\n01/09/2026;;1,00\n02/09/2026;${'x'.repeat(400)};2,00`;

    const result = parseStatement(csv);

    expect(result.rows[0]?.description).toBe('(sem descrição)');
    expect(result.rows[1]?.description).toHaveLength(300);
  });
});

describe('detectDuplicates', () => {
  const row = (
    fingerprint: string,
    date: string,
    signedCents: number,
    normalized = 'X',
  ): DedupeRow => ({
    fingerprint,
    date,
    signedCents,
    normalized,
  });
  const entry = (
    id: string,
    date: string,
    signedCents: number,
    normalized = 'X',
  ): ExistingEntry => ({
    id,
    date,
    signedCents,
    normalized,
  });

  it('exata: a impressão já foi importada antes', () => {
    const result = detectDuplicates([row('f1', '2026-09-01', -100)], new Map([['f1', 't-1']]), []);

    expect(result).toEqual([{ kind: 'exact', transactionId: 't-1' }]);
  });

  it('possível: mesmo valor e sentido dentro de ± 3 dias; 4 dias ou outro valor/sentido não', () => {
    const existing = [entry('a', '2026-09-04', -100)];
    const at = (date: string, cents: number) =>
      detectDuplicates([row('f', date, cents)], new Map(), existing)[0];

    expect(at('2026-09-01', -100)).toEqual({ kind: 'possible', transactionId: 'a' });
    expect(at('2026-09-07', -100)).toEqual({ kind: 'possible', transactionId: 'a' });
    expect(at('2026-08-31', -100)).toBeNull(); // 4 dias
    expect(at('2026-09-08', -100)).toBeNull(); // 4 dias
    expect(at('2026-09-04', -101)).toBeNull(); // outro valor
    expect(at('2026-09-04', 100)).toBeNull(); // sentido oposto
  });

  it('cada lançamento existente é reivindicado por uma única linha (dois cafés, um lançamento)', () => {
    const rows = [row('f1', '2026-09-01', -500, 'CAFE'), row('f2', '2026-09-01', -500, 'CAFE')];

    const result = detectDuplicates(rows, new Map(), [entry('a', '2026-09-01', -500, 'CAFE')]);

    expect(result.filter(Boolean)).toHaveLength(1);
    expect(result[0]).toEqual({ kind: 'possible', transactionId: 'a' });
    expect(result[1]).toBeNull();
  });

  it('prefere o par mais próximo em data e depois o de descrição mais parecida', () => {
    const rows = [row('f1', '2026-09-05', -500, 'PADARIA PAO')];
    const existing = [
      entry('longe', '2026-09-03', -500, 'PADARIA PAO'),
      entry('perto-outro', '2026-09-05', -500, 'MERCADO'),
      entry('perto-igual', '2026-09-05', -500, 'PADARIA PAO'),
    ];

    expect(detectDuplicates(rows, new Map(), existing)[0]?.transactionId).toBe('perto-igual');
  });

  it('exata reivindica o lançamento criado e não o deixa para outra linha como possível', () => {
    const rows = [row('f1', '2026-09-01', -500), row('f2', '2026-09-02', -500)];

    const result = detectDuplicates(rows, new Map([['f1', 't-1']]), [
      entry('t-1', '2026-09-01', -500),
    ]);

    expect(result).toEqual([{ kind: 'exact', transactionId: 't-1' }, null]);
  });

  it('janela configurável', () => {
    const rows = [row('f', '2026-09-10', -100)];
    const existing = [entry('a', '2026-09-01', -100)];

    expect(detectDuplicates(rows, new Map(), existing, 3)[0]).toBeNull();
    expect(detectDuplicates(rows, new Map(), existing, 9)[0]).not.toBeNull();
  });
});

describe('suggest', () => {
  const food = { id: 'cat-food', name: 'Alimentação', kind: 'expense' as const };
  const internet = { id: 'cat-net', name: 'Internet', kind: 'expense' as const };
  const cellphone = { id: 'cat-cel', name: 'Celular', kind: 'expense' as const };
  const water = { id: 'cat-water', name: 'Água', kind: 'expense' as const };
  const energy = { id: 'cat-energy', name: 'Energia', kind: 'expense' as const };
  const salary = { id: 'cat-salary', name: 'Salário', kind: 'income' as const };
  const context: SuggestionContext = {
    accountId: 'inter',
    userRules: [],
    categories: [food, internet, cellphone, water, energy, salary],
    accounts: [
      { id: 'inter', name: 'Banco Inter' },
      { id: 'mp', name: 'Mercado Pago' },
    ],
    payableInvoices: [],
  };
  const out = (normalized: string, amountCents = 1_000) => ({
    direction: 'out' as const,
    amountCents,
    normalized,
  });
  const inn = (normalized: string, amountCents = 1_000) => ({
    direction: 'in' as const,
    amountCents,
    normalized,
  });

  it.each([
    ['PAGAMENTO TELEFONICA BRAS SA', 'cat-net'],
    ['TIM S A', 'cat-cel'],
    ['SABESP AGUA', 'cat-water'],
    ['ENEL DISTRIBUICAO', 'cat-energy'],
  ])('regra padrão: %s → categoria %s', (description, categoryId) => {
    expect(suggest(out(description), context)).toMatchObject({
      type: 'expense',
      categoryId,
      source: 'default_rule',
    });
  });

  it('regra padrão casa PALAVRA inteira (ENEL não casa com GENELETRIC)', () => {
    expect(suggest(out('GENELETRIC LTDA'), context)).toMatchObject({
      categoryId: null,
      source: 'none',
    });
  });

  it('regra padrão só sugere se a categoria existe (renomeada/arquivada → sem sugestão)', () => {
    const noWater = { ...context, categories: [food] };

    expect(suggest(out('SABESP'), noWater)).toMatchObject({ categoryId: null, source: 'none' });
  });

  it('receita e despesa: sentido do dinheiro decide o tipo padrão e a regra de salário só vale na entrada', () => {
    expect(suggest(inn('PIX RECEBIDO SALARIO EMPRESA'), context)).toMatchObject({
      type: 'income',
      categoryId: 'cat-salary',
    });
    expect(suggest(out('SALARIO'), context)).toMatchObject({ type: 'expense', categoryId: null });
    expect(suggest(inn('DEPOSITO'), context)).toMatchObject({ type: 'income', source: 'none' });
  });

  it('MERCADO PAGO a partir do Inter é TRANSFERÊNCIA para a conta Mercado Pago, nunca despesa', () => {
    expect(suggest(out('PIX ENVIADO MERCADO PAGO', 30_000), context)).toEqual({
      type: 'transfer',
      categoryId: null,
      targetAccountId: 'mp',
      invoiceId: null,
      source: 'own_account',
    });
    expect(suggest(inn('PIX RECEBIDO INTER'), { ...context, accountId: 'mp' })).toMatchObject({
      type: 'transfer',
      targetAccountId: 'inter',
    });
  });

  it('não sugere transferência para a própria conta do extrato', () => {
    const result = suggest(out('TARIFA BANCO INTER'), context);

    expect(result.type).toBe('expense');
  });

  it('regra do usuário vence a padrão; prioridade e padrão mais específico desempatam', () => {
    const rules: RuleLike[] = [
      {
        id: 'r1',
        pattern: 'ENEL',
        matchType: 'contains',
        suggestedType: 'expense',
        categoryId: 'cat-food',
        targetAccountId: null,
        priority: 0,
      },
      {
        id: 'r2',
        pattern: 'ENEL DISTRIBUICAO',
        matchType: 'contains',
        suggestedType: 'expense',
        categoryId: 'cat-net',
        targetAccountId: null,
        priority: 0,
      },
      {
        id: 'r3',
        pattern: 'DISTRIBUICAO',
        matchType: 'contains',
        suggestedType: 'expense',
        categoryId: 'cat-cel',
        targetAccountId: null,
        priority: 5,
      },
    ];

    expect(suggest(out('ENEL DISTRIBUICAO'), { ...context, userRules: rules })).toMatchObject({
      categoryId: 'cat-cel',
      source: 'user_rule',
    });
    expect(
      suggest(out('ENEL DISTRIBUICAO'), { ...context, userRules: rules.slice(0, 2) }),
    ).toMatchObject({
      categoryId: 'cat-net',
    });
  });

  it('regra do usuário: starts_with, transferência e tipo incompatível com o sentido é ignorada', () => {
    const rules: RuleLike[] = [
      {
        id: 'r1',
        pattern: 'PIX ENVIADO MARIA',
        matchType: 'starts_with',
        suggestedType: 'transfer',
        categoryId: null,
        targetAccountId: 'mp',
        priority: 0,
      },
      {
        id: 'r2',
        pattern: 'BONUS',
        matchType: 'contains',
        suggestedType: 'income',
        categoryId: 'cat-salary',
        targetAccountId: null,
        priority: 0,
      },
    ];
    const withRules = { ...context, userRules: rules };

    expect(suggest(out('PIX ENVIADO MARIA SILVA'), withRules)).toMatchObject({
      type: 'transfer',
      targetAccountId: 'mp',
    });
    expect(suggest(out('RECEBI PIX ENVIADO MARIA'), withRules).type).toBe('expense'); // não começa com o padrão
    expect(suggest(out('BONUS'), withRules)).toMatchObject({ type: 'expense', categoryId: null }); // receita não sai
    expect(suggest(inn('BONUS'), withRules)).toMatchObject({
      type: 'income',
      categoryId: 'cat-salary',
    });
  });

  it('pagamento de fatura NUNCA é despesa: vira card_payment, com a fatura de mesmo valor', () => {
    const withInvoices = {
      ...context,
      payableInvoices: [
        { id: 'inv-late', payableCents: 90_000, dueDate: '2026-11-05' },
        { id: 'inv-early', payableCents: 90_000, dueDate: '2026-10-05' },
        { id: 'inv-other', payableCents: 12_300, dueDate: '2026-10-05' },
      ],
    };

    expect(suggest(out('PAGAMENTO FATURA NUBANK', 90_000), withInvoices)).toEqual({
      type: 'card_payment',
      categoryId: null,
      targetAccountId: null,
      invoiceId: 'inv-early',
      source: 'card_invoice',
    });
    expect(suggest(out('PGTO FATURA CARTAO', 55_500), withInvoices)).toMatchObject({
      type: 'card_payment',
      invoiceId: null,
      source: 'default_rule',
    });
    expect(suggest(inn('ESTORNO FATURA CARTAO'), withInvoices).type).toBe('income');
  });
});

describe('extratos de exemplo (database/seeds/samples)', () => {
  const read = (name: string) =>
    readFileSync(
      new URL(`../../../../../../database/seeds/samples/${name}`, import.meta.url),
      'utf-8',
    );

  it('extrato do Inter: 6 movimentações, valores exatos e a linha de saldo reportada como ignorada', () => {
    const result = parseStatement(read('extrato-inter.csv'));

    expect(result.rows.map((row) => row.signedCents)).toEqual([
      -30_000, -9_099, 500_000, -1_250, -1_250, -90_000,
    ]);
    expect(result.ignored).toHaveLength(1);
    // As duas compras idênticas têm impressões digitais diferentes (ordinais).
    const prints = fingerprints(
      'conta',
      result.rows.map((row) => ({
        date: row.date,
        signedCents: row.signedCents,
        normalized: normalizeDescription(row.description),
      })),
    );
    expect(new Set(prints).size).toBe(6);
  });

  it('extrato do Mercado Pago', () => {
    const result = parseStatement(read('extrato-mercado-pago.csv'));

    expect(result.rows.map((row) => [row.date, row.signedCents, row.externalId])).toEqual([
      ['2026-09-02', 30_000, '98765'],
      ['2026-09-03', -2_490, '98766'],
    ]);
  });
});
