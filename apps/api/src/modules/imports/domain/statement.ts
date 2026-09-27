import { MAX_IMPORT_ROWS, type ColumnMapping } from '@fintrack/shared';
import { detectDelimiter, parseCsv, type CsvDelimiter, type CsvRecord } from './csv.js';
import { normalizeDescription } from './normalize.js';
import { parseAmountToCents, parseStatementDate } from './values.js';

/** O arquivo não pôde ser interpretado como extrato (mensagem em português para o usuário). */
export class StatementParseError extends Error {
  constructor(
    message: string,
    readonly headers: string[] = [],
  ) {
    super(message);
    this.name = 'StatementParseError';
  }
}

export interface ParsedRow {
  /** Linha física do arquivo. */
  rowNumber: number;
  date: string;
  /** Valor COM sinal: positivo = entrada, negativo = saída. */
  signedCents: number;
  description: string;
  externalId: string | null;
  /** Colunas originais (cabeçalho → valor), sem células vazias. */
  raw: Record<string, string>;
}

export interface ParsedStatement {
  rows: ParsedRow[];
  ignored: { line: number; reason: string }[];
  detected: { delimiter: CsvDelimiter; headers: string[]; mapping: ColumnMapping };
}

/** "Data Lançamento" → "data lancamento": chave para comparar cabeçalhos entre bancos. */
export function headerKey(header: string): string {
  return normalizeDescription(header).toLowerCase();
}

const SYNONYMS = {
  date: [
    'data',
    'data lancamento',
    'data movimentacao',
    'data da transacao',
    'data transacao',
    'data operacao',
    'data mov',
    'data compra',
    'release date',
    'date',
    'dia',
  ],
  description: [
    'descricao',
    'historico',
    'lancamento',
    'estabelecimento',
    'detalhes',
    'descricao do lancamento',
    'description',
    'transaction type',
    'memo',
    'nome',
  ],
  amount: [
    'valor',
    'valor r',
    'valor rs',
    'amount',
    'transaction net amount',
    'valor liquido',
    'quantia',
  ],
  debit: ['debito', 'valor debito', 'saida', 'saidas', 'debit'],
  credit: ['credito', 'valor credito', 'entrada', 'entradas', 'credit'],
  externalId: [
    'identificador',
    'id',
    'id transacao',
    'reference id',
    'documento',
    'numero documento',
    'nsu',
    'fitid',
    'codigo',
  ],
} as const;

interface ColumnIndices {
  date: number;
  description: number[];
  amount: number | null;
  debit: number | null;
  credit: number | null;
  externalId: number | null;
}

interface HeaderMatch {
  recordIndex: number;
  headers: string[];
  indices: ColumnIndices;
}

/** Procura o índice da primeira coluna cujo nome bate com um dos candidatos. */
function findColumn(keys: readonly string[], candidates: readonly string[]): number | null {
  const index = keys.findIndex((key) => candidates.includes(key));
  return index >= 0 ? index : null;
}

function indicesFromMapping(headers: string[], mapping: ColumnMapping): ColumnIndices | null {
  const keys = headers.map(headerKey);
  const one = (name: string | undefined) => {
    if (name === undefined) return null;
    const index = keys.indexOf(headerKey(name));
    return index >= 0 ? index : -1;
  };
  const date = one(mapping.date);
  const descriptions = (mapping.description ?? []).map((name) => one(name) ?? -1);
  const amount = one(mapping.amount);
  const debit = one(mapping.debit);
  const credit = one(mapping.credit);
  const externalId = one(mapping.externalId);
  if (date === null || date < 0 || descriptions.length === 0 || descriptions.some((i) => i < 0)) {
    return null;
  }
  if (amount === -1 || debit === -1 || credit === -1 || externalId === -1) return null;
  if (amount === null && debit === null && credit === null) return null;
  return {
    date,
    description: descriptions,
    amount,
    debit,
    credit,
    externalId,
  };
}

function indicesFromHeaders(headers: string[]): ColumnIndices | null {
  const keys = headers.map(headerKey);
  const date = findColumn(keys, SYNONYMS.date);
  const amount = findColumn(keys, SYNONYMS.amount);
  const debit = findColumn(keys, SYNONYMS.debit);
  const credit = findColumn(keys, SYNONYMS.credit);
  const description = keys.flatMap((key, index) =>
    (SYNONYMS.description as readonly string[]).includes(key) ? [index] : [],
  );
  if (date === null || description.length === 0) return null;
  if (amount === null && debit === null && credit === null) return null;
  return {
    date,
    description,
    amount,
    debit,
    credit,
    externalId: findColumn(keys, SYNONYMS.externalId),
  };
}

/** A linha de cabeçalho não é a primeira: bancos põem título e período antes das colunas. */
function locateHeader(records: CsvRecord[], mapping: ColumnMapping | undefined): HeaderMatch {
  const limit = Math.min(records.length, 40);
  for (let recordIndex = 0; recordIndex < limit; recordIndex++) {
    const headers = (records[recordIndex] as CsvRecord).cells.map((cell) => cell.trim());
    const indices = mapping ? indicesFromMapping(headers, mapping) : indicesFromHeaders(headers);
    if (indices) return { recordIndex, headers, indices };
  }
  const sample = (records[0]?.cells ?? []).map((cell) => cell.trim()).filter(Boolean);
  throw new StatementParseError(
    mapping
      ? 'Não encontrei no arquivo as colunas informadas. Confira os nomes no cabeçalho.'
      : 'Não consegui identificar as colunas de data, descrição e valor. ' +
          'Informe quais colunas usar (mapeamento).',
    sample,
  );
}

function cellAt(cells: string[], index: number | null): string {
  return index === null ? '' : (cells[index] ?? '').trim();
}

/**
 * Interpreta um extrato CSV: acha o cabeçalho, mapeia colunas (por sinônimos ou pelo mapeamento
 * informado), converte data e valor e devolve as linhas + as linhas IGNORADAS com o motivo.
 */
export function parseStatement(
  content: string,
  options: { delimiter?: CsvDelimiter | undefined; mapping?: ColumnMapping | undefined } = {},
): ParsedStatement {
  const delimiter = options.delimiter ?? detectDelimiter(content);
  const records = parseCsv(content, delimiter);
  if (records.length === 0) throw new StatementParseError('O arquivo está vazio.');

  const { recordIndex, headers, indices } = locateHeader(records, options.mapping);
  const rows: ParsedRow[] = [];
  const ignored: ParsedStatement['ignored'] = [];

  for (const record of records.slice(recordIndex + 1)) {
    const { cells, line } = record;
    const dateText = cellAt(cells, indices.date);
    const date = parseStatementDate(dateText);
    if (date === null) {
      ignored.push({
        line,
        reason: dateText === '' ? 'Sem data.' : `Data não reconhecida: "${dateText}".`,
      });
      continue;
    }

    let signedCents: number | null;
    if (indices.amount !== null) {
      const text = cellAt(cells, indices.amount);
      signedCents = parseAmountToCents(text);
      if (signedCents === null) {
        ignored.push({ line, reason: `Valor não reconhecido: "${text}".` });
        continue;
      }
    } else {
      const debitText = cellAt(cells, indices.debit);
      const creditText = cellAt(cells, indices.credit);
      const debit = debitText === '' ? 0 : parseAmountToCents(debitText);
      const credit = creditText === '' ? 0 : parseAmountToCents(creditText);
      if (debit === null || credit === null) {
        ignored.push({
          line,
          reason: `Valor não reconhecido: "${debit === null ? debitText : creditText}".`,
        });
        continue;
      }
      signedCents = Math.abs(credit) - Math.abs(debit);
    }
    if (signedCents === 0) {
      ignored.push({ line, reason: 'Valor zero.' });
      continue;
    }

    const parts: string[] = [];
    for (const index of indices.description) {
      const part = cellAt(cells, index);
      if (part !== '' && !parts.includes(part)) parts.push(part);
    }
    const description = (parts.join(' - ') || '(sem descrição)').slice(0, 300);
    const externalText = cellAt(cells, indices.externalId);
    const raw: Record<string, string> = {};
    headers.forEach((header, index) => {
      const value = (cells[index] ?? '').trim();
      if (header !== '' && value !== '') raw[header] = value.slice(0, 300);
    });

    rows.push({
      rowNumber: line,
      date,
      signedCents,
      description,
      externalId: externalText === '' ? null : externalText.slice(0, 100),
      raw,
    });
    if (rows.length > MAX_IMPORT_ROWS) {
      throw new StatementParseError(
        `O arquivo tem mais de ${MAX_IMPORT_ROWS} movimentações. Divida por período e importe em partes.`,
      );
    }
  }

  if (rows.length === 0) {
    throw new StatementParseError(
      'Não encontrei nenhuma movimentação no arquivo (todas as linhas foram ignoradas).',
      headers,
    );
  }

  const nameOf = (index: number | null) => (index === null ? undefined : headers[index]);
  const mapping: ColumnMapping = {
    ...(nameOf(indices.date) ? { date: nameOf(indices.date) } : {}),
    description: indices.description.map((index) => headers[index] as string),
    ...(nameOf(indices.amount) ? { amount: nameOf(indices.amount) } : {}),
    ...(nameOf(indices.debit) ? { debit: nameOf(indices.debit) } : {}),
    ...(nameOf(indices.credit) ? { credit: nameOf(indices.credit) } : {}),
    ...(nameOf(indices.externalId) ? { externalId: nameOf(indices.externalId) } : {}),
  };
  return { rows, ignored, detected: { delimiter, headers, mapping } };
}
