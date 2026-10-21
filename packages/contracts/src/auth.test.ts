import { describe, expect, it } from 'vitest';
import { ApiErrorSchema } from './api-error.js';
import { LoginRequestSchema, SessionResponseSchema } from './auth.js';

describe('auth contracts', () => {
  it('normalizes names and bounds credentials without returning them in the session view', () => {
    expect(LoginRequestSchema.parse({ username: ' Alice ' })).toEqual({ username: 'alice' });
    expect(LoginRequestSchema.safeParse({ username: 'a/b' }).success).toBe(false);
    expect(LoginRequestSchema.safeParse({ username: 'a', password: 'x'.repeat(201) }).success).toBe(false);
    const session = SessionResponseSchema.parse({
      authenticated: false,
      principal: null,
      provider: 'dev',
      login: { kind: 'dev', passwordRequired: true },
      expiresAt: null,
      cookieValue: 'never-return',
    });
    expect(session).not.toHaveProperty('cookieValue');
    expect(ApiErrorSchema.parse({ error: { code: 'UNAUTHORIZED', message: 'Sign in' } }).error.code).toBe('UNAUTHORIZED');
  });
});
