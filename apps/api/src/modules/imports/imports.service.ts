import {
  addDaysToDate,
  DUPLICATE_WINDOW_DAYS,
  type ConfirmImportRequest,
  type ConfirmImportResponse,
  type CreateImportRequest,
} from '@fintrack/shared';
import {
  AppError,
  BusinessRuleError,
  ConflictError,
  NotFoundError,
} from '../../shared/errors/index.js';
import type { AccountsRepository } from '../accounts/accounts.repository.js';
import type { CategoriesRepository } from '../categories/categories.repository.js';
import type { CreditCardsService } from '../credit-cards/credit-cards.service.js';
import type { TransactionsService } from '../transactions/transactions.service.js';
import type { TransfersService } from '../transfers/transfers.service.js';
import type { UsersRepository } from '../users/users.repository.js';
import { detectDuplicates } from './domain/duplicates.js';
import { fingerprints, normalizeDescription } from './domain/normalize.js';
import { PlanError, planRow, rulePatternFrom, type PlannedRow } from './domain/plan.js';
import { parseStatement, StatementParseError } from './domain/statement.js';
import { suggest, type SuggestionContext } from './domain/suggestions.js';
import type { ImportsRepository, MerchantRulesRepository } from './imports.repository.js';
import type {
  ImportDetailRecord,
  ImportRecord,
  ImportedRowRecord,
  NewImportedRow,
} from './imports.types.js';

/** Serviços que rodam DENTRO da mesma transação SQL da confirmação (tudo ou nada). */
export interface ImportsUnit {
  imports: ImportsRepository;
  rules: MerchantRulesRepository;
  transactions: TransactionsService;
  transfers: TransfersService;
  cards: CreditCardsService;
}

export interface ImportsServiceDeps {
  imports: ImportsRepository;
  rules: MerchantRulesRepository;
  accounts: AccountsRepository;
  categories: CategoriesRepository;
  cards: CreditCardsService;
  users: UsersRepository;
  withTransaction<T>(work: (unit: ImportsUnit) => Promise<T>): Promise<T>;
  now?: () => Date;
}

export interface ImportView {
  record: ImportDetailRecord;
  rows: ImportedRowRecord[];
}

/** Máximo de linhas ignoradas devolvidas com o lote (a contagem total é sempre informada). */
const MAX_IGNORED_LISTED = 200;
const HISTORY_LIMIT = 50;

/**
 * Importação de extratos (ADR 0018). O arquivo vira uma lista de itens para REVISÃO; só a
 * confirmação cria lançamentos — pelos MESMOS services do resto do sistema (mesmas regras), numa única
 * transação: ou entra tudo o que foi aprovado, ou nada.
 */
export class ImportsService {
  private readonly now: () => Date;

  constructor(private readonly deps: ImportsServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  // ---------- Criar (parse → normalizar → duplicatas → sugestões) ----------

  async create(userId: string, input: CreateImportRequest): Promise<ImportView> {
    const source = input.source ?? 'csv';
    if (source !== 'csv') {
      throw new BusinessRuleError('Por enquanto só arquivos CSV são aceitos.');
    }
    const account = await this.deps.accounts.findById(userId, input.accountId);
    if (!account) throw new NotFoundError('Conta não encontrada.');
    if (account.archivedAt) throw new ConflictError('A conta está arquivada.');
    if (account.type === 'investment') {
      throw new BusinessRuleError(
        'Extratos de contas de investimento não são importados aqui (os rendimentos entram na fase de investimentos).',
      );
    }

    let parsed;
    try {
      parsed = parseStatement(input.content, {
        delimiter: input.delimiter,
        mapping: input.mapping,
      });
    } catch (error) {
      if (error instanceof StatementParseError) {
        throw new BusinessRuleError(
          error.message,
          error.headers.length > 0 ? { headers: error.headers } : undefined,
        );
      }
      throw error;
    }

    const normalized = parsed.rows.map(
      (row) => normalizeDescription(row.description) || 'SEM DESCRICAO',
    );
    const prints = fingerprints(
      account.id,
      parsed.rows.map((row, index) => ({
        date: row.date,
        signedCents: row.signedCents,
        normalized: normalized[index] as string,
      })),
    );
    const dates = parsed.rows.map((row) => row.date).sort();
    const from = addDaysToDate(dates[0] as string, -DUPLICATE_WINDOW_DAYS);
    const to = addDaysToDate(dates[dates.length - 1] as string, DUPLICATE_WINDOW_DAYS);

    const [prior, existing, rules, categories, accounts, payable] = await Promise.all([
      this.deps.imports.priorFingerprints(userId, account.id, prints),
      this.deps.imports.existingTransactions(userId, account.id, from, to),
      this.deps.rules.list(userId),
      this.deps.categories.list(userId, { includeArchived: false }),
      this.deps.accounts.list(userId, { includeArchived: false }),
      this.deps.cards.listPayableInvoices(userId),
    ]);

    const duplicates = detectDuplicates(
      parsed.rows.map((row, index) => ({
        fingerprint: prints[index] as string,
        date: row.date,
        signedCents: row.signedCents,
        normalized: normalized[index] as string,
      })),
      prior,
      existing.map((entry) => ({
        id: entry.id,
        date: entry.date,
        signedCents: entry.signedCents,
        normalized: normalizeDescription(entry.description),
      })),
    );

    const context: SuggestionContext = {
      accountId: account.id,
      userRules: rules,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        kind: category.kind,
      })),
      accounts: accounts.map((item) => ({ id: item.id, name: item.name })),
      payableInvoices: payable.map((invoice) => ({
        id: invoice.id,
        payableCents: invoice.totalCents - invoice.paidCents - invoice.scheduledCents,
        dueDate: invoice.dueDate,
      })),
    };

    const rows: NewImportedRow[] = parsed.rows.map((row, index) => {
      const direction = row.signedCents > 0 ? 'in' : 'out';
      const amountCents = Math.abs(row.signedCents);
      const suggestion = suggest(
        { direction, amountCents, normalized: normalized[index] as string },
        context,
      );
      const duplicate = duplicates[index] ?? null;
      // Duplicatas e pagamentos de fatura sem fatura correspondente começam como "pular", mas ficam
      // visíveis na revisão: nada é descartado em silêncio, e o usuário pode decidir o contrário.
      const skipByDefault =
        duplicate !== null || (suggestion.type === 'card_payment' && !suggestion.invoiceId);
      return {
        rowNumber: row.rowNumber,
        raw: row.raw,
        date: row.date,
        amountCents,
        direction,
        description: row.description,
        normalizedDescription: normalized[index] as string,
        fingerprint: prints[index] as string,
        externalId: row.externalId,
        suggestedType: suggestion.type,
        suggestedCategoryId: suggestion.categoryId,
        suggestedTargetAccountId: suggestion.targetAccountId,
        suggestedInvoiceId: suggestion.invoiceId,
        suggestionSource: suggestion.source,
        duplicateKind: duplicate?.kind ?? null,
        duplicateOfTransactionId: duplicate?.transactionId ?? null,
        defaultAction: skipByDefault ? 'skip' : 'import',
      };
    });

    const id = await this.deps.imports.create(userId, {
      accountId: account.id,
      source,
      filename: input.filename,
      detected: parsed.detected,
      ignoredRows: parsed.ignored.slice(0, MAX_IGNORED_LISTED),
      ignoredRowsCount: parsed.ignored.length,
      rows,
    });
    return this.get(userId, id);
  }

  // ---------- Consultar ----------

  async list(userId: string): Promise<ImportRecord[]> {
    return this.deps.imports.list(userId, HISTORY_LIMIT);
  }

  async get(userId: string, id: string): Promise<ImportView> {
    const record = await this.deps.imports.findById(userId, id);
    if (!record) throw new NotFoundError('Importação não encontrada.');
    return { record, rows: await this.deps.imports.rows(userId, id) };
  }

  // ---------- Confirmar ----------

  async confirm(
    userId: string,
    id: string,
    request: ConfirmImportRequest,
  ): Promise<ConfirmImportResponse> {
    const view = await this.get(userId, id);
    this.assertReviewable(view.record);
    const rowsById = new Map(view.rows.map((row) => [row.id, row]));

    const decisions = new Map<string, NonNullable<ConfirmImportRequest['decisions']>[number]>();
    for (const decision of request.decisions ?? []) {
      if (!rowsById.has(decision.rowId)) {
        throw new BusinessRuleError(
          'Há uma decisão para uma linha que não pertence a esta importação.',
        );
      }
      if (decisions.has(decision.rowId)) {
        throw new BusinessRuleError('Há mais de uma decisão para a mesma linha.');
      }
      decisions.set(decision.rowId, decision);
    }

    const plan: { row: ImportedRowRecord; step: PlannedRow }[] = view.rows.map((row) => {
      try {
        return { row, step: planRow(row, decisions.get(row.id), view.record.accountId) };
      } catch (error) {
        if (error instanceof PlanError) {
          throw new BusinessRuleError(`Linha ${row.rowNumber}: ${error.message}`);
        }
        throw error;
      }
    });

    return this.deps.withTransaction(async (unit) => {
      // Trava o lote: duas confirmações simultâneas não criam lançamentos em dobro.
      const locked = await unit.imports.lockById(userId, id);
      if (!locked) throw new NotFoundError('Importação não encontrada.');
      this.assertReviewable(locked);

      let imported = 0;
      let skipped = 0;
      let transfers = 0;
      let cardPayments = 0;
      let rulesSaved = 0;

      for (const { row, step } of plan) {
        if (step.action === 'skip') {
          await unit.imports.markRow(userId, row.id, { status: 'skipped' });
          skipped++;
          continue;
        }
        try {
          if (step.type === 'transfer') {
            const accountId = locked.accountId;
            const target = step.targetAccountId as string;
            const transfer = await unit.transfers.create(userId, {
              fromAccountId: row.direction === 'out' ? accountId : target,
              toAccountId: row.direction === 'out' ? target : accountId,
              amountCents: row.amountCents,
              transferDate: row.date,
              description: step.description,
            });
            await unit.imports.markRow(userId, row.id, {
              status: 'imported',
              createdTransferId: transfer.id,
            });
            transfers++;
          } else if (step.type === 'card_payment') {
            const payment = await unit.cards.payInvoice(userId, step.invoiceId as string, {
              accountId: locked.accountId,
              amountCents: row.amountCents,
              paymentDate: row.date,
            });
            await unit.imports.markRow(userId, row.id, {
              status: 'imported',
              createdTransactionId: payment.id,
            });
            cardPayments++;
          } else {
            const created = await unit.transactions.create(userId, {
              accountId: locked.accountId,
              type: step.type,
              amountCents: row.amountCents,
              description: step.description,
              transactionDate: row.date,
              ...(step.categoryId ? { categoryId: step.categoryId } : {}),
            });
            await unit.imports.markRow(userId, row.id, {
              status: 'imported',
              createdTransactionId: created.id,
            });
          }
          imported++;

          if (step.saveRule) {
            const pattern = rulePatternFrom(row.normalizedDescription);
            if (pattern.length >= 2) {
              await unit.rules.upsert(userId, {
                pattern,
                matchType: 'contains',
                suggestedType:
                  step.type === 'transfer' ? 'transfer' : (step.type as 'income' | 'expense'),
                categoryId: step.type === 'transfer' ? null : step.categoryId,
                targetAccountId: step.type === 'transfer' ? step.targetAccountId : null,
                priority: 0,
              });
              rulesSaved++;
            }
          }
        } catch (error) {
          // Qualquer falha desfaz o lote inteiro (a transação é revertida), indicando a linha.
          if (error instanceof AppError) {
            throw new BusinessRuleError(`Linha ${row.rowNumber}: ${error.message}`);
          }
          throw error;
        }
      }

      await unit.imports.setStatus(userId, id, 'confirmed', this.now());
      return { importId: id, imported, skipped, transfers, cardPayments, rulesSaved };
    });
  }

  // ---------- Cancelar e desfazer ----------

  /** Descarta uma importação que ainda está em revisão. Nada foi criado. */
  async cancel(userId: string, id: string): Promise<ImportView> {
    const view = await this.get(userId, id);
    this.assertReviewable(view.record);
    await this.deps.imports.setStatus(userId, id, 'cancelled');
    return this.get(userId, id);
  }

  /**
   * Desfaz uma importação confirmada: CANCELA os lançamentos, transferências e pagamentos que ela
   * criou (nunca apaga — o histórico permanece). As linhas deixam de contar como "já importadas".
   */
  async revert(userId: string, id: string): Promise<ImportView> {
    const view = await this.get(userId, id);
    if (view.record.status !== 'confirmed') {
      throw new ConflictError('Só é possível desfazer uma importação confirmada.');
    }
    await this.deps.withTransaction(async (unit) => {
      const locked = await unit.imports.lockById(userId, id);
      if (!locked || locked.status !== 'confirmed') {
        throw new ConflictError('Só é possível desfazer uma importação confirmada.');
      }
      for (const row of view.rows) {
        if (row.status !== 'imported') continue;
        if (row.createdTransferId) await unit.transfers.cancel(userId, row.createdTransferId);
        else if (row.createdTransactionId) {
          await unit.transactions.cancel(userId, row.createdTransactionId);
        }
      }
      await unit.imports.setStatus(userId, id, 'reverted');
    });
    return this.get(userId, id);
  }

  private assertReviewable(record: ImportDetailRecord) {
    if (record.status !== 'review') {
      throw new ConflictError('Esta importação já foi confirmada, cancelada ou desfeita.');
    }
  }
}
