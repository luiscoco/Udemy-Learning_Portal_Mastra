import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import type { WorkflowGraph as Graph } from '@mlp/contracts';
import { runReducer, initialRunState } from '../../features/run/run-state';
import { WorkflowGraph } from './WorkflowGraph';

const graph: Graph = {
  workflowId: 'order-fulfilment',
  title: 'Order fulfilment',
  nodes: [
    { id: 'validate', label: 'validate', kind: 'step', layer: 0, lane: 0 },
    { id: 'review', label: 'review', kind: 'branch', layer: 1, lane: 0 },
    { id: 'auto', label: 'auto', kind: 'branch', layer: 1, lane: 1 },
    { id: 'shipping', label: 'shipping', kind: 'workflow', layer: 2, lane: 0 },
    { id: 'shipping.book', label: 'book', kind: 'step', layer: 3, lane: 0, group: 'shipping' },
  ],
  edges: [
    { from: 'validate', to: 'review', kind: 'branch', label: 'review' },
    { from: 'validate', to: 'auto', kind: 'branch', label: 'auto' },
    { from: 'review', to: 'shipping', kind: 'next' },
    { from: 'auto', to: 'shipping', kind: 'next' },
    { from: 'shipping', to: 'shipping.book', kind: 'next' },
  ],
};
const statusOf = (id: string) => screen.getAllByTestId('workflow-node').find((n) => n.dataset.node === id)!.dataset.status;
const ev = (seq: number, stepId: string, status: 'running' | 'success' | 'failed') => ({
  type: 'workflow-step' as const,
  stepId,
  status,
  runId: 'r',
  correlationId: 'c',
  seq,
  timestamp: new Date(0).toISOString(),
});

describe('WorkflowGraph', () => {
  it('colours nodes live from workflow-step events, and finishes with skipped and not reached', () => {
    let state = runReducer(initialRunState, { type: 'start' });
    state = runReducer(state, {
      type: 'event',
      event: {
        type: 'workflow-graph',
        workflowId: 'order-fulfilment',
        graph,
        runId: 'r',
        correlationId: 'c',
        seq: 0,
        timestamp: new Date(0).toISOString(),
      },
    });
    expect(state.workflowGraph).toEqual(graph);
    state = runReducer(state, { type: 'event', event: ev(1, 'validate', 'running') });
    const { rerender } = render(<WorkflowGraph graph={graph} steps={state.steps} finished={false} />);
    expect(statusOf('validate')).toBe('running');
    expect(statusOf('auto')).toBe('waiting');

    state = runReducer(state, { type: 'event', event: ev(2, 'validate', 'success') });
    state = runReducer(state, { type: 'event', event: ev(3, 'auto', 'running') });
    state = runReducer(state, { type: 'event', event: ev(4, 'auto', 'success') });
    state = runReducer(state, { type: 'event', event: ev(5, 'shipping.book', 'failed') });
    rerender(
      <WorkflowGraph graph={graph} steps={state.steps} finished finalStatuses={{ review: 'skipped', shipping: 'not-reached' }} />,
    );
    expect(['validate', 'review', 'auto', 'shipping', 'shipping.book'].map(statusOf)).toEqual([
      'success',
      'skipped',
      'success',
      'not-reached',
      'failed',
    ]);
    const list = screen.getByRole('list', { name: 'Workflow steps' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(['validateDone', 'reviewSkipped', 'autoDone', 'shippingNot reached', 'shipping › bookFailed']);
  });
});
