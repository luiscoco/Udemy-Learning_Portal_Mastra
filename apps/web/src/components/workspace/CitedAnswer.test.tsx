import { beforeAll, describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { CitedAnswer as Data } from '@mlp/contracts';
import { CitedAnswer, citedAnswerOf } from './CitedAnswer';

// jsdom has <dialog> but not showModal/close: minimal polyfill with the native close event.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute('open', '');
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute('open');
    this.dispatchEvent(new Event('close'));
  };
});

const text = 'Customers can request a refund within 30 days of delivery. <img src=x onerror=alert(1)>';
const data: Data = {
  claims: [{ text: 'You can request a refund within 30 days.', citations: [{ n: 1, sourceId: 'refunds', quote: 'request a refund within 30 days', quoteStart: 14, quoteEnd: 45 }] }],
  sources: { refunds: { title: 'support-handbook.md', location: 'support-handbook.md#refunds', text } },
  blocked: [{ text: 'Students get 20% off.', reasons: ['UNKNOWN_SOURCE: kb-9 was not among the provided sources'] }],
  fallback: false,
};

describe('CitedAnswer', () => {
  it('only accepts outputs that match the contract', () => {
    expect(citedAnswerOf({ citedAnswer: data })).toEqual(data);
    expect(citedAnswerOf({ citedAnswer: { claims: 'nope' } })).toBeNull();
    expect(citedAnswerOf({ other: 1 })).toBeNull();
  });

  it('opens the cited passage with the quote highlighted, as text, and returns focus on close', async () => {
    const user = userEvent.setup();
    render(<CitedAnswer data={data} idPrefix="t" />);
    expect(screen.getByRole('list', { name: 'Blocked claims' })).toHaveTextContent('UNKNOWN_SOURCE');
    const cite = screen.getByRole('button', { name: 'Open source 1: support-handbook.md' });
    await user.click(cite);
    const dialog = screen.getByRole('dialog', { name: 'Source 1: support-handbook.md' });
    expect(dialog.querySelector('mark')).toHaveTextContent('request a refund within 30 days');
    expect(dialog.querySelector('img')).toBeNull(); // source text is never rendered as HTML
    await user.click(screen.getByRole('button', { name: 'Close' }));
    expect(cite).toHaveFocus();
  });
});
