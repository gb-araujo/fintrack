import { categoryNameSchema, type Category, type CategoryKind } from '@fintrack/shared';
import { useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge, EmptyState, FormError, QueryError, Spinner } from '../../components/ui/Feedback';
import { CheckboxField, InputField } from '../../components/ui/Fields';
import { Modal } from '../../components/ui/Modal';
import { formErrorMessage } from '../../lib/form-errors';
import {
  useArchiveCategory,
  useCategories,
  useCreateCategory,
  useRenameCategory,
} from '../ledger/queries';

const KIND_TITLE: Record<CategoryKind, string> = { income: 'Receitas', expense: 'Despesas' };

export function CategoriesPage() {
  const [showArchived, setShowArchived] = useState(false);
  const categories = useCategories(showArchived);

  return (
    <>
      <PageHeader
        title="Categorias"
        description="Organize receitas e despesas. As categorias padrão podem ser renomeadas ou arquivadas."
      />
      <div className="mb-4">
        <CheckboxField
          label="Mostrar categorias arquivadas"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
      </div>

      {categories.isPending ? (
        <Spinner />
      ) : categories.isError ? (
        <QueryError error={categories.error} onRetry={() => void categories.refetch()} />
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {(['income', 'expense'] as const).map((kind) => (
            <CategorySection
              key={kind}
              kind={kind}
              items={categories.data.filter((category) => category.kind === kind)}
            />
          ))}
        </div>
      )}
    </>
  );
}

function CategorySection({ kind, items }: { kind: CategoryKind; items: Category[] }) {
  const [renaming, setRenaming] = useState<Category | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const archive = useArchiveCategory();

  async function toggleArchive(category: Category) {
    setActionError(null);
    try {
      await archive.mutateAsync({ id: category.id, archive: category.archivedAt === null });
    } catch (error) {
      setActionError(formErrorMessage(error));
    }
  }

  return (
    <section
      aria-labelledby={`cat-${kind}`}
      className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-sm"
    >
      <h2 id={`cat-${kind}`} className="mb-3 font-semibold text-slate-900 dark:text-slate-50">
        {KIND_TITLE[kind]}
      </h2>
      <NewCategoryForm kind={kind} />
      {actionError ? (
        <p role="alert" className="mt-2 text-sm text-rose-700 dark:text-rose-300">
          {actionError}
        </p>
      ) : null}

      {items.length === 0 ? (
        <div className="mt-3">
          <EmptyState title="Nenhuma categoria" />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800" aria-label={KIND_TITLE[kind]}>
          {items.map((category) => (
            <li key={category.id} className="flex items-center justify-between gap-2 py-2">
              <span
                className={`min-w-0 truncate text-sm ${category.archivedAt ? 'text-slate-400 dark:text-slate-500' : 'text-slate-800 dark:text-slate-100'}`}
              >
                {category.name}
                {category.archivedAt ? (
                  <span className="ml-2">
                    <Badge tone="amber">Arquivada</Badge>
                  </span>
                ) : null}
              </span>
              <span className="flex shrink-0 gap-1">
                {!category.archivedAt ? (
                  <Button variant="ghost" size="sm" onClick={() => setRenaming(category)}>
                    Renomear
                  </Button>
                ) : null}
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={archive.isPending}
                  onClick={() => void toggleArchive(category)}
                >
                  {category.archivedAt ? 'Reativar' : 'Arquivar'}
                </Button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {renaming ? <RenameModal category={renaming} onClose={() => setRenaming(null)} /> : null}
    </section>
  );
}

function NewCategoryForm({ kind }: { kind: CategoryKind }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | undefined>();
  const create = useCreateCategory();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = categoryNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }
    setError(undefined);
    try {
      await create.mutateAsync({ name: parsed.data, kind });
      setName('');
    } catch (mutationError) {
      setError(formErrorMessage(mutationError));
    }
  }

  return (
    <form
      noValidate
      onSubmit={(event) => void handleSubmit(event)}
      className="flex items-start gap-2"
    >
      <InputField
        className="flex-1"
        label={`Nova categoria de ${kind === 'income' ? 'receita' : 'despesa'}`}
        value={name}
        onChange={(event) => setName(event.target.value)}
        error={error}
        maxLength={50}
      />
      <Button type="submit" className="mt-6" disabled={create.isPending}>
        Adicionar
      </Button>
    </form>
  );
}

function RenameModal({ category, onClose }: { category: Category; onClose: () => void }) {
  const [name, setName] = useState(category.name);
  const [error, setError] = useState<string | null>(null);
  const rename = useRenameCategory();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const parsed = categoryNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Nome inválido.');
      return;
    }
    try {
      await rename.mutateAsync({ id: category.id, name: parsed.data });
      onClose();
    } catch (mutationError) {
      setError(formErrorMessage(mutationError));
    }
  }

  return (
    <Modal title="Renomear categoria" onClose={onClose}>
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <InputField
          label="Nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={50}
        />
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={rename.isPending}>
            Salvar
          </Button>
        </div>
      </form>
    </Modal>
  );
}
