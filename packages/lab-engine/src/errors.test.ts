import { describe, expect, it } from 'vitest';
import { LabError, providerStatusOf, toCanonicalError } from './errors.js';

/** Shaped like the AI SDK APICallError: the provider's own message can echo request data. */
const apiError = (statusCode: number, message = 'invalid x-api-key sk-live-ECHOED-FRAGMENT') =>
  Object.assign(new Error(message), { name: 'AI_APICallError', statusCode });

describe('provider error mapping', () => {
  it('a rejected key becomes NOT_CONFIGURED with an actionable, provider-free message', () => {
    const c = toCanonicalError(apiError(401));
    expect(c).toMatchObject({ code: 'NOT_CONFIGURED', retryable: false });
    expect(c.message).toMatch(/Check the key in the server \.env/);
    expect(c.message).not.toContain('ECHOED');
    expect(toCanonicalError(apiError(403)).code).toBe('NOT_CONFIGURED');
  });

  it('rate limits and outages are retryable; other client errors are not', () => {
    expect(toCanonicalError(apiError(429))).toMatchObject({ code: 'TOO_MANY_REQUESTS', retryable: true });
    expect(toCanonicalError(apiError(503))).toMatchObject({ code: 'PROVIDER_ERROR', retryable: true });
    expect(toCanonicalError(apiError(408))).toMatchObject({ code: 'PROVIDER_ERROR', retryable: true });
    expect(toCanonicalError(apiError(400))).toMatchObject({ code: 'PROVIDER_ERROR', retryable: false });
  });

  it('finds the status inside retry wrappers and causes', () => {
    const wrapped = Object.assign(new Error('Failed after 3 attempts'), { lastError: apiError(503) });
    expect(providerStatusOf(wrapped)).toBe(503);
    expect(providerStatusOf(new Error('outer', { cause: { errors: [new Error('x'), apiError(429)] } }))).toBe(429);
  });

  it('keeps existing mappings and the INTERNAL fallback', () => {
    expect(toCanonicalError(new Error('boom'))).toMatchObject({ code: 'INTERNAL', message: 'Lab execution failed' });
    expect(toCanonicalError(Object.assign(new Error('x'), { statusCode: 200 })).code).toBe('INTERNAL');
    expect(toCanonicalError(new LabError('NOT_FOUND', 'Unknown lab')).code).toBe('NOT_FOUND');
  });
});
