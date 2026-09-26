import type { RouteObject } from 'react-router';
import { AppLayout } from '../components/layout/AppLayout';
import { NAV_ITEMS } from '../components/layout/navigation';
import { DashboardPage } from '../pages/DashboardPage';
import { MorePage } from '../pages/MorePage';
import { NotFoundPage } from '../pages/NotFoundPage';
import { PlaceholderPage } from '../pages/PlaceholderPage';

const placeholderRoutes: RouteObject[] = NAV_ITEMS.filter((item) => item.to !== '/').map(
  (item) => ({
    path: item.to.slice(1),
    element: <PlaceholderPage title={item.label} phase={item.phase} />,
  }),
);

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      ...placeholderRoutes,
      { path: 'more', element: <MorePage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
