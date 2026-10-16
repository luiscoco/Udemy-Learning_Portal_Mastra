import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { ProgressRecord } from '@mlp/contracts';
import { ProgressProvider } from './lib/progress-context';
import { MemoryProgressStore } from './lib/progress-store';
import { routes } from './routes';

export function renderApp(path: string, progress: Record<string, ProgressRecord> = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const store = new MemoryProgressStore(progress);
  const utils = render(
    <ProgressProvider store={store}>
      <RouterProvider router={router} />
    </ProgressProvider>,
  );
  return { ...utils, router, store };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}
