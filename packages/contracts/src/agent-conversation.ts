import { z } from 'zod';

/**
 * A multi-agent transcript: the agents, every message they exchanged (in order) and the outcome.
 * Labs put it at `output.agentConversation`; the web Run tab renders it as text.
 */
export const ConversationAgentSchema = z.object({
  id: z.string().min(1).max(64),
  name: z.string().min(1).max(80),
  role: z.string().max(300),
  tools: z.array(z.string().max(80)).max(30),
});
export type ConversationAgent = z.infer<typeof ConversationAgentSchema>;

export const MESSAGE_KINDS = ['task', 'handoff', 'notes', 'draft', 'review', 'revision', 'final', 'escalation'] as const;
export const ConversationMessageSchema = z.object({
  seq: z.number().int().min(1),
  /** Agent ids, or "orchestrator" / "human". */
  from: z.string().min(1).max(64),
  to: z.string().min(1).max(64),
  kind: z.enum(MESSAGE_KINDS),
  /** The workflow step that carried the message. */
  stepId: z.string().max(80),
  round: z.number().int().min(0).nullable(),
  summary: z.string().max(300),
  content: z.string().max(20_000),
  /** True when the app planted this content (fault injection), so learners can tell it apart. */
  injected: z.boolean().optional(),
});
export type ConversationMessage = z.infer<typeof ConversationMessageSchema>;

export const AgentConversationSchema = z.object({
  agents: z.array(ConversationAgentSchema).min(1).max(12),
  messages: z.array(ConversationMessageSchema).max(200),
  outcome: z.object({
    status: z.enum(['published', 'needs-human', 'failed']),
    text: z.string().max(20_000),
    issues: z.array(z.string().max(600)).max(50),
  }),
});
export type AgentConversation = z.infer<typeof AgentConversationSchema>;
