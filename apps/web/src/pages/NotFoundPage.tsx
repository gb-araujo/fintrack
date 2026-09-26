import { Link } from 'react-router';

export function NotFoundPage() {
  return (
    <div className="py-16 text-center">
      <h1 className="text-2xl font-semibold">Página não encontrada</h1>
      <Link to="/" className="mt-4 inline-block text-sm font-medium text-brand-700 hover:underline">
        Voltar ao início
      </Link>
    </div>
  );
}
