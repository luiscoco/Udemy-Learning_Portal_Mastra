import { AgentConversationSchema, type AgentConversation as Conversation, type ConversationMessage } from '@mlp/contracts';
import { Badge, Card } from '../ui/primitives';

/** Parses a lab result's `agentConversation`; anything that does not match the contract renders nothing. */
export function agentConversationOf(output: unknown): Conversation | null {
  if (!output || typeof output !== 'object' || !('agentConversation' in output)) return null;
  const parsed = AgentConversationSchema.safeParse((output as { agentConversation: unknown }).agentConversation);
  return parsed.success ? parsed.data : null;
}

const KIND_TONE: Record<ConversationMessage['kind'], 'neutral' | 'accent' | 'success' | 'warning' | 'danger'> = {
  task: 'neutral',
  handoff: 'accent',
  notes: 'accent',
  draft: 'neutral',
  review: 'warning',
  revision: 'neutral',
  result: 'accent',
  refusal: 'danger',
  final: 'success',
  escalation: 'danger',
};
const OUTCOME = {
  published: { tone: 'success', text: 'Published' },
  resolved: { tone: 'success', text: 'Resolved' },
  'needs-human': { tone: 'warning', text: 'Needs a human' },
  failed: { tone: 'danger', text: 'Failed' },
} as const;

/** Agents, every message in order (sender → recipient, step, round) and the outcome. All content is rendered as text. */
export function AgentConversation({ data }: { data: Conversation }) {
  const name = (id: string) => data.agents.find((a) => a.id === id)?.name ?? id;
  const outcome = OUTCOME[data.outcome.status];
  return (
    <Card className="flex min-w-0 flex-col gap-4 p-4" data-testid="agent-conversation">
      <ul className="grid gap-2 sm:grid-cols-3" aria-label="Agents">
        {data.agents.map((a) => (
          <li key={a.id} className="min-w-0 rounded-lg border border-border px-3 py-2 text-sm">
            <span className="font-medium">{a.name}</span>
            <span className="block text-xs text-fg-muted [overflow-wrap:anywhere]">{a.role}</span>
            <span className="block text-xs text-fg-muted [overflow-wrap:anywhere]">
              Tools: <span className="font-mono">{a.tools.join(', ') || 'none'}</span>
            </span>
          </li>
        ))}
      </ul>

      <ol className="flex flex-col gap-2" aria-label="Messages">
        {data.messages.map((m) => (
          <li key={m.seq} className="min-w-0 rounded-lg border border-border px-3 py-2">
            <details>
              <summary className="cursor-pointer text-sm [overflow-wrap:anywhere]">
                <span className="text-fg-muted">{m.seq}.</span> <span className="font-medium">{name(m.from)}</span>
                <span aria-hidden="true"> → </span>
                <span className="sr-only"> to </span>
                <span className="font-medium">{name(m.to)}</span> <Badge tone={KIND_TONE[m.kind]}>{m.kind}</Badge>{' '}
                {m.injected ? <Badge tone="danger">planted by the lab</Badge> : null}{' '}
                <span className="text-fg-muted">
                  {m.summary} (step {m.stepId}
                  {m.round === null ? '' : `, round ${m.round}`})
                </span>
              </summary>
              <pre
                className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded bg-surface-muted p-2 text-xs [overflow-wrap:anywhere]"
                tabIndex={0}
                aria-label={`Content of message ${m.seq}`}
              >
                {m.content}
              </pre>
            </details>
          </li>
        ))}
      </ol>

      <div data-testid="conversation-outcome" role="status">
        <p className="text-sm font-semibold">
          Outcome: <Badge tone={outcome.tone}>{outcome.text}</Badge>
        </p>
        {data.outcome.text ? <p className="mt-1 text-sm [overflow-wrap:anywhere]">{data.outcome.text}</p> : null}
        {data.outcome.issues.length ? (
          <ul className="mt-1 list-disc pl-5 text-sm text-danger" aria-label="Remaining issues">
            {data.outcome.issues.map((i, k) => (
              <li key={k} className="[overflow-wrap:anywhere]">
                {i}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </Card>
  );
}
