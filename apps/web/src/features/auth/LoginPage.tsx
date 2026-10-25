import { loginRequestSchema, type LoginRequest } from '@fintrack/shared';
import { useState, type FormEvent } from 'react';
import { Link } from 'react-router';
import { TextField } from '../../components/form/TextField';
import { fieldErrorsFrom, formErrorMessage, type FieldErrors } from '../../lib/form-errors';
import { useAuth } from './auth-context';
import { AuthLayout } from './AuthLayout';

export function LoginPage() {
  const { login } = useAuth();
  const [values, setValues] = useState({ email: '', password: '' });
  const [errors, setErrors] = useState<FieldErrors<LoginRequest>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    const parsed = loginRequestSchema.safeParse(values);
    if (!parsed.success) {
      setErrors(fieldErrorsFrom(parsed.error));
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      await login(parsed.data);
      // O redirecionamento acontece no guard PublicOnly quando o status vira "authenticated".
    } catch (error) {
      setFormError(formErrorMessage(error));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title="Entrar"
      subtitle="Acesse sua conta para ver seu dinheiro disponível."
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/register" className="font-medium text-brand-700 dark:text-brand-400 hover:underline">
            Criar conta
          </Link>
        </>
      }
    >
      <form noValidate onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
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
          autoComplete="current-password"
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
          {submitting ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </AuthLayout>
  );
}
