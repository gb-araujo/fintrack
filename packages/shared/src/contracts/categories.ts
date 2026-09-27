import { z } from 'zod';
import { categoryKindSchema } from '../enums/index.js';

export const categoryNameSchema = z
  .string({ error: 'Informe o nome da categoria.' })
  .trim()
  .min(1, { error: 'Informe o nome da categoria.' })
  .max(50, { error: 'Nome muito longo (máximo 50 caracteres).' });

export const categorySchema = z.object({
  id: z.uuid(),
  name: z.string(),
  kind: categoryKindSchema,
  /** Categoria criada automaticamente no cadastro (pode ser renomeada ou arquivada). */
  isDefault: z.boolean(),
  archivedAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
});
export type Category = z.infer<typeof categorySchema>;

export const createCategoryRequestSchema = z.object({
  name: categoryNameSchema,
  kind: categoryKindSchema,
});
export type CreateCategoryRequest = z.infer<typeof createCategoryRequestSchema>;

/** O tipo (receita/despesa) não muda: lançamentos existentes dependem dele. */
export const updateCategoryRequestSchema = z.object({ name: categoryNameSchema });
export type UpdateCategoryRequest = z.infer<typeof updateCategoryRequestSchema>;

export const listCategoriesQuerySchema = z.object({
  kind: categoryKindSchema.optional(),
  includeArchived: z.stringbool().default(false),
});

export const categoryListResponseSchema = z.object({ items: z.array(categorySchema) });
export type CategoryListResponse = z.infer<typeof categoryListResponseSchema>;
