import type { z } from 'zod';
import { ApiError } from '../services/http';

export type FieldErrors<T> = Partial<Record<keyof T, string>>;

/** Primeira mensagem de erro de cada campo (validação local com os schemas compartilhados). */
export function fieldErrorsFrom<T>(error: z.ZodError<T>): FieldErrors<T> {
  const errors: FieldErrors<T> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as keyof T | undefined;
    if (field !== undefined && errors[field] === undefined) errors[field] = issue.message;
  }
  return errors;
}

/** Mensagem amigável para erros da API em formulários. */
export function formErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'NETWORK_ERROR') return 'Sem conexão com o servidor. Tente novamente.';
    return error.message;
  }
  return 'Algo deu errado. Tente novamente.';
}
