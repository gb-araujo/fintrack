import type { LoginRequest, RegisterRequest, User } from '@fintrack/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { session } from '../../lib/session';
import * as authService from '../../services/auth';
import { AuthContext, type AuthContextValue, type AuthStatus } from './auth-context';

interface AuthState {
  status: AuthStatus;
  user: User | null;
}

/**
 * Estado de sessão da web. Ao montar, tenta restaurar a sessão pelo cookie httpOnly
 * (/auth/refresh). O access token nunca sai da memória (lib/session.ts).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  const signedOut = useCallback(() => {
    queryClient.clear(); // nenhum dado financeiro de uma sessão sobrevive a ela
    setState({ status: 'unauthenticated', user: null });
  }, [queryClient]);

  useEffect(() => {
    let active = true;
    void authService.refreshSession().then((user) => {
      if (!active) return;
      setState(
        user ? { status: 'authenticated', user } : { status: 'unauthenticated', user: null },
      );
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => session.onExpired(signedOut), [signedOut]);

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      async login(input: LoginRequest) {
        const user = await authService.login(input);
        setState({ status: 'authenticated', user });
      },
      async register(input: RegisterRequest) {
        const user = await authService.register(input);
        setState({ status: 'authenticated', user });
      },
      async logout() {
        await authService.logout().catch(() => undefined);
        signedOut();
      },
    }),
    [state, signedOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
