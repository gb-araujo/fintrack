import { useId, type InputHTMLAttributes } from 'react';

interface TextFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string | undefined;
}

export function TextField({ label, error, className, ...props }: TextFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <div className={className}>
      <label htmlFor={id} className="block text-sm font-medium text-slate-700 dark:text-slate-200">
        {label}
      </label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={[
          'mt-1 block w-full rounded-lg border bg-white dark:bg-slate-900 px-3 py-2 text-sm shadow-sm outline-none transition',
          'focus:border-brand-600 focus:ring-2 focus:ring-brand-100 dark:focus:ring-brand-700',
          error ? 'border-rose-400 dark:border-rose-600' : 'border-slate-300 dark:border-slate-700',
        ].join(' ')}
        {...props}
      />
      {error ? (
        <p id={errorId} className="mt-1 text-xs text-rose-600 dark:text-rose-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}
