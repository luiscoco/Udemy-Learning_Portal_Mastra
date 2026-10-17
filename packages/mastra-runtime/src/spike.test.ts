// Spike: confirms how the installed @mastra/core behaves with our scripted model. Kept as a
// regression test so a Mastra upgrade that changes these behaviours fails loudly.
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { createTool } from '@mastra/core/tools';
import { ScriptedLanguageModel } from './scripted-model.js';

const add = createTool({
  id: 'add',
  description: 'Adds two numbers',
  inputSchema: z.object({ a: z.number(), b: z.number() }),
  outputSchema: z.object({ sum: z.number() }),
  execute: async (input) => ({ sum: input.a + input.b }),
});

function toolModel() {
  return new ScriptedLanguageModel({
    script: (v) =>
      v.toolResults.length === 0 && v.toolNames.includes('add')
        ? { toolCalls: [{ toolName: 'add', input: { a: 2, b: 3 } }] }
        : { text: `The sum is ${JSON.stringify(v.toolResults[0]?.output)}. System said: ${v.system.slice(0, 20)}` },
  });
}

describe('Mastra spike with ScriptedLanguageModel', () => {
  it('generate() runs instructions + tool loop and returns text', async () => {
    const agent = new Agent({
      id: 'calc-agent',
      name: 'Calc',
      instructions: 'You add numbers.',
      model: toolModel(),
      tools: { add },
    });
    const res = await agent.generate('What is 2 + 3?');
    expect(res.text).toContain('"sum":5');
    expect(res.text).toContain('You add numbers.');
    expect(res.toolCalls.length).toBeGreaterThan(0);
    expect(res.toolResults.length).toBeGreaterThan(0);
  });

  it('stream() yields text deltas and tool chunks', async () => {
    const agent = new Agent({
      id: 'calc-agent',
      name: 'Calc',
      instructions: 'You add numbers.',
      model: toolModel(),
      tools: { add },
    });
    const out = await agent.stream('What is 2 + 3?');
    const types: string[] = [];
    for await (const chunk of out.fullStream) types.push(chunk.type);
    expect(types).toContain('tool-call');
    expect(types).toContain('tool-result');
    expect(types).toContain('text-delta');
    expect(await out.text).toContain('"sum":5');
  });

  it('registers agents in Mastra and finds them by key and id', () => {
    const agent = new Agent({ id: 'calc-agent', name: 'Calc', instructions: 'x', model: toolModel() });
    const mastra = new Mastra({ agents: { calc: agent }, logger: false });
    expect(mastra.getAgent('calc').id).toBe('calc-agent');
    expect(mastra.getAgentById('calc-agent').name).toBe('Calc');
    expect(Object.keys(mastra.listAgents())).toEqual(['calc']);
  });
});
