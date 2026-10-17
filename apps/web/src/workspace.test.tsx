import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ExecutionEventPayload } from '@mlp/contracts';
import { lab00Definition } from '../../../packages/labs/src/lab-00/definition';
import { jsonResponse, renderApp } from './test-utils';

const DEF = lab00Definition;

function sseBody(payloads: ExecutionEventPayload[], { hang = false } = {}): ReadableStream<Uint8Array> {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(ctrl) {
      payloads.forEach((p, seq) => {
        const e = { ...p, runId: 'run-1', correlationId: 'corr-1', seq, timestamp: new Date().toISOString() };
        ctrl.enqueue(enc.encode(`id: ${seq}\nevent: ${p.type}\ndata: ${JSON.stringify(e)}\n\n`));
      });
      if (!hang) ctrl.close();
    },
  });
}

const HAPPY: ExecutionEventPayload[] = [
  { type: 'log', level: 'info', message: 'start' },
  { type: 'workflow-step', stepId: 'analyze', status: 'running' },
  { type: 'tool-start', toolCallId: 'call-1', toolName: 'wordCounter', args: { text: 'Hello Mastra learners' } },
  { type: 'tool-finish', toolCallId: 'call-1', toolName: 'wordCounter', status: 'success', result: { words: 3 }, durationMs: 1 },
  { type: 'workflow-step', stepId: 'analyze', status: 'success' },
  { type: 'token', text: 'Echo:' },
  { type: 'token', text: ' Hello' },
  {
    type: 'result',
    output: { echo: 'Echo: Hello Mastra learners' },
    validation: { passed: true, checks: [{ id: 'echo-matches', label: 'Echo equals', passed: true }] },
  },
  { type: 'complete', status: 'succeeded', durationMs: 12 },
];

let runResponder: (init?: RequestInit) => Response;
let eventsBody: () => ReadableStream<Uint8Array>;
let sourceOk = true;
const calls: { url: string; init?: RequestInit }[] = [];

beforeEach(() => {
  localStorage.clear();
  calls.length = 0;
  sourceOk = true;
  runResponder = () => jsonResponse({ runId: 'run-1', correlationId: 'corr-1', requestId: 'req-1' }, 202);
  eventsBody = () => sseBody(HAPPY);
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      if (url === '/api/labs/lab-00') return jsonResponse(DEF);
      if (url === '/api/health') return jsonResponse({ status: 'ok' });
      if (url === '/api/labs/lab-00/preflight')
        return jsonResponse({
          labId: 'lab-00',
          ready: true,
          checks: [{ id: 'mastra-installed', label: 'Mastra runtime is installed', passed: true }],
        });
      if (url === '/api/labs/lab-00/source')
        return sourceOk
          ? jsonResponse({
              labId: 'lab-00',
              pinned: { '@mastra/core': '1.78.0' },
              files: [
                { path: 'run.ts', title: 'Lab implementation', language: 'typescript', code: 'export const lab00 = 1;' },
                { path: 'solution.md', title: 'Exercise solution', language: 'markdown', code: 'SECRET SOLUTION TEXT' },
              ],
            })
          : jsonResponse({ error: { code: 'INTERNAL', message: 'Source unavailable' } }, 500);
      if (url === '/api/labs/lab-00/runs') return runResponder(init);
      if (url === '/api/runs/run-1/events')
        return new Response(eventsBody(), { headers: { 'content-type': 'text/event-stream' } });
      if (url === '/api/runs/run-1/cancel')
        return jsonResponse({
          runId: 'run-1',
          labId: 'lab-00',
          correlationId: 'corr-1',
          status: 'running',
          mode: 'offline',
          startedAt: new Date().toISOString(),
          deadlineMs: 1000,
          eventCount: 1,
        });
      return jsonResponse({ error: { code: 'NOT_FOUND', message: url } }, 404);
    }),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe('tabs', () => {
  it('renders Learn/Run/Source with ARIA and arrow-key navigation', async () => {
    const user = userEvent.setup();
    const { router } = renderApp('/labs/lab-00');
    const learn = await screen.findByRole('tab', { name: 'Learn' });
    expect(learn).toHaveAttribute('aria-selected', 'true');
    learn.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Run' })).toHaveAttribute('aria-selected', 'true');
    expect(router.state.location.search).toBe('?tab=run');
    await user.keyboard('{End}');
    expect(screen.getByRole('tab', { name: 'Source' })).toHaveFocus();
  });

  it('deep-links to a tab with ?tab=source', async () => {
    renderApp('/labs/lab-00?tab=source');
    expect(await screen.findByRole('tab', { name: 'Source' })).toHaveAttribute('aria-selected', 'true');
  });
});

describe('Learn tab', () => {
  it('reveals hints progressively and marks the lesson read', async () => {
    const user = userEvent.setup();
    const { store } = renderApp('/labs/lab-00');
    await screen.findByRole('heading', { name: 'Concept' });
    expect(screen.queryByText(/Hint 2/)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Show hint 1 of 3' }));
    await user.click(screen.getByRole('button', { name: 'Show hint 2 of 3' }));
    expect(screen.getByText(DEF.guide.hints[1]!.text)).toBeInTheDocument();
    expect(screen.queryByText(DEF.guide.hints[2]!.text)).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mark lesson as read' }));
    expect(screen.getByText('✓ Lesson marked as read')).toBeInTheDocument();
    expect(store.get('lab-00')!.lessonRead).toBe(true);
  });
});

describe('Run tab', () => {
  it('runs, streams tokens, shows trace and checks, and records progress', async () => {
    const user = userEvent.setup();
    const { store } = renderApp('/labs/lab-00?tab=run');
    await screen.findByText('Mastra runtime is installed');
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByTestId('token-output')).toHaveTextContent('Echo: Hello');
    await waitFor(() => expect(screen.getByTestId('run-status')).toHaveTextContent('Run succeeded — all checks passed'));
    expect(within(screen.getByTestId('checks')).getByText('Echo equals')).toBeInTheDocument();
    expect(screen.getAllByText('wordCounter').length).toBeGreaterThan(0);
    expect(screen.getByTestId('timeline')).toHaveTextContent('complete — succeeded');
    const body = JSON.parse(String(calls.find((c) => c.url === '/api/labs/lab-00/runs')?.init?.body));
    expect(body).toEqual({ input: { message: 'Hello Mastra learners', delayMs: 150, simulateFailure: false }, mode: 'offline' });
    const rec = store.get('lab-00')!;
    expect(rec).toMatchObject({ runSucceeded: true, checksPassed: true });
  });

  it('validates client-side before calling the API', async () => {
    const user = userEvent.setup();
    renderApp('/labs/lab-00?tab=run');
    const msg = await screen.findByLabelText(/Message/);
    await user.clear(msg);
    await user.click(screen.getByRole('button', { name: 'Run' }));
    expect(await screen.findByText('This field is required.')).toBeInTheDocument();
    expect(msg).toHaveAttribute('aria-invalid', 'true');
    expect(calls.some((c) => c.url === '/api/labs/lab-00/runs')).toBe(false);
  });

  it('shows server field errors next to fields', async () => {
    const user = userEvent.setup();
    runResponder = () =>
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Input does not match the lab schema',
            details: [{ path: 'input.delayMs', message: 'Too big' }],
          },
        },
        422,
      );
    renderApp('/labs/lab-00?tab=run');
    await user.click(await screen.findByRole('button', { name: 'Run' }));
    expect(await screen.findByText('Too big')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('VALIDATION_FAILED');
  });

  it('shows retryable API errors such as 429', async () => {
    const user = userEvent.setup();
    runResponder = () =>
      jsonResponse({ error: { code: 'TOO_MANY_REQUESTS', message: 'Too many active runs', retryable: true } }, 429);
    renderApp('/labs/lab-00?tab=run');
    await user.click(await screen.findByRole('button', { name: 'Run' }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('TOO_MANY_REQUESTS');
    expect(alert).toHaveTextContent('retryable');
  });

  it('cancels a running run', async () => {
    const user = userEvent.setup();
    eventsBody = () => sseBody([{ type: 'log', level: 'info', message: 'start' }], { hang: true });
    renderApp('/labs/lab-00?tab=run');
    await user.click(await screen.findByRole('button', { name: 'Run' }));
    const cancel = screen.getByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(cancel).toBeEnabled());
    await user.click(cancel);
    await waitFor(() => expect(calls.some((c) => c.url === '/api/runs/run-1/cancel')).toBe(true));
  });

  it('shows the cost notice when live mode is chosen', async () => {
    renderApp('/labs/lab-00?tab=run');
    expect(await screen.findByTestId('cost-notice')).toHaveTextContent('Free: runs entirely offline');
    expect(screen.getByRole('radio', { name: /Live/ })).toBeDisabled();
  });
});

describe('Source tab', () => {
  it('shows highlighted source, pinned versions and hides the solution until confirmed', async () => {
    const user = userEvent.setup();
    renderApp('/labs/lab-00?tab=source');
    expect(await screen.findByLabelText('Source of run.ts')).toHaveTextContent('export const lab00 = 1;');
    expect(screen.getByText('@mastra/core 1.78.0')).toBeInTheDocument();
    expect(screen.queryByText('SECRET SOLUTION TEXT')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Reveal solution' }));
    expect(screen.queryByText('SECRET SOLUTION TEXT')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Yes, reveal' }));
    expect(screen.getByLabelText('Exercise solution')).toHaveTextContent('SECRET SOLUTION TEXT');
  });

  it('shows an alert with retry when source fails', async () => {
    sourceOk = false;
    renderApp('/labs/lab-00?tab=source');
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Source unavailable');
    sourceOk = true;
    await userEvent.click(within(alert).getByRole('button', { name: 'Retry' }));
    expect(await screen.findByLabelText('Source of run.ts')).toBeInTheDocument();
  });
});

describe('quiz, notes and instructor', () => {
  it('scores the quiz, shows explanations and persists the attempt', async () => {
    const user = userEvent.setup();
    const { store } = renderApp('/labs/lab-00');
    await screen.findByRole('heading', { name: 'Quiz' });
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(screen.getByText('Answer every question before submitting.')).toBeInTheDocument();
    for (const [i, q] of DEF.quiz.entries()) {
      const group = screen.getByRole('group', { name: new RegExp(`^${i + 1}\\.`) });
      const pick = i === 0 ? (q.correctIndex + 1) % q.choices.length : q.correctIndex; // first one wrong
      await user.click(within(group).getByRole('radio', { name: q.choices[pick] }));
    }
    await user.click(screen.getByRole('button', { name: 'Submit answers' }));
    expect(screen.getByTestId('quiz-score')).toHaveTextContent('Score 3/4 — passed');
    expect(screen.getByText(DEF.quiz[0]!.explanation)).toBeInTheDocument();
    const rec = store.get('lab-00')!;
    expect(rec.quiz).toMatchObject({ score: 3, total: 4, passed: true, attempts: 1 });
  });

  it('autosaves notes', async () => {
    const user = userEvent.setup();
    const { store } = renderApp('/labs/lab-00');
    await user.type(await screen.findByLabelText('Notes for lab-00'), 'remember cancel');
    await waitFor(() => expect(screen.getByTestId('notes-status')).toHaveTextContent('Saved'), { timeout: 2000 });
    expect(store.get('lab-00')!.notes).toBe('remember cancel');
  });

  it('exports the instructor script as JSON', async () => {
    const user = userEvent.setup();
    const created: Blob[] = [];
    vi.stubGlobal(
      'URL',
      Object.assign(URL, { createObjectURL: (b: Blob) => (created.push(b), 'blob:x'), revokeObjectURL: () => {} }),
    );
    const clicks: string[] = [];
    const orig = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function () {
      clicks.push(this.download);
    };
    renderApp('/labs/lab-00');
    await user.click(await screen.findByText(/Instructor script · 5 min video/));
    await user.click(screen.getByRole('button', { name: 'Export JSON' }));
    HTMLAnchorElement.prototype.click = orig;
    expect(clicks).toEqual(['lab-00-instructor.json']);
    const json = JSON.parse(await created[0]!.text());
    expect(json).toMatchObject({ format: 'mlp-instructor-script/v1', labId: 'lab-00', outline: { durationMinutes: 5 } });
  });
});
