/**
 * Access token da sessão atual — mantido SOMENTE em memória (nunca em localStorage/sessionStorage,
 * onde um XSS poderia lê-lo). Ao recarregar a página, a sessão é restaurada via /auth/refresh,
 * que usa o cookie httpOnly do refresh token.
 */
type Listener = () => void;

let accessToken: string | null = null;
const expiredListeners = new Set<Listener>();

export const session = {
  getAccessToken(): string | null {
    return accessToken;
  },

  setAccessToken(token: string | null): void {
    accessToken = token;
  },

  /** Notifica que a sessão expirou (refresh falhou) — o AuthProvider volta para o login. */
  expire(): void {
    accessToken = null;
    for (const listener of expiredListeners) listener();
  },

  onExpired(listener: Listener): () => void {
    expiredListeners.add(listener);
    return () => expiredListeners.delete(listener);
  },
};
