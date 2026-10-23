import type { ReactNode } from 'react';
import { formErrorMessage } from '../../lib/form-errors';
import { Button } from './Button';
import { Modal } from './Modal';

export function Spinner({ label = 'Carregando…' }: { label?: string }) {
  return (
    <p role="status" className="py-10 text-center text-sm text-slate-500 dark:text-slate-400">
      {label}
    </p>
  );
}

export function QueryError({ error, onRetry }: { error: unknown; onRetry: () => void }) {
  return (
    <div
      role="alert"
      className="rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950 p-4 text-sm text-rose-800 dark:text-rose-300"
    >
      <p>{formErrorMessage(error)}</p>
      <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>
        Tentar novamente
      </Button>
    </div>
  );
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-8 text-center">
      <p className="font-medium text-slate-700 dark:text-slate-200">{title}</p>
      {children ? <div className="mt-2 text-sm text-slate-500 dark:text-slate-400">{children}</div> : null}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-950 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
      {message}
    </p>
  );
}

const badgeTones = {
  slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200',
  amber: 'bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-300',
  emerald: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-300',
  rose: 'bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-rose-300',
  sky: 'bg-sky-100 dark:bg-sky-900 text-sky-800 dark:text-sky-300',
} as const;

export function Badge({
  tone = 'slate',
  children,
}: {
  tone?: keyof typeof badgeTones;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeTones[tone]}`}
    >
      {children}
    </span>
  );
}

/** Confirmação para ações que mudam o histórico (ex.: cancelar um lançamento). */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel: string;
  pending: boolean;
  error: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p className="text-sm text-slate-600 dark:text-slate-300">{message}</p>
      <div className="mt-4 space-y-3">
        <FormError message={error} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>
            Voltar
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? 'Aguarde…' : confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
