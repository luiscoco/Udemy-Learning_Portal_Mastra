import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lab03Definition } from '../../../../../packages/labs/src/lab-03/definition';
import { PosterViewer, posterPng } from './PosterViewer';
import { posterLines } from './LessonPoster';
import * as downloads from '../../lib/download';

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function () {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function () {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});
afterEach(() => vi.restoreAllMocks());
const props = {
  definition: lab03Definition,
  kind: 'infographic' as const,
  excerpt: { path: 'run.ts', line: 40, language: 'typescript', code: 'const count: number = 3;\nconsole.log(count);' },
  selected: 0,
  transcript: '# Teaching text',
  active: true,
};

describe('visual infographic viewer', () => {
  it('renders escaped, coloured code, bounded excerpts and a self-contained SVG', () => {
    const { container } = render(<PosterViewer {...props} />);
    const svg = container.querySelector('svg')!;
    expect(svg).toHaveAttribute('viewBox', '0 0 1920 1080');
    expect(svg.querySelector('image, foreignObject, script')).toBeNull();
    expect(svg).toHaveTextContent('const count: number = 3;');
    expect(new Set([...svg.querySelectorAll('tspan[fill]')].map((t) => t.getAttribute('fill'))).size).toBeGreaterThan(2);
    expect(posterLines('Long text that needs more than one line', 12, 2)).toHaveLength(2);
    expect(posterLines('Long text that needs more than one line', 12, 2)[1]).toContain('…');
  });
  it('bounds zoom, fits, opens/closes fullscreen and restores focus', async () => {
    const user = userEvent.setup();
    render(<PosterViewer {...props} />);
    await user.click(screen.getByRole('button', { name: '100%' }));
    expect(screen.getByLabelText('Zoom level')).toHaveTextContent('100%');
    for (let i = 0; i < 6; i++) await user.click(screen.getByRole('button', { name: 'Zoom in' }));
    expect(screen.getByLabelText('Zoom level')).toHaveTextContent('200%');
    expect(screen.getByRole('button', { name: 'Zoom in' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Fit' }));
    const full = screen.getByRole('button', { name: 'Fullscreen' });
    await user.click(full);
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent(screen.getByRole('dialog'), new Event('cancel', { cancelable: true }));
    expect(full).toHaveFocus();
  });
  it('downloads vector/text content and reports export failures accessibly', async () => {
    const user = userEvent.setup();
    const save = vi.spyOn(downloads, 'downloadText').mockImplementation(() => undefined);
    render(<PosterViewer {...props} />);
    await user.click(screen.getByRole('button', { name: 'Download SVG' }));
    expect(save).toHaveBeenCalledWith(
      'lab-03-infographic.svg',
      expect.stringContaining('xmlns="http://www.w3.org/2000/svg"'),
      'image/svg+xml',
    );
    await user.click(screen.getByRole('button', { name: 'Download text' }));
    expect(save).toHaveBeenCalledWith('lab-03-infographic.md', '# Teaching text', 'text/markdown');
    save.mockImplementationOnce(() => {
      throw new Error('blocked');
    });
    await user.click(screen.getByRole('button', { name: 'Download SVG' }));
    expect(screen.getByRole('status', { name: 'Image export status' })).toHaveTextContent('SVG export is unavailable');
  });
  it('releases image resources when PNG decoding fails', async () => {
    const url = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:poster');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    class FailedImage {
      onerror?: () => void;
      set src(_value: string) {
        queueMicrotask(() => this.onerror?.());
      }
    }
    vi.stubGlobal('Image', FailedImage);
    const { container } = render(<PosterViewer {...props} />);
    try {
      await expect(posterPng(container.querySelector('svg')!)).rejects.toThrow('Cannot render');
    } finally {
      vi.unstubAllGlobals();
    }
    expect(url).toHaveBeenCalledOnce();
    expect(revoke).toHaveBeenCalledWith('blob:poster');
  });
});
