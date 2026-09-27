import type { RouteObject } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';
import { NAV_ITEMS } from '../components/layout/navigation';
import { AccountsPage } from '../features/accounts/AccountsPage';
import { LoginPage } from '../features/auth/LoginPage';
import { RegisterPage } from '../features/auth/RegisterPage';
import { PublicOnly, RequireAuth } from '../features/auth/RouteGuards';
import { BudgetsPage } from '../features/budgets/BudgetsPage';
import { CreditCardDetailPage } from '../features/credit-cards/CreditCardDetailPage';
import { CreditCardsPage } from '../features/credit-cards/CreditCardsPage';
import { CategoriesPage } from '../features/categories/CategoriesPage';
import { RecurringPage } from '../features/recurring/RecurringPage';
import { TransactionsPage } from '../features/transactions/TransactionsPage';
import { DashboardPage } from '../pages/DashboardPage';
import { MorePage } from '../pages/MorePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';

/** Telas já implementadas; as demais mostram "em construção" até a fase correspondente. */
const IMPLEMENTED = new Set([
  '/',
  '/transactions',
  '/accounts',
  '/categories',
  '/budgets',
  '/recurring',
  '/credit-cards',
]);

const placeholderRoutes: RouteObject[] = NAV_ITEMS.filter((item) => !IMPLEMENTED.has(item.to)).map(
  (item) => ({
    path: item.to.slice(1),
    element: <PlaceholderPage title={item.label} phase={item.phase} />,
  }),
);

export const routes: RouteObject[] = [
  {
    element: <PublicOnly />,
    children: [
      { path: '/login', element: <LoginPage /> },
      { path: '/register', element: <RegisterPage /> },
    ],
  },
  {
    element: <RequireAuth />,
    children: [
      {
        path: '/',
        element: <AppLayout />,
        children: [
          { index: true, element: <DashboardPage /> },
          { path: 'transactions', element: <TransactionsPage /> },
          { path: 'accounts', element: <AccountsPage /> },
          { path: 'categories', element: <CategoriesPage /> },
          { path: 'budgets', element: <BudgetsPage /> },
          { path: 'recurring', element: <RecurringPage /> },
          { path: 'credit-cards', element: <CreditCardsPage /> },
          { path: 'credit-cards/:cardId', element: <CreditCardDetailPage /> },
          ...placeholderRoutes,
          { path: 'more', element: <MorePage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
];
