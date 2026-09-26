import { API_ERROR_CODES, type ApiErrorBody, type ApiErrorCode } from '@fintrack/shared';
import type { FastifyError } from 'fastify';
import fp from 'fastify-plugin';
import {
  hasZodFastifySchemaValidationErrors,
  isResponseSerializationError,
} from 'fastify-type-provider-zod';
import { AppError } from '../shared/errors/index.js';

function errorBody(code: ApiErrorCode, message: string, details?: unknown): ApiErrorBody {
  return { error: { code, message, ...(details !== undefined ? { details } : {}) } };
}

const CLIENT_ERROR_CODES: Record<number, ApiErrorCode> = {
  400: API_ERROR_CODES.VALIDATION_ERROR,
  401: API_ERROR_CODES.UNAUTHORIZED,
  403: API_ERROR_CODES.FORBIDDEN,
  404: API_ERROR_CODES.NOT_FOUND,
  409: API_ERROR_CODES.CONFLICT,
  429: API_ERROR_CODES.RATE_LIMITED,
};

/**
 * Tratamento centralizado de erros. Toda resposta de erro da API usa o envelope
 * `{ error: { code, message, details? } }`. Erros inesperados nunca vazam detalhes internos.
 */
export const errorHandlerPlugin = fp(
  (app, _options, done) => {
    app.setNotFoundHandler((_request, reply) => {
      void reply.status(404).send(errorBody(API_ERROR_CODES.NOT_FOUND, 'Rota não encontrada.'));
    });

    app.setErrorHandler((error: FastifyError, request, reply) => {
      if (hasZodFastifySchemaValidationErrors(error)) {
        return reply.status(400).send(
          errorBody(
            API_ERROR_CODES.VALIDATION_ERROR,
            'Dados inválidos.',
            error.validation.map((issue) => ({
              path: issue.instancePath,
              message: issue.message,
            })),
          ),
        );
      }

      if (error instanceof AppError) {
        return reply
          .status(error.statusCode)
          .send(errorBody(error.code, error.message, error.details));
      }

      if (isResponseSerializationError(error)) {
        request.log.error({ err: error }, 'resposta fora do contrato');
        return reply
          .status(500)
          .send(errorBody(API_ERROR_CODES.INTERNAL_ERROR, 'Erro interno do servidor.'));
      }

      const statusCode = error.statusCode ?? 500;
      if (statusCode >= 400 && statusCode < 500) {
        const code = CLIENT_ERROR_CODES[statusCode] ?? API_ERROR_CODES.VALIDATION_ERROR;
        return reply.status(statusCode).send(errorBody(code, error.message));
      }

      request.log.error({ err: error }, 'erro inesperado');
      return reply
        .status(500)
        .send(errorBody(API_ERROR_CODES.INTERNAL_ERROR, 'Erro interno do servidor.'));
    });

    done();
  },
  { name: 'error-handler' },
);
