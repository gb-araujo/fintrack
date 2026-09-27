import {
  ACCOUNT_TYPES,
  CATEGORY_KINDS,
  PAYMENT_METHODS,
  TRANSACTION_STATUSES,
  TRANSACTION_TYPES,
  TRANSFER_DIRECTIONS,
} from '@fintrack/shared';
import { pgEnum } from 'drizzle-orm/pg-core';

// Os valores vêm de @fintrack/shared: API, Web e Android falam o mesmo vocabulário.
export const accountTypeEnum = pgEnum('account_type', ACCOUNT_TYPES);
export const categoryKindEnum = pgEnum('category_kind', CATEGORY_KINDS);
export const transactionTypeEnum = pgEnum('transaction_type', TRANSACTION_TYPES);
export const transactionStatusEnum = pgEnum('transaction_status', TRANSACTION_STATUSES);
export const transferDirectionEnum = pgEnum('transfer_direction', TRANSFER_DIRECTIONS);
export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);
