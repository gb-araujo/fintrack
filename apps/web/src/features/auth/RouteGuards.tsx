import { Navigate, Outlet, useLocation } from 'react-router';
import { useAuth } from './auth-context';

function FullScreenLoading() {
  return (
    <div className="grid min-h-dvh place-items-center" role="status" aria-live="polite">
      <span className="text-sm text-slate-500">Carregando…</span>
    </div>
  );
}

export interface RedirectState {
  from?: string;
}

/** Só aceita caminhos internos ("/x"), nunca URLs externas ("//site", "https://…"). */
function safeRedirectTarget(state: unknown): string {
  const from = (state as RedirectState | null)?.from;
  if (!from || !from.startsWith('/') || from.startsWith('//') || from.startsWith('/login')) {
    return '/';
  }
  return from;
}

/** Rotas que exigem login: sem sessão, redireciona para /login lembrando o destino. */
export function RequireAuth() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullScreenLoading />;
  if (status === 'unauthenticated') {
    const state: RedirectState = { from: `${location.pathname}${location.search}` };
    return <Navigate to="/login" replace state={state} />;
  }
  return <Outlet />;
}

/** Login/cadastro: quem já está autenticado volta para o destino original (ou o início). */
export function PublicOnly() {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullScreenLoading />;
  if (status === 'authenticated') {
    return <Navigate to={safeRedirectTarget(location.state)} replace />;
  }
  return <Outlet />;
}
