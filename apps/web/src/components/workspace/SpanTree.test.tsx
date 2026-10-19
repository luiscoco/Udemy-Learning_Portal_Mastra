import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { TraceSpan, TraceTree } from '@mlp/contracts';
import { buildTree, SpanTree, traceTreeOf } from './SpanTree';

const span = (id: string, parentId: string | null, type: string, extra: Partial<TraceSpan> = {}): TraceSpan => ({
  id,
  parentId,
  traceId: 't1',
  name: `${type} ${id}`,
  type,
  entity: null,
  startMs: 0,
  durationMs: 10,
  status: 'ok',
  error: null,
  attributes: {},
  correlationId: 'c1',
  ...extra,
});
const data: TraceTree = {
  traceId: 't1',
  rootSpanId: 'r',
  correlation: { labRunId: 'run-1', correlationId: 'c1', workflowRunId: 'w1' },
  view: 'summary',
  spans: [
    span('r', null, 'workflow_run', { durationMs: 100 }),
    span('s', 'r', 'workflow_step'),
    span('a', 's', 'agent_run'),
    span('t', 'a', 'tool_call', { status: 'error', error: 'backend <b>down</b>', attributes: { success: false } }),
    span('x', 'missing', 'agent_run'),
  ],
  hiddenSpans: 4,
  findings: ['Untraced work: step review called agent reviewer'],
};

describe('SpanTree', () => {
  it('only accepts outputs that match the contract', () => {
    expect(traceTreeOf({ traceTree: data })).toEqual(data);
    expect(traceTreeOf({ traceTree: { spans: 'x' } })).toBeNull();
    expect(traceTreeOf(undefined)).toBeNull();
  });

  it('nests spans by parent and marks spans whose parent is missing', () => {
    const roots = buildTree(data.spans);
    expect(roots.map((r) => r.span.id)).toEqual(['r', 'x']);
    expect(roots[0]!.children[0]!.children[0]!.children[0]!.span.id).toBe('t');
  });

  it('renders the tree with errors as text and the correlation header', () => {
    render(<SpanTree data={data} />);
    const tree = screen.getByRole('list', { name: 'Trace spans' });
    expect(within(tree).getByRole('list', { name: 'Children of agent_run a' })).toHaveTextContent('tool_call t');
    expect(screen.getByText('backend <b>down</b>')).toBeInTheDocument();
    expect(tree.querySelector('b')).toBeNull();
    expect(screen.getByText('parent missing')).toBeInTheDocument();
    expect(screen.getByTestId('span-tree')).toHaveTextContent('Correlation idc1');
    expect(screen.getByRole('list', { name: 'Trace findings' })).toHaveTextContent('Untraced work');
  });
});
