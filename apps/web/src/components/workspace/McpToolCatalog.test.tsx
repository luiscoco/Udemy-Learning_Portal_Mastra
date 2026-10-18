import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { McpCatalog } from '@mlp/contracts';
import { McpToolCatalog, mcpCatalogOf } from './McpToolCatalog';

const data: McpCatalog = {
  server: { key: 'course', name: 'Course fixture server', version: '1.0.0', protocolVersion: '2026-07-28' },
  tools: [
    {
      key: 'course_search_labs',
      name: 'search_labs',
      title: 'Search labs',
      description: 'Finds labs <img src=x onerror=alert(1)>',
      annotations: { readOnlyHint: true },
      inputSchema: {
        type: 'object',
        properties: { query: { type: 'string', minLength: 2, description: 'Words' }, limit: { type: 'integer', default: 3 } },
        required: ['query'],
      },
      outputSchema: null,
      permission: { allowed: true, reason: 'ok' },
    },
    {
      key: 'course_reset_progress',
      name: 'reset_progress',
      title: null,
      description: 'Resets progress',
      annotations: { readOnlyHint: false, destructiveHint: true },
      inputSchema: { type: 'object', properties: {} },
      outputSchema: null,
      permission: { allowed: false, reason: '"reset_progress" exists but is not in the allowlist.' },
    },
  ],
  call: {
    toolName: 'serch_labs',
    args: {},
    status: 'rejected',
    reason: 'unknown-tool',
    message: 'The server does not advertise a tool named "serch_labs".',
    suggestions: ['search_labs'],
    fieldErrors: [],
    result: null,
    durationMs: 0,
  },
};

describe('McpToolCatalog', () => {
  it('only accepts outputs that match the contract', () => {
    expect(mcpCatalogOf({ mcpCatalog: data })).toEqual(data);
    expect(mcpCatalogOf({ mcpCatalog: { tools: 'x' } })).toBeNull();
    expect(mcpCatalogOf(null)).toBeNull();
  });

  it('shows each tool’s badges and parameter table, as text, and the rejected call', () => {
    const { container } = render(<McpToolCatalog data={data} />);
    expect(container.querySelector('img')).toBeNull();
    const search = screen.getByRole('article', { name: 'search_labs' });
    expect(within(search).getByText('Read-only')).toBeInTheDocument();
    const table = within(search).getByRole('table', { name: 'Parameters of search_labs' });
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('querystringyesminLength 2Words');
    expect(rows[2]).toHaveTextContent('limitintegernodefault 3');
    const reset = screen.getByRole('article', { name: 'reset_progress' });
    expect(within(reset).getByText('Destructive')).toBeInTheDocument();
    expect(within(reset).getByText('Not permitted')).toBeInTheDocument();
    const call = screen.getByRole('region', { name: 'Tool call' });
    expect(call).toHaveTextContent('Rejected: unknown-tool');
    expect(call).toHaveTextContent('Did you mean: search_labs?');
  });
});
