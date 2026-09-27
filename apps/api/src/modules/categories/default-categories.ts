import type { CategoryKind } from '@fintrack/shared';

export interface DefaultCategory {
  name: string;
  kind: CategoryKind;
}

/**
 * Categorias criadas para cada usuário no cadastro. Ficam no banco do usuário (não são globais)
 * para que ele possa renomear e arquivar. A migration 0002 usa esta MESMA lista para usuários
 * anteriores à FASE 2 (há teste garantindo que as duas listas não divergem).
 */
export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: 'Salário', kind: 'income' },
  { name: 'VR', kind: 'income' },
  { name: 'VT', kind: 'income' },
  { name: 'Outros', kind: 'income' },
  { name: 'Moradia', kind: 'expense' },
  { name: 'Energia', kind: 'expense' },
  { name: 'Água', kind: 'expense' },
  { name: 'Internet', kind: 'expense' },
  { name: 'Celular', kind: 'expense' },
  { name: 'Alimentação', kind: 'expense' },
  { name: 'Transporte', kind: 'expense' },
  { name: 'Saúde', kind: 'expense' },
  { name: 'Lazer', kind: 'expense' },
  { name: 'Assinaturas', kind: 'expense' },
  { name: 'Compras', kind: 'expense' },
  { name: 'Educação', kind: 'expense' },
  { name: 'Outros', kind: 'expense' },
];
