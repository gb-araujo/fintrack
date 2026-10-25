import { PASSWORD_MIN_LENGTH, registerRequestSchema, type RegisterRequest } from '@fintrack/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { TextField } from '../../components/form/TextField';
import { fieldErrorsFrom, formErrorMessage, type FieldErrors } from '../../lib/form-errors';
import { useAuth } from './auth-context';
import { AuthLayout } from './AuthLayout';

function deviceTimeZone(): string | undefined {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return undefined;
  }
}

export function RegisterPage() {
  const { register } = useAuth();
  const [values, setValues] = useState({ name: '', email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<RegisterRequest>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = registerRequestSchema.safeParse({ ...values, timezone: deviceTimeZone() });
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await register(parsed.data);
    } catch (error) {
      setFormError(formErrorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Criar conta"
      subtitle="Comece a controlar suas finanças."
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/login" className="font-medium text-brand-700 dark:text-brand-400 hover:underline">
            Entrar
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
        <TextField
          label="Nome"
          autoComplete="name"
          value={values.name}
          onChange={(event) => setValues({ ...values, name: event.target.value })}
          error={errors.name}
        />
        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          value={values.email}
          onChange={(event) => setValues({ ...values, email: event.target.value })}
          error={errors.email}
        />
        <TextField
          label="Senha"
          type="password"
          autoComplete="new-password"
          placeholder={`Mínimo de ${PASSWORD_MIN_LENGTH} caracteres`}
          value={values.password}
          onChange={(event) => setValues({ ...values, password: event.target.value })}
          error={errors.password}
        />
        {formError ? (
          <p role="alert" className="rounded-lg bg-rose-50 dark:bg-rose-950 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">
            {formError}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-lg bg-brand-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-900 dark:hover:bg-brand-600 disabled:opacity-60"
        >
          {submitting ? 'Criando conta…' : 'Criar conta'}
        </button>
      </form>
    </AuthLayout>
  );
}
