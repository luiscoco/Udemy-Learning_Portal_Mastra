import { describe, expect, it } from 'vitest';
import { completeAnswer } from './run-state';

describe('completeAnswer (Live output for labs that do not stream)', () => {
  it('uses a top-level text or answer string', () => {
    expect(completeAnswer({ text: 'Hello', other: 1 })).toBe('Hello');
    expect(completeAnswer({ answer: 'Use the refund form.' })).toBe('Use the refund form.');
  });
  it('ignores empty, missing or non-string values', () => {
    expect(completeAnswer({ text: '   ' })).toBeNull();
    expect(completeAnswer({ answer: 42 })).toBeNull();
    expect(completeAnswer(undefined)).toBeNull();
    expect(completeAnswer('plain string')).toBeNull();
  });
});
