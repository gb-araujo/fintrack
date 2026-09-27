/**
 * Leitor de CSV (RFC 4180 com tolerância): aspas duplas, "" como aspas literais, quebras de linha
 * dentro de campos entre aspas, CRLF/LF e BOM. Funções PURAS — sem I/O.
 */
export type CsvDelimiter = ';' | ',' | '\t' | '|';

export interface CsvRecord {
  /** Linha física (1 = primeira) onde o registro começa — para o usuário localizar no arquivo. */
  line: number;
  cells: string[];
}

const CANDIDATES: readonly CsvDelimiter[] = [';', ',', '\t', '|'];

export function stripBom(text: string): string {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Conta ocorrências do delimitador fora de aspas em uma linha física. */
function countOutsideQuotes(line: string, delimiter: string): number {
  let inQuotes = false;
  let count = 0;
  for (const char of line) {
    if (char === '"') inQuotes = !inQuotes;
    else if (char === delimiter && !inQuotes) count++;
  }
  return count;
}

/**
 * Adivinha o delimitador: o que aparece um número CONSISTENTE de vezes (> 0) no maior número de
 * linhas das primeiras linhas não vazias. Empates preferem `;` (padrão dos bancos brasileiros).
 */
export function detectDelimiter(content: string): CsvDelimiter {
  const lines = stripBom(content)
    .split(/\r\n|\n|\r/)
    .filter((line) => line.trim() !== '')
    .slice(0, 30);
  let best: CsvDelimiter = ';';
  let bestScore = 0;
  for (const delimiter of CANDIDATES) {
    const counts = lines.map((line) => countOutsideQuotes(line, delimiter)).filter((n) => n > 0);
    if (counts.length === 0) continue;
    const frequency = new Map<number, number>();
    for (const count of counts) frequency.set(count, (frequency.get(count) ?? 0) + 1);
    let modeCount = 0;
    let modeFrequency = 0;
    for (const [count, times] of frequency) {
      if (times > modeFrequency || (times === modeFrequency && count > modeCount)) {
        modeCount = count;
        modeFrequency = times;
      }
    }
    const score = modeFrequency * modeCount;
    if (score > bestScore) {
      best = delimiter;
      bestScore = score;
    }
  }
  return best;
}

/** Divide o conteúdo em registros, ignorando registros totalmente vazios. */
export function parseCsv(content: string, delimiter: CsvDelimiter): CsvRecord[] {
  const text = stripBom(content);
  const records: CsvRecord[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;

  const endField = () => {
    cells.push(field);
    field = '';
  };
  const endRecord = () => {
    endField();
    if (cells.some((cell) => cell.trim() !== '')) records.push({ line: recordLine, cells });
    cells = [];
  };

  for (let index = 0; index < text.length; index++) {
    const char = text[index] as string;
    if (inQuotes) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index++;
        } else {
          inQuotes = false;
        }
      } else {
        if (char === '\n') line++;
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      endField();
    } else if (char === '\r' || char === '\n') {
      if (char === '\r' && text[index + 1] === '\n') index++;
      endRecord();
      line++;
      recordLine = line;
    } else {
      field += char;
    }
  }
  endRecord();
  return records;
}
