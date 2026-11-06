import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TutorEvent } from '@mlp/contracts';
import { lab01Definition } from '../../../../../packages/labs/src/lab-01/definition';
import { api, ApiClientError } from '../../api/client';
import { AiTutor } from './AiTutor';

vi.mock('../../lib/auth-context', () => ({
  useSession: () => ({ session: { principal: { sub: 'dev:learner' } }, invalidate: vi.fn() }),
}));
let deliver: (event: TutorEvent) => void;
let signal: AbortSignal | undefined;
let finish: (() => void) | undefined;
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.spyOn(api.tutor, 'settings').mockResolvedValue({
    liveEnabled: true,
    models: [{ id: 'openai/gpt-4o-mini', provider: 'openai', configured: true }],
    questionLimit: 2000,
    answerLimit: 16000,
    timeoutMs: 60000,
  });
  vi.spyOn(api.tutor, 'answer').mockImplementation(async (_subject, _body, onEvent, abort) => {
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
});
const renderTutor = () =>
  render(
    <MemoryRouter>
      <AiTutor definition={lab01Definition} />
    </MemoryRouter>,
  );
const token = (text: string): TutorEvent => ({ type: 'text', requestId: 'r', seq: 1, text });

describe('AI Tutor panel', () => {
  it('offers lesson-specific examples, defaults free, validates questions and formats replies', async () => {
    const user = userEvent.setup();
    renderTutor();
    await user.click(screen.getByRole('button', { name: 'AI Tutor' }));
    expect(screen.getByRole('dialog', { name: 'AI Tutor' })).toHaveTextContent(lab01Definition.title);
    expect(screen.getByLabelText('Tutor mode')).toHaveValue('offline');
    await user.click(screen.getByRole('button', { name: 'Explain the concept' }));
    expect(screen.getByLabelText('Your question')).toHaveValue(`Explain ${lab01Definition.title} in simple terms with a small TypeScript example.`);
    await user.clear(screen.getByLabelText('Your question'));
    await user.click(screen.getByRole('button', { name: 'Ask tutor' }));
    expect(screen.getByRole('alert')).toHaveTextContent('between 1 and 2,000');
    expect(api.tutor.answer).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText('Your question'), 'Explain agents');
    await user.click(screen.getByRole('button', { name: 'Ask tutor' }));
    act(() => deliver(token('## Agent example\n\n**Ready**\n\n```ts\nconst agent = true;\n```')));
    expect(screen.getByRole('heading', { name: 'Agent example' })).toBeVisible();
    expect(screen.getByLabelText('ts code').querySelector('.token.keyword')).toHaveTextContent('const');
    act(() => {
      deliver({ type: 'complete', seq: 2, requestId: 'r', text: '## Agent example\n\n**Complete**' });
      finish?.();
    });
    await waitFor(() => expect(screen.getByTestId('tutor-status')).toHaveTextContent('Complete'));
    await user.click(screen.getByRole('button', { name: 'Clear answer' }));
    expect(screen.getByTestId('tutor-answer')).toHaveTextContent('Your answer will appear here');
  });
  it('stops immediately, ignores late events, retries explicitly, and aborts/returns focus on close', async () => {
    const user = userEvent.setup();
    const { unmount } = renderTutor();
    const launcher = screen.getByRole('button', { name: 'AI Tutor' });
    await user.click(launcher);
    await user.click(screen.getByRole('button', { name: 'Ask tutor' }));
    act(() => deliver(token('Partial')));
    await user.click(screen.getByRole('button', { name: 'Stop receiving' }));
    expect(signal?.aborted).toBe(true);
    act(() => deliver(token('Must never replace the partial answer')));
    expect(screen.getByTestId('tutor-answer')).toHaveTextContent('Partial');
    expect(screen.getByTestId('tutor-answer')).not.toHaveTextContent('Must never');
    await user.click(screen.getByRole('button', { name: 'Retry question' }));
    expect(api.tutor.answer).toHaveBeenCalledTimes(2);
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(signal?.aborted).toBe(true);
    expect(launcher).toHaveFocus();
    await user.click(launcher);
    await user.click(screen.getByRole('button', { name: 'Ask tutor' }));
    unmount();
    expect(signal?.aborted).toBe(true);
  });
  it('shows live cost and model selection, and distinguishes interrupted transport from success', async () => {
    const user = userEvent.setup();
    renderTutor();
    vi.mocked(api.tutor.answer).mockRejectedValue(new ApiClientError('NETWORK', 'Connection interrupted', 0));
    await user.click(screen.getByRole('button', { name: 'AI Tutor' }));
    await waitFor(() => expect(screen.getByRole('option', { name: 'Live · uses provider API tokens' })).toBeEnabled());
    await user.selectOptions(screen.getByLabelText('Tutor mode'), 'live');
    expect(screen.getByText(/may incur charges/)).toHaveTextContent('openai');
    await user.click(screen.getByRole('button', { name: 'Ask live tutor' }));
    await waitFor(() => expect(screen.getByTestId('tutor-status')).toHaveTextContent('Connection interrupted'));
    expect(api.tutor.answer).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Retry question' })).toBeEnabled();
  });
});
