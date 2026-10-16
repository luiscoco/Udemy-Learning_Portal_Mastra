import { describe, expect, it } from 'vitest';
import { isSecretKey, maskSecret, redactSecrets } from './secrets.js';
import { HealthResponseSchema } from './health.js';

describe('maskSecret', () => {
  it('reports unset values', () => {
    expect(maskSecret(undefined)).toBe('not set');
    expect(maskSecret('')).toBe('not set');
  });
  it('fully hides short values', () => {
    expect(maskSecret('abc123')).toBe('••••');
  });
  it('keeps prefix and last four characters only', () => {
    const masked = maskSecret('sk-proj-1234567890abcd');
    expect(masked).toBe('sk-…abcd');
    expect(masked).not.toContain('567890');
  });
});

describe('isSecretKey', () => {
  it.each(['OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'SESSION_SECRET', 'GITHUB_TOKEN'])('%s is secret', (k) => {
    expect(isSecretKey(k)).toBe(true);
  });
  it.each(['PORT', 'LOG_LEVEL', 'MASTRA_MODE'])('%s is not secret', (k) => {
    expect(isSecretKey(k)).toBe(false);
  });
});

describe('redactSecrets', () => {
  it('removes secret values from text', () => {
    const secret = 'sk-live-ABCDEFGHIJKLMNOP';
    const out = redactSecrets(`request failed with key ${secret}`, [secret]);
    expect(out).not.toContain(secret);
    expect(out).toContain('sk-…MNOP');
  });
});

describe('HealthResponseSchema', () => {
  it('rejects non-ok status', () => {
    const r = HealthResponseSchema.safeParse({
      status: 'down',
      service: 'x',
      version: '1',
      uptimeSeconds: 1,
      mode: 'offline',
      mastraVersion: '1',
      timestamp: new Date().toISOString(),
    });
    expect(r.success).toBe(false);
  });
});
