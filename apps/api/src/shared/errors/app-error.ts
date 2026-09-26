import { API_ERROR_CODES, type ApiErrorCode } from '@fintrack/shared';

/**
 * Erro de negócio/aplicação. Services lançam estes erros; o error handler central
 * os converte no envelope padrão `{ error: { code, message, details } }`.
 */
export class AppError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends AppError {
  constructor(message = 'Recurso não encontrado.') {
    super(404, API_ERROR_CODES.NOT_FOUND, message);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = 'Autenticação necessária.') {
    super(401, API_ERROR_CODES.UNAUTHORIZED, message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Acesso negado.') {
    super(403, API_ERROR_CODES.FORBIDDEN, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string, details?: unknown) {
    super(409, API_ERROR_CODES.CONFLICT, message, details);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, API_ERROR_CODES.VALIDATION_ERROR, message, details);
  }
}
