import type { CreateMerchantRuleRequest } from '@fintrack/shared';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/index.js';
import type { AccountsRepository } from '../accounts/accounts.repository.js';
import type { CategoriesRepository } from '../categories/categories.repository.js';
import { normalizeDescription } from './domain/normalize.js';
import type { MerchantRulesRepository } from './imports.repository.js';
import type { MerchantRuleRecord } from './imports.types.js';

export interface MerchantRulesServiceDeps {
  rules: MerchantRulesRepository;
  accounts: AccountsRepository;
  categories: CategoriesRepository;
}

/** Regras "descrição parecida com X → categoria/tipo/conta" que orientam as sugestões da importação. */
export class MerchantRulesService {
  constructor(private readonly deps: MerchantRulesServiceDeps) {}

  list(userId: string): Promise<MerchantRuleRecord[]> {
    return this.deps.rules.list(userId);
  }

  async create(userId: string, input: CreateMerchantRuleRequest): Promise<MerchantRuleRecord> {
    // O texto é guardado normalizado (maiúsculas, sem acentos) — é assim que é comparado.
    const pattern = normalizeDescription(input.pattern);
    if (pattern.length < 2) {
      throw new BusinessRuleError('O texto precisa ter ao menos 2 letras ou números.');
    }

    if (input.categoryId) {
      const category = await this.deps.categories.findById(userId, input.categoryId);
      if (!category) throw new NotFoundError('Categoria não encontrada.');
      if (category.archivedAt) throw new ConflictError('A categoria está arquivada.');
      if (category.kind !== input.suggestedType) {
        throw new BusinessRuleError(
          input.suggestedType === 'income'
            ? 'Escolha uma categoria de receita.'
            : 'Escolha uma categoria de despesa.',
        );
      }
    }
    if (input.targetAccountId) {
      const account = await this.deps.accounts.findById(userId, input.targetAccountId);
      if (!account) throw new NotFoundError('Conta não encontrada.');
      if (account.archivedAt) throw new ConflictError('A conta está arquivada.');
    }

    return this.deps.rules.upsert(userId, {
      pattern,
      matchType: input.matchType ?? 'contains',
      suggestedType: input.suggestedType,
      categoryId: input.suggestedType === 'transfer' ? null : (input.categoryId ?? null),
      targetAccountId: input.suggestedType === 'transfer' ? (input.targetAccountId ?? null) : null,
      priority: input.priority ?? 0,
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    if (!(await this.deps.rules.remove(userId, id))) {
      throw new NotFoundError('Regra não encontrada.');
    }
  }
}
