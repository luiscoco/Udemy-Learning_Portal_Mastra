import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { WorkflowGraphSchema } from '@mlp/contracts';
import { toWorkflowGraph } from './workflow-graph.js';

const step = (id: string) =>
  createStep({
    id,
    description: `About ${id}`,
    inputSchema: z.any(),
    outputSchema: z.any(),
    execute: async ({ inputData }) => inputData,
  });

describe('toWorkflowGraph', () => {
  it('lays out sequence, parallel, branch, foreach, loop and nested workflows from serializedStepGraph', () => {
    const shipping = createWorkflow({ id: 'shipping', inputSchema: z.any(), outputSchema: z.any() })
      .then(step('book'))
      .then(step('notify'))
      .commit();
    const wf = createWorkflow({ id: 'fulfil', inputSchema: z.any(), outputSchema: z.any() })
      .then(step('validate'))
      .parallel([step('stock'), step('fraud')])
      .branch([
        [async () => true, step('review')],
        [async () => false, step('auto')],
      ])
      .foreach(step('pack') as never) // types want an array-producing previous step; only the graph matters here
      .dountil(step('poll'), async () => true)
      .then(shipping)
      .commit();
    const g = toWorkflowGraph(wf, 'Fulfil an order');
    expect(WorkflowGraphSchema.parse(g)).toEqual(g);
    expect(g.nodes.map((n) => `${n.id}:${n.kind}:${n.layer}/${n.lane}`)).toEqual([
      'validate:step:0/0',
      'stock:parallel:1/0',
      'fraud:parallel:1/1',
      'review:branch:2/0',
      'auto:branch:2/1',
      'pack:foreach:3/0',
      'poll:loop:4/0',
      'shipping:workflow:5/0',
      'shipping.book:step:6/0',
      'shipping.notify:step:7/0',
    ]);
    expect(g.nodes.find((n) => n.id === 'shipping.book')).toMatchObject({ group: 'shipping', description: 'About book' });
    // Branch edges are labelled with their condition; a branch fans out from both parallel steps.
    expect(g.edges.filter((e) => e.to === 'review')).toEqual([
      { from: 'stock', to: 'review', kind: 'branch', label: 'review' },
      { from: 'fraud', to: 'review', kind: 'branch', label: 'review' },
    ]);
    expect(g.edges.filter((e) => e.to === 'pack').map((e) => e.from)).toEqual(['review', 'auto']);
    expect(JSON.stringify(g)).not.toContain('async'); // no serialized closures
  });
});
