import type { RouteObject } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { HomePage } from './pages/HomePage';
import { LabPage } from './pages/LabPage';
import { NotFoundPage } from './pages/NotFoundPage';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <AppShell />,
    errorElement: (
      <AppShell>
        <NotFoundPage />
      </AppShell>
    ),
    children: [
      { index: true, element: <HomePage /> },
      { path: 'labs/:labId', element: <LabPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
