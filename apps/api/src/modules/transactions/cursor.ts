import { dateOnlySchema } from '@fintrack/shared';
import { z } from 'zod';
import { ValidationError } from '../../shared/errors/index.js';
import type { PageCursor } from './transactions.types.js';

const cursorSchema = z.object({
  d: dateOnlySchema,
  c: z.string().min(1).max(64),
  i: z.uuid(),
});

/** Cursor opaco para o cliente: base64url de { d, c, i }. */
export function encodeCursor(cursor: PageCursor): string {
  return Buffer.from(
    JSON.stringify({ d: cursor.date, c: cursor.createdAt, i: cursor.id }),
  ).toString('base64url');
}

export function decodeCursor(value: string): PageCursor {
  try {
    const parsed = cursorSchema.parse(JSON.parse(Buffer.from(value, 'base64url').toString('utf8')));
    return { date: parsed.d, createdAt: parsed.c, id: parsed.i };
  } catch {
    throw new ValidationError('Cursor de paginação inválido.');
  }
}
