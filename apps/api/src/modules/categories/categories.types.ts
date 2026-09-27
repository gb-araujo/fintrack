import type { CategoryKind } from '@fintrack/shared';

export interface CategoryRecord {
  id: string;
  name: string;
  kind: CategoryKind;
  isDefault: boolean;
  archivedAt: Date | null;
  createdAt: Date;
}
