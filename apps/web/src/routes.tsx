import type { RouteObject } from 'react-router';
import { AppShell } from './components/layout/AppShell';
import { HomePage } from './pages/HomePage';
import { LabPage } from './pages/LabPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { ProjectsPage, ProjectPage } from './pages/ProjectsPage';
import { LoginPage } from './pages/LoginPage';

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
      { path: 'projects', element: <ProjectsPage /> },
      { path: 'projects/:projectId', element: <ProjectPage /> },
      { path: 'login', element: <LoginPage /> },
      { path: 'labs/:labId', element: <LabPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
