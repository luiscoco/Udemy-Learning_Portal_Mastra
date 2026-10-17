import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab18, type Lab18Output } from './run.js';
import { buildView, escapeUntrusted, forbiddenFor, maskEmail, maskPhone, ORDERS } from './view.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab18]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function run(overrides: Record<string, unknown> = {}) {
  const r = runner.start('lab-18', { input: { ...lab18.definition.exampleInput, ...overrides } });
  await runner.waitFor(r.runId);
  return runner.events(r.runId).find((e) => e.type === 'result') as {
    output: Lab18Output;
    validation: { passed: boolean; checks: { id: string; passed: boolean }[] };
  };
}

const raw = ORDERS['ORD-3001'];

describe('lab-18 view (unit)', () => {
  it('redacts by role allowlist', () => {
    const customer = buildView(raw, 'customer', 'de-DE');
    expect(Object.keys(customer)).not.toEqual(expect.arrayContaining(['phone']));
    expect(customer).not.toHaveProperty('riskScore');
    expect(customer).not.toHaveProperty('internalNote');
    expect(customer.email).toBe('j•••@example.com');
    expect(buildView(raw, 'support', 'en-US').phone).toBe('••• 6789');
    expect(buildView(raw, 'admin', 'en-US')).toMatchObject({ phone: raw.phone, riskScore: '82%' });
  });

  it('formats for the locale with Intl', () => {
    const de = buildView(raw, 'customer', 'de-DE');
    expect(de.total).toBe(new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(89.5));
    expect(de.status).toBe('Versandt');
    expect(buildView(raw, 'customer', 'ja-JP').status).toBe('発送済み');
  });

  it('escapes untrusted stored text', () => {
    const note = buildView(raw, 'customer', 'en-US').deliveryNote;
    expect(note.untrusted).toBe(true);
    expect(note.text).toContain('&lt;script&gt;');
    expect(note.text).not.toContain('<script');
    expect(escapeUntrusted('a\u0000b\u0007c')).toBe('abc');
    expect(escapeUntrusted('x'.repeat(500))).toHaveLength(200);
  });

  it('masks helpers and lists forbidden values per role', () => {
    expect(maskEmail('aiko.t@example.jp')).toBe('a•••@example.jp');
    expect(maskPhone('+81 90 1234 5678')).toBe('••• 5678');
    expect(forbiddenFor(raw, 'admin')).toEqual([]);
    expect(forbiddenFor(raw, 'customer')).toContain(raw.email);
  });
});

describe('lab-18 sessions (DoD)', () => {
  it('produces locale-specific results without cross-session contamination', async () => {
    const { output, validation } = await run();
    expect(validation.passed).toBe(true);
    for (const s of output.sessions) expect(s.toolOutput).toEqual(buildView(raw, s.role, s.locale));
    // The raw-data cache really is shared (hits after the first session), yet each view is its own.
    expect(output.sessions.map((s) => s.cache)).toEqual(['miss', 'hit', 'hit']);
    const customer = output.sessions[1]!;
    for (const f of forbiddenFor(raw, 'customer')) expect(customer.answer).not.toContain(f);
  });

  it('the formatted-output cache contaminates later sessions', async () => {
    const { output, validation } = await run({ cacheStrategy: 'cache-formatted-output' });
    expect(validation.passed).toBe(false);
    expect(validation.checks.filter((c) => !c.passed).map((c) => c.id)).toEqual([
      'role-redaction',
      'locale-format',
      'no-cross-session',
      'safe-text',
    ]);
    expect(output.sessions[1]!.answer).toContain(raw.email); // the customer saw the admin's data
  });

  it('when the customer runs first, the bad cache under-serves the admin instead', async () => {
    const sessions = [
      { role: 'customer', locale: 'de-DE' },
      { role: 'admin', locale: 'en-US' },
    ];
    const { output, validation } = await run({ sessions, cacheStrategy: 'cache-formatted-output' });
    expect(validation.passed).toBe(false);
    expect(output.sessions[1]!.toolOutput).not.toHaveProperty('riskScore');
  });
});
