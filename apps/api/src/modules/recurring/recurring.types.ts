import type { ManualTransactionType, RecurrenceFrequency } from '@fintrack/shared';

export interface RecurringRecord {
  id: string;
  name: string;
  type: ManualTransactionType;
  amountCents: number | null;
  isVariableAmount: boolean;
  accountId: string;
  categoryId: string | null;
  frequency: RecurrenceFrequency;
  interval: number;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  autoConfirm: boolean;
  includeInForecast: boolean;
  active: boolean;
  createdAt: Date;
}

/** Regra + dados da conta necessários para decidir se a previsão conta no "disponível". */
export interface RecurringWithAccount extends RecurringRecord {
  accountLiquid: boolean;
  accountUsable: boolean;
}

export interface NewRecurring {
  name: string;
  type: ManualTransactionType;
  amountCents: number | null;
  isVariableAmount: boolean;
  accountId: string;
  categoryId: string | null;
  frequency: RecurrenceFrequency;
  interval: number;
  dayOfMonth: number | null;
  startDate: string;
  endDate: string | null;
  autoConfirm: boolean;
  includeInForecast: boolean;
}

export type RecurringPatch = Partial<Omit<NewRecurring, 'type' | 'frequency' | 'startDate'>>;

/** Ocorrência prevista (virtual): ainda não existe lançamento correspondente. */
export interface ForecastOccurrence {
  recurringId: string;
  name: string;
  type: ManualTransactionType;
  date: string;
  amountCents: number;
  estimated: boolean;
  accountId: string;
  categoryId: string | null;
  overdue: boolean;
  accountLiquid: boolean;
  accountUsable: boolean;
  includeInForecast: boolean;
}
