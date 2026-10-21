import { render } from '@testing-library/react';
import { createMemoryRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import type { ProgressRecord } from '@mlp/contracts';
import { ProgressProvider } from './lib/progress-context';
import { MemoryProgressStore } from './lib/progress-store';
import { routes } from './routes';
import { AuthProvider } from './lib/auth-context';

export function renderApp(path: string, progress: Record<string, ProgressRecord> = {}) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const store = new MemoryProgressStore(progress);
  const utils = render(
    <ProgressProvider store={store}>
      <AuthProvider>
        <RouterProvider router={router} />
      </AuthProvider>
    </ProgressProvider>,
  );
  return { ...utils, router, store };
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

export const signedInSession = {
  authenticated: true,
  principal: { sub: 'dev:learner', name: 'learner', provider: 'dev' },
  provider: 'dev',
  login: { kind: 'dev', passwordRequired: false },
  expiresAt: new Date(Date.now() + 8 * 3_600_000).toISOString(),
};
