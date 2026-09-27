import type { CategoryKind } from '@fintrack/shared';
import { and, asc, eq, isNull } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';
import { categories } from '../../db/schema/index.js';
import { ConflictError } from '../../shared/errors/index.js';
import { isUniqueViolation } from '../../shared/utils/db-errors.js';
import type { CategoryRecord } from './categories.types.js';

export interface CategoriesRepository {
  list(
    userId: string,
    options: { kind?: CategoryKind | undefined; includeArchived: boolean },
  ): Promise<CategoryRecord[]>;
  findById(userId: string, id: string): Promise<CategoryRecord | undefined>;
  create(userId: string, input: { name: string; kind: CategoryKind }): Promise<CategoryRecord>;
  rename(userId: string, id: string, name: string): Promise<CategoryRecord | undefined>;
  setArchived(userId: string, id: string, archived: boolean): Promise<CategoryRecord | undefined>;
}

const columns = {
  id: categories.id,
  name: categories.name,
  kind: categories.kind,
  isDefault: categories.isDefault,
  archivedAt: categories.archivedAt,
  createdAt: categories.createdAt,
};

const NAME_TAKEN = 'Já existe uma categoria ativa com esse nome.';
const UNIQUE_INDEX = 'categories_user_kind_name_active_unique';

export class DrizzleCategoriesRepository implements CategoriesRepository {
  constructor(private readonly db: DrizzleDb) {}

  list(
    userId: string,
    { kind, includeArchived }: { kind?: CategoryKind | undefined; includeArchived: boolean },
  ) {
    return this.db
      .select(columns)
      .from(categories)
      .where(
        and(
          eq(categories.userId, userId),
          kind ? eq(categories.kind, kind) : undefined,
          includeArchived ? undefined : isNull(categories.archivedAt),
        ),
      )
      .orderBy(asc(categories.kind), asc(categories.createdAt), asc(categories.name));
  }

  async findById(userId: string, id: string) {
    const [row] = await this.db
      .select(columns)
      .from(categories)
      .where(and(eq(categories.userId, userId), eq(categories.id, id)))
      .limit(1);
    return row;
  }

  async create(userId: string, input: { name: string; kind: CategoryKind }) {
    try {
      const [row] = await this.db
        .insert(categories)
        .values({ userId, name: input.name, kind: input.kind })
        .returning(columns);
      if (!row) throw new Error('INSERT em categories não retornou linha');
      return row;
    } catch (error) {
      if (isUniqueViolation(error, UNIQUE_INDEX)) throw new ConflictError(NAME_TAKEN);
      throw error;
    }
  }

  async rename(userId: string, id: string, name: string) {
    try {
      const [row] = await this.db
        .update(categories)
        .set({ name })
        .where(and(eq(categories.userId, userId), eq(categories.id, id)))
        .returning(columns);
      return row;
    } catch (error) {
      if (isUniqueViolation(error, UNIQUE_INDEX)) throw new ConflictError(NAME_TAKEN);
      throw error;
    }
  }

  async setArchived(userId: string, id: string, archived: boolean) {
    try {
      const [row] = await this.db
        .update(categories)
        .set({ archivedAt: archived ? new Date() : null })
        .where(and(eq(categories.userId, userId), eq(categories.id, id)))
        .returning(columns);
      return row;
    } catch (error) {
      if (isUniqueViolation(error, UNIQUE_INDEX)) throw new ConflictError(NAME_TAKEN);
      throw error;
    }
  }
}
