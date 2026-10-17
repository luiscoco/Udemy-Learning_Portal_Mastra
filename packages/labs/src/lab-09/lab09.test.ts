import { afterAll, describe, expect, it } from 'vitest';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { lab09 } from './run.js';
import { extractTicketOffline, TicketSchema } from './schema.js';

const example = lab09.definition.exampleInput;
const runner = new LabRunner({
  registry: new LabRegistry([lab09]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

async function output(input: Record<string, unknown>) {
  const r = runner.start('lab-09', { input });
  const snap = await runner.waitFor(r.runId);
  const result = runner.events(r.runId).find((e) => e.type === 'result') as {
    output: Record<string, unknown>;
    validation: { passed: boolean };
  };
  return { snap, result };
}

describe('lab-09 structured JSON', () => {
  it('validates the output schema and returns a typed object', async () => {
    const { result } = await output(example);
    expect(TicketSchema.safeParse(result.output.object).success).toBe(true);
    expect(result.validation.passed).toBe(true);
  });

  it.each(['strict', 'warn', 'fallback'])('malformed reply with %s never crashes the run', async (errorStrategy) => {
    for (const offlineResponse of ['wrong-shape', 'broken-json']) {
      const { snap, result } = await output({ ...example, errorStrategy, offlineResponse });
      expect(snap.status).toBe('succeeded');
      expect(result.validation.passed).toBe(true);
      const obj = result.output.object;
      if (obj !== null) expect(TicketSchema.safeParse(obj).success).toBe(true);
    }
  });

  it('offline extractor always satisfies the schema', () => {
    for (const m of ['hello there', 'URGENT outage!!! api down', 'refund please x@y.io', 'a'.repeat(300)]) {
      expect(TicketSchema.safeParse(extractTicketOffline(m)).success).toBe(true);
    }
  });
});
