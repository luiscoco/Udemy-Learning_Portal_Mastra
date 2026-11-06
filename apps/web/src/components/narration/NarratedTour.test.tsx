import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lab03Definition as d } from '../../../../../packages/labs/src/lab-03/definition';
import { NarratedTour, revealNarratedTarget } from './NarratedTour';
import { verifiedClip } from '../../features/narration/media';
vi.mock('../../features/narration/media', () => ({ verifiedClip: vi.fn() }));
const verify = vi.mocked(verifiedClip);
const play = vi.fn(function (this: HTMLMediaElement) {
  this.dispatchEvent(new Event('play'));
  return Promise.resolve();
});
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute('open');
  };
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(play);
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    this.dispatchEvent(new Event('pause'));
  });
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => undefined);
  vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1);
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:tour');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  verify.mockImplementation(async (model, index) => ({
    blob: new Blob(['audio']),
    clip: {
      id: model.steps[index]!.id,
      textSha256: 'a'.repeat(64),
      sha256: 'b'.repeat(64),
      audio: '/audio/tours/' + 'b'.repeat(64) + '.mp3',
      bytes: 5,
      duration: 10,
      words: [
        { text: 'First', start: 0, end: 1 },
        { text: 'Second', start: 1, end: 2 },
      ],
    },
  }));
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});
async function open() {
  await userEvent.click(screen.getByRole('button', { name: 'Start Guided Narrated Learning Tour' }));
  return screen.getByRole('dialog');
}
describe('prerecorded narrated learning tour', () => {
  it('advances the timed infographic region only after the selected audio ends', async () => {
    render(<NarratedTour definition={d} kind="infographic" />);
    await open();
    await userEvent.click(screen.getByLabelText('Continue after audio'));
    await userEvent.click(screen.getByRole('button', { name: 'Play narration' }));
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    fireEvent.ended(screen.getByLabelText('Guided tour recorded narration'));
    await waitFor(() => expect(screen.getByLabelText('Tour section')).toHaveValue('1'));
    expect(screen.getByRole('img').querySelector('[data-tour-focus]')).toHaveAttribute('y', '432');
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(2));
  });
  it('plays only explicitly, synchronizes red word focus, pauses and restores launcher focus on Escape', async () => {
    render(<NarratedTour definition={d} kind="exercise" />);
    const launch = screen.getByRole('button', { name: 'Start Guided Narrated Learning Tour' });
    await open();
    expect(play).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Play narration' }));
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    const player = screen.getByLabelText('Guided tour recorded narration') as HTMLAudioElement;
    player.currentTime = 1.2;
    fireEvent.timeUpdate(player);
    expect(screen.getByText('Second')).toHaveAttribute('data-current-word', 'true');
    await userEvent.click(screen.getByRole('button', { name: 'Pause narration' }));
    expect(screen.getByRole('status')).toHaveTextContent('Paused');
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(launch).toHaveFocus();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:tour');
  });
  it('keeps exercise progression manual, supports speed and replay, and cancels obsolete loads', async () => {
    render(<NarratedTour definition={d} kind="exercise" />);
    await open();
    expect(screen.queryByLabelText('Continue after audio')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Play narration' }));
    await waitFor(() => expect(play).toHaveBeenCalledOnce());
    const player = screen.getByLabelText('Guided tour recorded narration') as HTMLAudioElement;
    fireEvent.change(screen.getByLabelText('Tour playback speed'), { target: { value: '1.5' } });
    expect(player.playbackRate).toBe(1.5);
    fireEvent.ended(player);
    expect(screen.getByLabelText('Tour section')).toHaveValue('0');
    await userEvent.click(screen.getByRole('button', { name: 'Replay narration' }));
    expect(play).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole('button', { name: 'Next section' }));
    await waitFor(() => expect(verify).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Tour section')).toHaveValue('1');
  });
  it('shows the actual safe source with highlighted ranges and never selects a solution', async () => {
    const file = {
      path: 'run.ts',
      title: 'Implementation',
      language: 'typescript' as const,
      code: 'const InputSchema = z.object({});\nasync function run() {\n const a = new Agent({});\n return a;\n}\n',
    };
    render(
      <NarratedTour
        definition={d}
        kind="source"
        files={[{ ...file, path: d.exercise.solutionFile!, code: 'hidden solution' }, file]}
      />,
    );
    await open();
    expect(screen.getByLabelText('Narrated TypeScript source')).toHaveTextContent('new Agent');
    expect(screen.queryByText('hidden solution')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Narrated TypeScript source').querySelector('[data-tour-highlight="true"]')).not.toBeNull();
    expect(screen.getByLabelText('Follow narration')).toBeChecked();
  });
  it('keeps captions usable after media failure and ignores a response after close', async () => {
    verify.mockRejectedValueOnce(new Error('Missing recording'));
    const view = render(<NarratedTour definition={d} kind="infographic" />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Play narration' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('could not play'));
    expect(screen.getByText('Complete section transcript')).toBeVisible();
    expect(screen.getByRole('img').querySelector('[data-tour-focus]')).not.toBeNull();
    view.unmount();
    let release: (value: Awaited<ReturnType<typeof verifiedClip>>) => void = () => undefined;
    verify.mockImplementationOnce(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    render(<NarratedTour definition={d} kind="exercise" />);
    await open();
    await userEvent.click(screen.getByRole('button', { name: 'Play narration' }));
    const signal = verify.mock.calls.at(-1)![2];
    await userEvent.click(screen.getByRole('button', { name: 'Close tour' }));
    expect(signal.aborted).toBe(true);
    release({
      blob: new Blob(),
      clip: {
        id: 'phase-0',
        textSha256: 'a'.repeat(64),
        sha256: 'b'.repeat(64),
        audio: '/audio/tours/x.mp3',
        bytes: 1,
        duration: 1,
        words: [],
      },
    });
    await Promise.resolve();
    expect(play).not.toHaveBeenCalled();
  });
  it('follows offscreen vertical targets without taking keyboard focus', () => {
    const reader = document.createElement('div');
    const target = document.createElement('p');
    reader.append(target);
    vi.spyOn(reader, 'getBoundingClientRect').mockReturnValue({ top: 100, bottom: 300, left: 0, right: 500 } as DOMRect);
    vi.spyOn(target, 'getBoundingClientRect').mockReturnValue({ top: 700, bottom: 750, left: 0, right: 300 } as DOMRect);
    revealNarratedTarget(reader, target);
    expect(reader.scrollTop).toBe(582);
    expect(document.activeElement).not.toBe(target);
  });
});
