import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import './index.css';
import { ProgressProvider } from './lib/progress-context';
import { LocalStorageProgressStore } from './lib/progress-store';
import { routes } from './routes';

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root element');

const router = createBrowserRouter(routes);
const progressStore = new LocalStorageProgressStore();

createRoot(root).render(
  <StrictMode>
    <ProgressProvider store={progressStore}>
      <RouterProvider router={router} />
    </ProgressProvider>
  </StrictMode>,
);
