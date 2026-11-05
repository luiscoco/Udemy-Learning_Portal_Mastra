import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import './index.css';
import { ProgressProvider } from './lib/progress-context';
import { SyncedProgressStore } from './lib/synced-progress-store';
import { api } from './api/client';
import { routes } from './routes';
import { AuthProvider } from './lib/auth-context';
import { ProgressScopeSync } from './lib/progress-scope';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const router = createBrowserRouter(routes);
const progressStore = new SyncedProgressStore(api.progress);

createRoot(root).render(
  <StrictMode>
    <ProgressProvider store={progressStore}>
      <AuthProvider>
        <ProgressScopeSync />
        <RouterProvider router={router} />
      </AuthProvider>
    </ProgressProvider>
  </StrictMode>,
);
