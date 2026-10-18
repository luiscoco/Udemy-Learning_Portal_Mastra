import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import type { McpCapabilities } from '@mlp/contracts';
import { McpCapabilityMatrix, mcpCapabilitiesOf } from './McpCapabilityMatrix';

const data: McpCapabilities = {
  server: { name: 'Course fixture server', version: '1.0.0', protocolVersion: '2026-07-28' },
  advertised: { tools: {}, logging: {} },
  rows: [
    {
      feature: 'Resources',
      protocol: 'resources/list',
      server: 'not-advertised',
      mastra: 'limited',
      observed: 'empty list',
      note: 'check capabilities',
    },
    {
      feature: 'Completions',
      protocol: 'completion/complete',
      server: 'not-advertised',
      mastra: 'not-exposed',
      observed: 'Method not found',
      note: '',
    },
  ],
  operation: {
    kind: 'read-resource',
    target: 'course://syllabus',
    status: 'fallback',
    via: 'tool course_info',
    content: '<script>alert(1)</script>',
    fallbackReason: 'the server does not advertise resources',
    error: null,
  },
};

describe('McpCapabilityMatrix', () => {
  it('only accepts outputs that match the contract', () => {
    expect(mcpCapabilitiesOf({ mcpCapabilities: data })).toEqual(data);
    expect(mcpCapabilitiesOf({ mcpCapabilities: { rows: [] } })).toBeNull();
  });

  it('shows each layer per feature and labels the fallback, as text', () => {
    const { container } = render(<McpCapabilityMatrix data={data} />);
    expect(container.querySelector('script')).toBeNull();
    const table = screen.getByRole('table', { name: 'MCP capability matrix' });
    const completions = within(table).getByRole('row', { name: /Completions/ });
    expect(completions).toHaveTextContent('Not advertised');
    expect(completions).toHaveTextContent('Not exposed');
    const op = screen.getByRole('region', { name: 'Operation result' });
    expect(op).toHaveTextContent('Fallback: tool course_info');
    expect(op).toHaveTextContent('the server does not advertise resources');
    expect(screen.getByTestId('mcp-operation-content')).toHaveTextContent('<script>alert(1)</script>');
  });
});
