import type { CategoryKind, CreateCategoryRequest } from '@fintrack/shared';
import { NotFoundError } from '../../shared/errors/index.js';
import type { CategoriesRepository } from './categories.repository.js';
import type { CategoryRecord } from './categories.types.js';

export class CategoriesService {
  constructor(private readonly categories: CategoriesRepository) {}

  list(userId: string, options: { kind?: CategoryKind | undefined; includeArchived: boolean }) {
    return this.categories.list(userId, options);
  }

  create(userId: string, input: CreateCategoryRequest): Promise<CategoryRecord> {
    return this.categories.create(userId, input);
  }

  async rename(userId: string, id: string, name: string): Promise<CategoryRecord> {
    return this.require(await this.categories.rename(userId, id, name));
  }

  /** Categorias nunca são apagadas: lançamentos antigos continuam apontando para elas. */
  async archive(userId: string, id: string): Promise<CategoryRecord> {
    const current = this.require(await this.categories.findById(userId, id));
    if (current.archivedAt) return current;
    return this.require(await this.categories.setArchived(userId, id, true));
  }

  async unarchive(userId: string, id: string): Promise<CategoryRecord> {
    const current = this.require(await this.categories.findById(userId, id));
    if (!current.archivedAt) return current;
    return this.require(await this.categories.setArchived(userId, id, false));
  }

  private require(category: CategoryRecord | undefined): CategoryRecord {
    if (!category) throw new NotFoundError('Categoria não encontrada.');
    return category;
  }
}
