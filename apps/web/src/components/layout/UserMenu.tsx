import { useState } from 'react';
import { useAuth } from '../../features/auth/auth-context';

/** Nome do usuário e botão de sair (sidebar no desktop, cabeçalho no mobile). */
export function UserMenu({ compact = false }: { compact?: boolean }) {
  const { user, logout } = useAuth();
  const [leaving, setLeaving] = useState(false);

  async function handleLogout() {
    setLeaving(true);
    await logout();
  }

  return (
    <div
      className={compact ? 'flex items-center gap-3' : 'flex items-center justify-between gap-2'}
    >
      {!compact && user ? (
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
          <p className="truncate text-xs text-slate-500">{user.email}</p>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => void handleLogout()}
        disabled={leaving}
        className="shrink-0 rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        Sair
      </button>
    </div>
  );
}
