import {
  todayInTimeZone,
  type InvestmentSummary,
  type InvestmentValuation,
  type UpdateInvestmentDetailsRequest,
  type UpsertValuationRequest,
} from '@fintrack/shared';
import type { AccountRecord } from '../accounts/accounts.types.js';
import { BusinessRuleError, ConflictError, NotFoundError } from '../../shared/errors/index.js';
import type { AccountsRepository } from '../accounts/accounts.repository.js';
import type { UsersRepository } from '../users/users.repository.js';
import { computeYield } from './domain/yield.js';
import type { InvestmentsRepository, ValuationRow } from './investments.repository.js';

export interface InvestmentsServiceDeps {
  investments: InvestmentsRepository;
  accounts: AccountsRepository;
  users: UsersRepository;
  now?: () => Date;
}

/**
 * Rendimentos de investimento (ADR 0020). Nada aqui guarda um "rendimento" pronto: tudo é
 * recalculado a partir do histórico de avaliações + lançamentos a cada leitura — por isso corrigir
 * uma avaliação antiga recalcula os rendimentos seguintes automaticamente, sem migração de dados.
 */
export class InvestmentsService {
  private readonly now: () => Date;

  constructor(private readonly deps: InvestmentsServiceDeps) {
    this.now = deps.now ?? (() => new Date());
  }

  private async today(userId: string): Promise<string> {
    const user = await this.deps.users.findById(userId);
    if (!user) throw new NotFoundError('Usuário não encontrado.');
    return todayInTimeZone(user.timezone, this.now());
  }

  private async requireInvestmentAccount(userId: string, accountId: string): Promise<AccountRecord> {
    const account = await this.deps.accounts.findById(userId, accountId);
    if (!account) throw new NotFoundError('Conta não encontrada.');
    if (account.type !== 'investment') {
      throw new BusinessRuleError('Avaliações só existem para contas de investimento.');
    }
    return account;
  }

  async listSummaries(userId: string): Promise<InvestmentSummary[]> {
    const accounts = (await this.deps.accounts.list(userId, { includeArchived: false })).filter(
      (account) => account.type === 'investment',
    );

    return Promise.all(accounts.map((account) => this.toSummary(userId, account)));
  }

  private async toSummary(userId: string, account: AccountRecord): Promise<InvestmentSummary> {
    const [details, valuations, netContributedCents] = await Promise.all([
      this.deps.investments.getDetails(userId, account.id),
      this.deps.investments.listValuations(userId, account.id),
      this.deps.investments.netContributed(userId, account.id, {}),
    ]);
    const first = valuations[0];

    let totalYieldCents: number | null = null;
    let totalYieldPercent: number | null = null;
    if (first) {
      const netContributedSinceFirst = await this.deps.investments.netContributed(userId, account.id, {
        after: first.date,
      });
      const result = computeYield(first.balanceCents, account.balanceCents, netContributedSinceFirst);
      totalYieldCents = result.yieldCents;
      totalYieldPercent = result.yieldPercent;
    }

    return {
      accountId: account.id,
      accountName: account.name,
      institution: details?.institution ?? null,
      product: details?.product ?? null,
      balanceCents: account.balanceCents,
      netContributedCents,
      latestValuationDate: valuations.at(-1)?.date ?? null,
      totalYieldCents,
      totalYieldPercent,
    };
  }

  async listValuations(userId: string, accountId: string): Promise<InvestmentValuation[]> {
    await this.requireInvestmentAccount(userId, accountId);
    const rows = await this.deps.investments.listValuations(userId, accountId);
    return Promise.all(rows.map((row, index) => this.toValuation(userId, accountId, rows, index)));
  }

  private async toValuation(
    userId: string,
    accountId: string,
    rows: ValuationRow[],
    index: number,
  ): Promise<InvestmentValuation> {
    const row = rows[index]!;
    const previous = rows[index - 1];
    const contributedCents = await this.deps.investments.netContributed(userId, accountId, {
      after: previous?.date,
      upTo: row.date,
    });
    const result = previous
      ? computeYield(previous.balanceCents, row.balanceCents, contributedCents)
      : { yieldCents: null, yieldPercent: null };
    return {
      id: row.id,
      accountId,
      date: row.date,
      balanceCents: row.balanceCents,
      note: row.note,
      yieldCents: result.yieldCents,
      yieldPercent: result.yieldPercent,
      contributedCents,
      createdAt: row.createdAt.toISOString(),
    };
  }

  async upsertValuation(
    userId: string,
    accountId: string,
    input: UpsertValuationRequest,
  ): Promise<InvestmentValuation> {
    const account = await this.requireInvestmentAccount(userId, accountId);
    if (account.archivedAt) throw new ConflictError('A conta está arquivada.');
    const today = await this.today(userId);
    if (input.date > today) {
      throw new BusinessRuleError('A data da avaliação não pode ser no futuro.');
    }

    await this.deps.investments.upsertValuation(userId, accountId, {
      date: input.date,
      balanceCents: input.balanceCents,
      note: input.note ?? null,
    });

    const rows = await this.deps.investments.listValuations(userId, accountId);
    const index = rows.findIndex((row) => row.date === input.date);
    if (index === -1) throw new Error('Avaliação recém-gravada não encontrada');
    return this.toValuation(userId, accountId, rows, index);
  }

  async deleteValuation(userId: string, accountId: string, id: string): Promise<void> {
    const account = await this.requireInvestmentAccount(userId, accountId);
    if (account.archivedAt) throw new ConflictError('A conta está arquivada.');
    if (!(await this.deps.investments.deleteValuation(userId, accountId, id))) {
      throw new NotFoundError('Avaliação não encontrada.');
    }
  }

  async updateDetails(
    userId: string,
    accountId: string,
    input: UpdateInvestmentDetailsRequest,
  ): Promise<InvestmentSummary> {
    const account = await this.requireInvestmentAccount(userId, accountId);
    const current = await this.deps.investments.getDetails(userId, accountId);
    await this.deps.investments.upsertDetails(userId, accountId, {
      institution: input.institution !== undefined ? input.institution : current?.institution ?? null,
      product: input.product !== undefined ? input.product : current?.product ?? null,
    });
    return this.toSummary(userId, account);
  }
}
