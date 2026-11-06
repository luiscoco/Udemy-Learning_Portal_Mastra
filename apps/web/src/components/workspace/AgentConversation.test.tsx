import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { AgentConversation as Data } from '@mlp/contracts';
import { AgentConversation, agentConversationOf } from './AgentConversation';

const data: Data = {
  agents: [
    { id: 'orchestrator', name: 'Workflow', role: 'Owns the handoffs', tools: [] },
    { id: 'researcher', name: 'Research agent', role: 'Finds facts', tools: ['search_sources'] },
    { id: 'editor', name: 'Editor agent', role: 'Writes', tools: [] },
  ],
  messages: [
    {
      seq: 1,
      from: 'orchestrator',
      to: 'researcher',
      kind: 'task',
      stepId: 'research',
      round: null,
      summary: 'Research request',
      content: 'Research <b>this</b>',
    },
    {
      seq: 2,
      from: 'editor',
      to: 'researcher',
      kind: 'draft',
      stepId: 'draft',
      round: 0,
      summary: 'First draft',
      content: 'Bad sentence.',
      injected: true,
    },
  ],
  outcome: { status: 'needs-human', text: '', issues: ['Bad sentence. (uncited)'] },
};

describe('AgentConversation', () => {
  it('formats agent replies but keeps injected content literal', () => {
    render(
      <AgentConversation
        data={{
          ...data,
          messages: data.messages.map((m) => ({
            ...m,
            kind: 'result',
            content: '**Formatted**\n\n```typescript\nconst ready = true;\n```',
          })),
        }}
      />,
    );
    const reply = screen.getByLabelText('Content of message 1');
    expect(reply.querySelector('strong')).toHaveTextContent('Formatted');
    expect(reply.querySelector('.token.keyword')).toHaveTextContent('const');
    expect(screen.getByLabelText('Content of message 2').querySelector('strong')).toBeNull();
  });
  it('only accepts outputs that match the contract', () => {
    expect(agentConversationOf({ agentConversation: data })).toEqual(data);
    expect(agentConversationOf({ agentConversation: { agents: [] } })).toBeNull();
    expect(agentConversationOf(null)).toBeNull();
  });

  it('lists messages in order with sender, recipient, kind and step, and shows content as text', async () => {
    const user = userEvent.setup();
    render(<AgentConversation data={data} />);
    const items = within(screen.getByRole('list', { name: 'Messages' })).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('1. Workflow → to Research agent task Research request (step research)');
    expect(items[1]).toHaveTextContent('planted by the lab');
    await user.click(screen.getByText('Research request', { exact: false }));
    const content = screen.getByLabelText('Content of message 1');
    expect(content).toHaveTextContent('Research <b>this</b>');
    expect(content.querySelector('b')).toBeNull();
    expect(screen.getByTestId('conversation-outcome')).toHaveTextContent('Needs a human');
    expect(screen.getByRole('list', { name: 'Remaining issues' })).toHaveTextContent('uncited');
  });
});
