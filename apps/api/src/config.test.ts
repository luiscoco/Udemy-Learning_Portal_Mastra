import { describe, expect, it } from 'vitest';
import { ConfigError, describeConfig, parseConfig } from './config.js';

describe('parseConfig', () => {
  it('validates positive bounded run request limits and exposes only their public settings', () => {
    const defaults = parseConfig({});
    expect(describeConfig(defaults)).toMatchObject({
      RUN_RATE_WINDOW_MS: 60000,
      RUN_START_RATE_USER_MAX: 30,
      RUN_START_RATE_IP_MAX: 120,
      RUN_CONTROL_RATE_USER_MAX: 60,
      RUN_CONTROL_RATE_IP_MAX: 240,
    });
    for (const key of [
      'RUN_START_RATE_USER_MAX',
      'RUN_START_RATE_IP_MAX',
      'RUN_CONTROL_RATE_USER_MAX',
      'RUN_CONTROL_RATE_IP_MAX',
    ]) {
      for (const value of ['0', '-1', '1.5', '100001', 'invalid']) expect(() => parseConfig({ [key]: value })).toThrow(key);
      expect(parseConfig({ [key]: '100000' })[key as keyof typeof defaults]).toBe(100000);
    }
    for (const value of ['0', '999', '3600001', 'Infinity'])
      expect(() => parseConfig({ RUN_RATE_WINDOW_MS: value })).toThrow('RUN_RATE_WINDOW_MS');
  });
  it('requires and masks a separate key for persistent run history', () => {
    expect(parseConfig({}).RUN_STORE).toBe('memory');
    expect(() => parseConfig({ RUN_STORE: 'sqlite' })).toThrow('RUN_STORE_SECRET');
    const config = parseConfig({ RUN_STORE: 'sqlite', RUN_STORE_SECRET: 'test-run-store-key-at-least-32-characters' });
    expect(describeConfig(config).RUN_STORE).toBe('sqlite');
    expect(JSON.stringify(describeConfig(config))).not.toContain(config.RUN_STORE_SECRET);
  });
  it('applies safe defaults', () => {
    const c = parseConfig({});
    expect(c).toMatchObject({ PORT: 8787, HOST: '127.0.0.1', MASTRA_MODE: 'offline' });
    expect(c.OPENAI_API_KEY).toBeUndefined();
    expect(c.AUTH_SESSION_STORE).toBe('memory');
  });

  it('requires a stable secret for durable sessions and rejects unknown backends', () => {
    expect(() => parseConfig({ AUTH_SESSION_STORE: 'sqlite' })).toThrow('AUTH_SESSION_SECRET');
    expect(() => parseConfig({ AUTH_SESSION_STORE: 'unknown' })).toThrow('AUTH_SESSION_STORE');
    const config = parseConfig({
      AUTH_SESSION_STORE: 'sqlite',
      AUTH_SESSION_SECRET: 'test-stable-session-key-with-32-characters',
    });
    expect(describeConfig(config).AUTH_SESSION_STORE).toBe('sqlite');
    expect(JSON.stringify(describeConfig(config))).not.toContain(config.AUTH_SESSION_SECRET);
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
