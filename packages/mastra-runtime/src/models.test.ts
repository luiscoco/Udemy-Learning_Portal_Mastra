import { describe, expect, it } from 'vitest';
import { checkModelId, DEFAULT_LIVE_MODELS, DEFAULT_MODEL_BY_PROVIDER, liveModelCatalog } from './models.js';

describe('checkModelId', () => {
  it.each([...DEFAULT_LIVE_MODELS, ...Object.values(DEFAULT_MODEL_BY_PROVIDER)])('%s exists in the installed Mastra registry', (id) => {
    const c = checkModelId(id);
    expect(c.ok, c.ok ? '' : c.reason).toBe(true);
  });

  it('reports the provider API key variable name', () => {
    expect(checkModelId('openai/gpt-5-mini')).toMatchObject({ ok: true, apiKeyEnvVar: 'OPENAI_API_KEY' });
  });

  it.each([
    ['gpt-5-mini', /provider\/model/],
    ['nope/gpt-5', /Unknown provider/],
    ['openai/gpt-99-ultra', /not a known/],
  ])('rejects %s with an actionable reason', (id, reason) => {
    const c = checkModelId(id);
    expect(c.ok).toBe(false);
    if (!c.ok) expect(c.reason).toMatch(reason);
  });
});

describe('liveModelCatalog', () => {
  it('marks models configured only when their key exists, without exposing values', () => {
    const { models } = liveModelCatalog({ OPENAI_API_KEY: 'sk-test-123456789' });
    const openai = models.find((m) => m.id === 'openai/gpt-5-mini');
    expect(openai?.configured).toBe(true);
    expect(models.find((m) => m.provider === 'anthropic')?.configured).toBe(false);
    expect(JSON.stringify(models)).not.toContain('sk-test');
  });

  it('honours LIVE_MODELS and rejects unknown ids', () => {
    const { models, rejected } = liveModelCatalog({ LIVE_MODELS: 'openai/gpt-4o-mini, openai/not-a-model' });
    expect(models.map((m) => m.id)).toEqual(['openai/gpt-4o-mini']);
    expect(rejected[0]?.id).toBe('openai/not-a-model');
  });
});
