import { sql } from 'drizzle-orm';
import { transactions } from './schema/index.js';

/**
 * Efeito, em centavos com sinal, de um lançamento no saldo da conta — em SQL.
 * ESPELHA `balanceEffect` (modules/accounts/domain/balance.ts); qualquer mudança deve ser feita
 * nos dois lugares (há teste de propriedade comparando ambos).
 *
 * Mapeado com `Number`: soma de bigint no PostgreSQL volta como texto (numeric).
 */
export const completedEffectSql = sql<number>`coalesce(sum(
  case when ${transactions.status} = 'completed' then
    case
      when ${transactions.type} = 'income' then ${transactions.amountCents}
      when ${transactions.type} = 'transfer' and ${transactions.transferDirection} = 'in' then ${transactions.amountCents}
      else -${transactions.amountCents}
    end
  else 0 end
), 0)`.mapWith(Number);
