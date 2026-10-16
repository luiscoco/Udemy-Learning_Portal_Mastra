import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyProgress } from '@mlp/contracts';
import { catalog } from '@mlp/lab-catalog';
import { searchLabs } from './components/layout/SearchBox';
import { jsonResponse, renderApp } from './test-utils';

const AVAILABLE = catalog.labs.filter((l) => l.status === 'available').length;
const summary = (done: number) => `${done} of ${AVAILABLE} available ${AVAILABLE === 1 ? 'lab' : 'labs'} completed`;

const HEALTH = {
  status: 'ok',
  service: 'api',
  version: '0.1.0',
  uptimeSeconds: 1,
  mode: 'offline',
  mastraVersion: '1.78.0',
  timestamp: new Date().toISOString(),
};

let labDefinition: unknown;

beforeEach(async () => {
  localStorage.clear();
  // Real Dummy Lab 00 definition (parsed through the API contract) for LabPage tests.
  const { lab00Definition } = await import('../../../packages/labs/src/lab-00/definition');
  labDefinition = {
    ...lab00Definition,
    tags: lab00Definition.tags,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (url === '/api/health') return jsonResponse(HEALTH);
      if (url === '/api/labs/lab-00') return jsonResponse(labDefinition);
      return jsonResponse({ error: { code: 'NOT_FOUND', message: 'nope' } }, 404);
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('home and sidebar', () => {
  it('renders the orientation module and 15 course modules from the catalog', async () => {
    renderApp('/');
    const nav = screen.getAllByRole('navigation', { name: 'Course' })[0]!;
    const moduleButtons = nav.querySelectorAll('button[aria-expanded]');
    expect(moduleButtons).toHaveLength(16);
    expect(await screen.findByTestId('api-status')).toHaveTextContent('ok');
  });

  it('shows truthful zero progress for a fresh learner', () => {
    renderApp('/');
    for (const el of screen.getAllByTestId('progress-summary')) expect(el).toHaveTextContent(summary(0));
    expect(screen.getAllByText(`${AVAILABLE} of 76 labs released`).length).toBeGreaterThan(0);
  });

  it('counts completion only from stored records', () => {
    const rec = {
      ...emptyProgress('lab-00'),
      status: 'completed' as const,
      lessonRead: true,
      runSucceeded: true,
      checksPassed: true,
      quiz: { score: 4, total: 4, passed: true, attempts: 1, answers: {} },
    };
    renderApp('/', { 'lab-00': rec });
    expect(screen.getAllByTestId('progress-summary')[0]).toHaveTextContent(summary(1));
  });

  it('toggles a module with aria-expanded', async () => {
    const user = userEvent.setup();
    renderApp('/');
    const nav = screen.getAllByRole('navigation', { name: 'Course' })[0]!;
    const btn = within(nav).getByRole('button', { name: /Tools and Function Calling/ });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await user.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(within(nav).getByRole('link', { name: /lab-11: First custom tool \(Locked\)/ })).toBeVisible();
  });

  it('marks locked labs as locked and never as completed', () => {
    renderApp('/');
    const nav = screen.getAllByRole('navigation', { name: 'Course' })[0]!;
    const locked = catalog.labs.find((l) => l.status === 'locked' && l.moduleId === 'module-01');
    if (locked) expect(within(nav).getByRole('link', { name: `${locked.id}: ${locked.title} (Locked)` })).toBeInTheDocument();
    expect(within(nav).queryByRole('link', { name: /\(Completed\)/ })).toBeNull();
  });
});

describe('routing', () => {
  it('redirects legacy ?lesson=lab-00 to /labs/lab-00', async () => {
    const { router } = renderApp('/?lesson=lab-00');
    await waitFor(() => expect(router.state.location.pathname).toBe('/labs/lab-00'));
    expect(await screen.findByRole('heading', { level: 1, name: /Dummy Lab 00/ })).toBeInTheDocument();
  });

  it('shows a skeleton while the lesson loads, then the overview', async () => {
    renderApp('/labs/lab-00');
    expect(screen.getByTestId('lab-skeleton')).toHaveAttribute('aria-busy', 'true');
    expect(await screen.findByRole('heading', { name: 'Learning objectives' })).toBeInTheDocument();
  });

  it('marks the active lab with aria-current and expands its module', async () => {
    renderApp('/labs/lab-00');
    const nav = screen.getAllByRole('navigation', { name: 'Course' })[0]!;
    expect(within(nav).getByRole('link', { name: /lab-00: Dummy Lab 00/ })).toHaveAttribute('aria-current', 'page');
  });

  it('shows a locked preview without run controls', () => {
    renderApp('/labs/lab-05');
    expect(screen.getByRole('heading', { level: 1, name: /Inspect agent in Studio/ })).toBeInTheDocument();
    expect(screen.getByText('This lab is not available yet')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /run/i })).toBeNull();
    expect(within(screen.getByRole('main')).getByRole('link', { name: /lab-04: Model and instructions/ })).toBeInTheDocument();
  });

  it('shows 404 for unknown labs and routes', () => {
    renderApp('/labs/lab-98');
    expect(screen.getByRole('heading', { level: 1, name: /couldn’t find that lab/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to Home' })).toHaveAttribute('href', '/');
  });

  it('shows 404 for unknown paths', () => {
    renderApp('/nope/at/all');
    expect(screen.getByRole('heading', { level: 1, name: /couldn’t find that page/ })).toBeInTheDocument();
  });

  it('shows an error with retry when the lesson fails to load', async () => {
    const user = userEvent.setup();
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url === '/api/labs/lab-00') {
          calls++;
          return calls === 1
            ? jsonResponse({ error: { code: 'INTERNAL', message: 'Internal server error' } }, 500)
            : jsonResponse(labDefinition);
        }
        return jsonResponse(HEALTH);
      }),
    );
    renderApp('/labs/lab-00');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Internal server error');
    await user.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByRole('heading', { name: 'Learning objectives' })).toBeInTheDocument();
  });
});

describe('search', () => {
  it('matches by title, id and module title', () => {
    expect(searchLabs('dummy').map((l) => l.id)).toEqual(['lab-00']);
    expect(searchLabs('lab-14').map((l) => l.id)).toEqual(['lab-14']);
    expect(searchLabs('streaming')[0]?.id).toBe('lab-08');
    expect(searchLabs('conversational memory').map((l) => l.id)).toEqual(['lab-21', 'lab-22', 'lab-23', 'lab-24', 'lab-25']);
  });

  it('navigates with "/" then typing then Enter', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/');
    await user.keyboard('/');
    const box = screen.getByRole('combobox', { name: 'Search labs' });
    expect(box).toHaveFocus();
    await user.type(box, 'dummy');
    expect(screen.getByRole('option', { name: /Dummy Lab 00/ })).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{Enter}');
    await waitFor(() => expect(router.state.location.pathname).toBe('/labs/lab-00'));
  });
});

describe('theme', () => {
  it('toggles and persists the theme', async () => {
    const user = userEvent.setup();
    document.documentElement.dataset.theme = 'light';
    renderApp('/');
    await user.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(localStorage.getItem('mlp.theme')).toBe('dark');
    await user.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
