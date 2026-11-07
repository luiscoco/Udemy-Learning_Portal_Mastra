import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { TutorEvent } from '@mlp/contracts';
import { lab06Definition } from '../../../../../packages/labs/src/lab-06/definition';
import { api } from '../../api/client';
import { ProjectAnswer } from './ProjectAnswer';
const auth = vi.hoisted(() => ({
  status: 'ready',
  session: { authenticated: true, principal: { sub: 'dev:learner' } },
  invalidate: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('../../lib/auth-context', () => ({ useSession: () => auth }));
let deliver: (event: TutorEvent) => void, signal: AbortSignal | undefined, finish: (() => void) | undefined;
beforeEach(() => {
  auth.session.authenticated = true;
  vi.spyOn(api.tutor, 'settings').mockResolvedValue({
    liveEnabled: true,
    models: [{ id: 'openai/gpt-4o-mini', provider: 'openai', configured: true }],
    questionLimit: 2000,
    answerLimit: 16000,
    timeoutMs: 60000,
  });
  vi.spyOn(api.tutor, 'answer').mockImplementation(async (_subject, _request, onEvent, abort) => {
    deliver = onEvent;
    signal = abort;
    await new Promise<void>((resolve) => {
      finish = resolve;
    });
  });
});
afterEach(() => {
  finish?.();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
it('keeps shortcuts editable and records only completed offline guidance with authored code', async () => {
  const user = userEvent.setup(),
    complete = vi.fn();
  render(
    <ProjectAnswer
      definition={lab06Definition}
      topic="Agents"
      initialQuestion="Explain agents"
      shortcuts={['Explain failures']}
      onComplete={complete}
    />,
  );
  await user.click(screen.getByRole('button', { name: /Step by step/ }));
  expect(screen.getByLabelText('Your project question')).toHaveValue('Explain failures');
  expect(api.tutor.answer).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Ask project coach' }));
  act(() => deliver({ type: 'text', seq: 1, requestId: 'a', text: 'Partial' }));
  expect(complete).not.toHaveBeenCalled();
  act(() => deliver({ type: 'complete', seq: 2, requestId: 'a', text: '## Agent teaching\n\nUse clear instructions.' }));
  await act(async () => {
    finish?.();
  });
  expect(complete.mock.calls[0]?.[0]).toMatchObject({ mode: 'offline', modelId: null, labId: 'lab-06' });
  expect(complete.mock.calls[0]?.[0].text).toContain('import { Agent }');
  await user.selectOptions(screen.getByLabelText('Answer mode'), 'live');
  expect(screen.getByTestId('project-answer-status')).toHaveTextContent('Offline authored guidance');
});
it('requires fresh live consent and never automatically retries a failed paid request', async () => {
  const user = userEvent.setup();
  render(<ProjectAnswer definition={lab06Definition} topic="Agents" initialQuestion="Explain agents" />);
  await waitFor(() => expect(screen.getByRole('option', { name: 'Live - provider charges' })).toBeEnabled());
  await user.selectOptions(screen.getByLabelText('Answer mode'), 'live');
  expect(screen.getByRole('button', { name: 'Ask project coach' })).toBeDisabled();
  await user.click(screen.getByLabelText('Authorize this paid answer'));
  await user.click(screen.getByRole('button', { name: 'Ask project coach' }));
  expect(screen.getByLabelText('Authorize this paid answer')).not.toBeChecked();
  act(() =>
    deliver({ type: 'error', seq: 1, requestId: 'a', code: 'PROVIDER_ERROR', message: 'Provider refused', retryable: true }),
  );
  await act(async () => {
    finish?.();
  });
  expect(screen.getByTestId('project-answer-status')).toHaveTextContent('Failed - incomplete');
  expect(api.tutor.answer).toHaveBeenCalledTimes(1);
  expect(screen.getByRole('button', { name: 'Ask project coach' })).toBeDisabled();
});
it('aborts stopped and unmounted answers and ignores late completion', async () => {
  const user = userEvent.setup(),
    complete = vi.fn();
  const view = render(
    <ProjectAnswer definition={lab06Definition} topic="Agents" initialQuestion="Explain agents" onComplete={complete} />,
  );
  await user.click(screen.getByRole('button', { name: 'Ask project coach' }));
  await user.click(screen.getByRole('button', { name: 'Stop answer' }));
  expect(signal?.aborted).toBe(true);
  act(() => deliver({ type: 'complete', seq: 1, requestId: 'late', text: 'Late response' }));
  expect(complete).not.toHaveBeenCalled();
  expect(screen.getByTestId('project-answer-status')).toHaveTextContent('Stopped - incomplete');
  await user.click(screen.getByRole('button', { name: 'Ask project coach' }));
  view.unmount();
  expect(signal?.aborted).toBe(true);
});
it('offers session retry without submitting when the learner is unauthenticated', () => {
  auth.session.authenticated = false;
  render(<ProjectAnswer definition={lab06Definition} topic="Agents" initialQuestion="Explain agents" />);
  expect(screen.getByRole('button', { name: 'Ask project coach' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Retry learner session' }));
  expect(auth.refresh).toHaveBeenCalled();
  expect(api.tutor.answer).not.toHaveBeenCalled();
});
