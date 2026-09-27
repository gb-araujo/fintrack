import { eq } from 'drizzle-orm';
import type { DrizzleDb } from '../../db/client.js';
import { categories, users } from '../../db/schema/index.js';
import { DEFAULT_CATEGORIES } from '../categories/default-categories.js';
import { ConflictError } from '../../shared/errors/index.js';
import { isUniqueViolation } from '../../shared/utils/db-errors.js';
import type { CreateUserInput, UserRecord, UserWithPassword } from './users.types.js';

export interface UsersRepository {
  findById(id: string): Promise<UserRecord | undefined>;
  /** Única busca que expõe o hash da senha — usada apenas no login. */
  findByEmailWithPassword(email: string): Promise<UserWithPassword | undefined>;
  create(input: CreateUserInput): Promise<UserRecord>;
}

const publicColumns = {
  id: users.id,
  email: users.email,
  name: users.name,
  timezone: users.timezone,
  currency: users.currency,
  createdAt: users.createdAt,
};

export class DrizzleUsersRepository implements UsersRepository {
  constructor(private readonly db: DrizzleDb) {}

  async findById(id: string): Promise<UserRecord | undefined> {
    const [row] = await this.db.select(publicColumns).from(users).where(eq(users.id, id)).limit(1);
    return row;
  }

  async findByEmailWithPassword(email: string): Promise<UserWithPassword | undefined> {
    const [row] = await this.db
      .select({ ...publicColumns, passwordHash: users.passwordHash })
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return row;
  }

  /**
   * Cria o usuário JUNTO com as categorias padrão, na mesma transação: ou o usuário nasce com
   * todas as categorias ou não nasce (nunca um usuário sem categorias).
   */
  async create(input: CreateUserInput): Promise<UserRecord> {
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx
          .insert(users)
          .values({
            email: input.email,
            name: input.name,
            passwordHash: input.passwordHash,
            ...(input.timezone ? { timezone: input.timezone } : {}),
          })
          .returning(publicColumns);
        if (!row) throw new Error('INSERT em users não retornou linha');

        // created_at cresce 1 ms por categoria: a lista mantém a ordem definida em DEFAULT_CATEGORIES.
        const base = Date.now();
        await tx.insert(categories).values(
          DEFAULT_CATEGORIES.map((category, index) => ({
            userId: row.id,
            name: category.name,
            kind: category.kind,
            isDefault: true,
            createdAt: new Date(base + index),
          })),
        );
        return row;
      });
    } catch (error) {
      if (isUniqueViolation(error, 'users_email_unique')) {
        throw new ConflictError('Este e-mail já está cadastrado.');
      }
      throw error;
    }
  }
}
