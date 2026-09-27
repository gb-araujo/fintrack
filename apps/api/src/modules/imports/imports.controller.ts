import {
  confirmImportRequestSchema,
  confirmImportResponseSchema,
  createImportRequestSchema,
  createMerchantRuleRequestSchema,
  importDetailSchema,
  importListResponseSchema,
  merchantRuleListResponseSchema,
  merchantRuleSchema,
  type ImportDetail,
  type ImportSummary,
  type MerchantRule,
} from '@fintrack/shared';
import type { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { ImportsService, ImportView } from './imports.service.js';
import type { ImportRecord, MerchantRuleRecord } from './imports.types.js';
import type { MerchantRulesService } from './merchant-rules.service.js';

export interface ImportsRoutesOptions {
  importsService: ImportsService;
  merchantRulesService: MerchantRulesService;
}

const idParams = z.object({ id: z.uuid() });
const security = [{ bearerAuth: [] }];

/** Corpo de importação carrega o texto do arquivo: limite maior que o padrão da API (1 MB). */
const IMPORT_BODY_LIMIT = 4 * 1024 * 1024;

function toSummary(record: ImportRecord): ImportSummary {
  return {
    id: record.id,
    accountId: record.accountId,
    source: record.source,
    filename: record.filename,
    status: record.status,
    rowsCount: record.rowsCount,
    importedCount: record.importedCount,
    skippedCount: record.skippedCount,
    createdAt: record.createdAt.toISOString(),
    confirmedAt: record.confirmedAt?.toISOString() ?? null,
  };
}

function toDetail({ record, rows }: ImportView): ImportDetail {
  return {
    ...toSummary(record),
    detected: record.detected,
    ignoredRows: record.ignoredRows,
    ignoredRowsCount: record.ignoredRowsCount,
    rows: rows.map((row) => ({
      id: row.id,
      rowNumber: row.rowNumber,
      date: row.date,
      amountCents: row.amountCents,
      direction: row.direction,
      description: row.description,
      normalizedDescription: row.normalizedDescription,
      suggestedType: row.suggestedType,
      suggestedCategoryId: row.suggestedCategoryId,
      suggestedTargetAccountId: row.suggestedTargetAccountId,
      suggestedInvoiceId: row.suggestedInvoiceId,
      suggestionSource: row.suggestionSource,
      duplicate: row.duplicateKind
        ? { kind: row.duplicateKind, transactionId: row.duplicateOfTransactionId }
        : null,
      defaultAction: row.defaultAction,
      status: row.status,
    })),
  };
}

function toRule(rule: MerchantRuleRecord): MerchantRule {
  return {
    id: rule.id,
    pattern: rule.pattern,
    matchType: rule.matchType,
    suggestedType: rule.suggestedType,
    categoryId: rule.categoryId,
    targetAccountId: rule.targetAccountId,
    priority: rule.priority,
    createdAt: rule.createdAt.toISOString(),
  };
}

export const importsRoutes: FastifyPluginCallbackZod<ImportsRoutesOptions> = (
  app,
  { importsService, merchantRulesService },
  done,
) => {
  app.addHook('onRequest', app.authenticate);

  app.post(
    '/imports',
    {
      bodyLimit: IMPORT_BODY_LIMIT,
      schema: {
        tags: ['imports'],
        summary:
          'Lê o extrato (CSV) e cria uma importação EM REVISÃO: linhas com sugestões e duplicatas. Não cria lançamentos',
        security,
        body: createImportRequestSchema,
        response: { 201: importDetailSchema },
      },
    },
    async (request, reply) => {
      const view = await importsService.create(request.userId, request.body);
      return reply.status(201).send(toDetail(view));
    },
  );

  app.get(
    '/imports',
    {
      schema: {
        tags: ['imports'],
        summary: 'Histórico de importações',
        security,
        response: { 200: importListResponseSchema },
      },
    },
    async (request) => ({ items: (await importsService.list(request.userId)).map(toSummary) }),
  );

  app.get(
    '/imports/:id',
    {
      schema: {
        tags: ['imports'],
        summary: 'Importação com todas as linhas (para revisar)',
        security,
        params: idParams,
        response: { 200: importDetailSchema },
      },
    },
    async (request) => toDetail(await importsService.get(request.userId, request.params.id)),
  );

  app.post(
    '/imports/:id/confirm',
    {
      schema: {
        tags: ['imports'],
        summary:
          'Confirma a revisão: cria os lançamentos aprovados numa única transação (tudo ou nada)',
        security,
        params: idParams,
        body: confirmImportRequestSchema.nullish(),
        response: { 200: confirmImportResponseSchema },
      },
    },
    async (request) =>
      importsService.confirm(request.userId, request.params.id, request.body ?? { decisions: [] }),
  );

  app.post(
    '/imports/:id/cancel',
    {
      schema: {
        tags: ['imports'],
        summary: 'Descarta uma importação em revisão (nada foi criado)',
        security,
        params: idParams,
        response: { 200: importDetailSchema },
      },
    },
    async (request) => toDetail(await importsService.cancel(request.userId, request.params.id)),
  );

  app.post(
    '/imports/:id/revert',
    {
      schema: {
        tags: ['imports'],
        summary: 'Desfaz uma importação confirmada: cancela o que ela criou (nada é apagado)',
        security,
        params: idParams,
        response: { 200: importDetailSchema },
      },
    },
    async (request) => toDetail(await importsService.revert(request.userId, request.params.id)),
  );

  // ---------- Regras de comerciante ----------

  app.get(
    '/merchant-rules',
    {
      schema: {
        tags: ['imports'],
        summary: 'Regras de comerciante do usuário (orientam as sugestões da importação)',
        security,
        response: { 200: merchantRuleListResponseSchema },
      },
    },
    async (request) => ({
      items: (await merchantRulesService.list(request.userId)).map(toRule),
    }),
  );

  app.post(
    '/merchant-rules',
    {
      schema: {
        tags: ['imports'],
        summary: 'Cria (ou atualiza) uma regra "descrição parecida com X → categoria/tipo/conta"',
        security,
        body: createMerchantRuleRequestSchema,
        response: { 201: merchantRuleSchema },
      },
    },
    async (request, reply) => {
      const rule = await merchantRulesService.create(request.userId, request.body);
      return reply.status(201).send(toRule(rule));
    },
  );

  app.delete(
    '/merchant-rules/:id',
    {
      schema: {
        tags: ['imports'],
        summary: 'Remove uma regra (configuração; não afeta lançamentos)',
        security,
        params: idParams,
        response: { 204: z.null() },
      },
    },
    async (request, reply) => {
      await merchantRulesService.remove(request.userId, request.params.id);
      return reply.status(204).send(null);
    },
  );

  done();
};
