import { describe, expect, it } from 'vitest';
import { ConfigError, describeConfig, parseConfig } from './config.js';

describe('parseConfig', () => {
  it('applies safe defaults', () => {
    const c = parseConfig({});
    expect(c).toMatchObject({ PORT: 8787, HOST: '127.0.0.1', MASTRA_MODE: 'offline' });
    expect(c.OPENAI_API_KEY).toBeUndefined();
  });

  it('rejects a non-numeric PORT and names the key', () => {
    try {
      parseConfig({ PORT: 'abc' });
      expect.unreachable();
    } catch (err) {
      expect(err).toBeInstanceOf(ConfigError);
      expect((err as ConfigError).keys).toEqual(['PORT']);
      expect((err as Error).message).toContain('PORT');
    }
  });

  it('never includes secret values in error messages', () => {
    const secret = 'sk-test-SECRETVALUE123456';
    try {
      parseConfig({ OPENAI_API_KEY: secret, MASTRA_MODE: 'turbo' });
      expect.unreachable();
    } catch (err) {
      expect((err as Error).message).not.toContain(secret);
    }
  });

  it('masks secrets in describeConfig', () => {
    const secret = 'sk-test-SECRETVALUE123456';
    const view = describeConfig(parseConfig({ OPENAI_API_KEY: secret }));
    expect(JSON.stringify(view)).not.toContain(secret);
    expect(view.OPENAI_API_KEY).toBe('sk-…3456');
    expect(view.ANTHROPIC_API_KEY).toBe('not set');
  });
});
