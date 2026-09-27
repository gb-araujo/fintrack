import type {
  ColumnMapping,
  DuplicateKind,
  ImportRowType,
  ImportStatus,
  SuggestionSource,
} from '@fintrack/shared';

export interface ImportRecord {
  id: string;
  accountId: string;
  source: 'csv' | 'ofx' | 'pdf';
  filename: string;
  status: ImportStatus;
  rowsCount: number;
  importedCount: number;
  skippedCount: number;
  createdAt: Date;
  confirmedAt: Date | null;
}

export interface DetectedInfo {
  delimiter: ';' | ',' | '\t' | '|';
  headers: string[];
  mapping: ColumnMapping;
}

export interface ImportDetailRecord extends ImportRecord {
  detected: DetectedInfo;
  ignoredRows: { line: number; reason: string }[];
  ignoredRowsCount: number;
}

export interface ImportedRowRecord {
  id: string;
  importId: string;
  rowNumber: number;
  date: string;
  amountCents: number;
  direction: 'in' | 'out';
  description: string;
  normalizedDescription: string;
  suggestedType: ImportRowType;
  suggestedCategoryId: string | null;
  suggestedTargetAccountId: string | null;
  suggestedInvoiceId: string | null;
  suggestionSource: SuggestionSource;
  duplicateKind: DuplicateKind | null;
  duplicateOfTransactionId: string | null;
  defaultAction: 'import' | 'skip';
  status: 'pending' | 'imported' | 'skipped';
  createdTransactionId: string | null;
  createdTransferId: string | null;
}

export interface NewImportedRow {
  rowNumber: number;
  raw: Record<string, string>;
  date: string;
  amountCents: number;
  direction: 'in' | 'out';
  description: string;
  normalizedDescription: string;
  fingerprint: string;
  externalId: string | null;
  suggestedType: ImportRowType;
  suggestedCategoryId: string | null;
  suggestedTargetAccountId: string | null;
  suggestedInvoiceId: string | null;
  suggestionSource: SuggestionSource;
  duplicateKind: DuplicateKind | null;
  duplicateOfTransactionId: string | null;
  defaultAction: 'import' | 'skip';
}

export interface NewImport {
  accountId: string;
  source: 'csv' | 'ofx' | 'pdf';
  filename: string;
  detected: DetectedInfo;
  ignoredRows: { line: number; reason: string }[];
  ignoredRowsCount: number;
  rows: NewImportedRow[];
}

/** Lançamento já existente na conta (para achar possíveis duplicatas). */
export interface ExistingTransactionRow {
  id: string;
  date: string;
  signedCents: number;
  description: string;
}

export interface MerchantRuleRecord {
  id: string;
  pattern: string;
  matchType: 'contains' | 'starts_with';
  suggestedType: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  targetAccountId: string | null;
  priority: number;
  createdAt: Date;
}

export interface NewMerchantRule {
  pattern: string;
  matchType: 'contains' | 'starts_with';
  suggestedType: 'income' | 'expense' | 'transfer';
  categoryId: string | null;
  targetAccountId: string | null;
  priority: number;
}
