import type { TransactionStatus } from '@fintrack/shared';

export interface TransferValues {
  fromAccountId: string;
  toAccountId: string;
  amountCents: number;
  transferDate: string;
  description: string;
  status: TransactionStatus;
}

export interface TransferRecord extends TransferValues {
  id: string;
  createdAt: Date;
  updatedAt: Date;
}
