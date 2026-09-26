import type { IconName } from '../icons';

export interface NavItem {
  label: string;
  to: string;
  icon: IconName;
  /** Aparece na bottom navigation do mobile (máx. 4 + "Mais"). */
  primary: boolean;
  /** Fase do roadmap em que a tela passa a ter funcionalidade. */
  phase: number;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Início', to: '/', icon: 'home', primary: true, phase: 3 },
  { label: 'Transações', to: '/transactions', icon: 'list', primary: true, phase: 2 },
  { label: 'Contas', to: '/accounts', icon: 'bank', primary: true, phase: 2 },
  { label: 'Cartões', to: '/credit-cards', icon: 'card', primary: true, phase: 5 },
  { label: 'Orçamentos', to: '/budgets', icon: 'target', primary: false, phase: 4 },
  { label: 'Recorrências', to: '/recurring', icon: 'repeat', primary: false, phase: 4 },
  { label: 'Categorias', to: '/categories', icon: 'tag', primary: false, phase: 2 },
  { label: 'Relatórios', to: '/reports', icon: 'chart', primary: false, phase: 7 },
  { label: 'Investimentos', to: '/investments', icon: 'trending', primary: false, phase: 8 },
  { label: 'Importar', to: '/imports', icon: 'upload', primary: false, phase: 6 },
];

export const MORE_NAV_ITEM = { label: 'Mais', to: '/more', icon: 'more' } as const;
