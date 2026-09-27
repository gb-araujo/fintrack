import { DEFAULT_TIMEZONE, todayInTimeZone } from '@fintrack/shared';
import { useAuth } from '../auth/auth-context';

/**
 * "Hoje" no fuso do usuário — apenas para valores padrão e dicas na tela. A decisão de o que é
 * passado ou futuro (e portanto pendente ou efetivado) é SEMPRE do backend.
 */
export function useToday(): string {
  const { user } = useAuth();
  return todayInTimeZone(user?.timezone ?? DEFAULT_TIMEZONE);
}
