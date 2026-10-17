import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab13, skusIn } from './run.js';
import { convertAndFormat, lookupSku } from './tools.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab13]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

describe('lab-13 tools (unit)', () => {
  it('looks up mock inventory', () => {
    expect(lookupSku('MUG-0007')).toMatchObject({ found: true, inStock: false, quantity: 0 });
    expect(lookupSku('NOP-0000')).toEqual({ found: false, sku: 'NOP-0000' });
  });
  it.each([
    [1999, 'EUR', '€18.39'],
    [1250, 'GBP', '£9.88'],
    [1500, 'JPY', '¥2,268'],
    [1999, 'USD', '$19.99'],
  ] as const)('%i cents in %s → %s', (cents, cur, formatted) => {
    expect(convertAndFormat(cents, cur).formatted).toBe(formatted);
  });
  it('extracts SKUs', () => {
    expect(skusIn('tsh-0042 and MUG-0007, again TSH-0042')).toEqual(['TSH-0042', 'MUG-0007']);
  });
});

describe('lab-13 agent', () => {
  it('logs each tool call separately: 2 parallel lookups, then 2 formats, stable order', async () => {
    const r = runner.start('lab-13', { input: lab13.definition.exampleInput });
    await runner.waitFor(r.runId);
    const tools = runner.events(r.runId).filter((e) => e.type === 'tool-start' || e.type === 'tool-finish');
    expect(tools.map((e) => `${e.type}:${e.type === 'tool-start' || e.type === 'tool-finish' ? e.toolName : ''}`)).toEqual([
      'tool-start:inventoryLookup',
      'tool-start:inventoryLookup',
      'tool-finish:inventoryLookup',
      'tool-finish:inventoryLookup',
      'tool-start:formatCurrency',
      'tool-start:formatCurrency',
      'tool-finish:formatCurrency',
      'tool-finish:formatCurrency',
    ]);
    const ids = new Set(tools.map((e) => (e.type === 'tool-start' || e.type === 'tool-finish' ? e.toolCallId : '')));
    expect(ids.size).toBe(4);
  });
});
