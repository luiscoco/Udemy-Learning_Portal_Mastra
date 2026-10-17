import { z } from 'zod';

/** The structured output the agent must return for a support message. */
export const TicketSchema = z.object({
  title: z.string().min(3).max(80).describe('Short summary of the problem'),
  priority: z.enum(['low', 'medium', 'high']).describe('high = service unusable or money at risk'),
  category: z.enum(['account', 'billing', 'technical', 'general']),
  tags: z.array(z.string().min(1).max(20)).max(5),
  customerEmail: z.email().nullable().describe('Email address mentioned in the message, or null'),
});
export type Ticket = z.infer<typeof TicketSchema>;

/** Deterministic "good" extraction used by the offline simulator. */
export function extractTicketOffline(message: string): Ticket {
  const lower = message.toLowerCase();
  const firstSentence = message.trim().split(/(?<=[.!?])\s/)[0] ?? message;
  const sentence = firstSentence.replace(/[.!?]+$/, '').trim();
  // Keep titles within 80 characters, cutting at a word boundary.
  const title = (sentence.length > 80 ? `${sentence.slice(0, 77).replace(/\s+\S*$/, '')}…` : sentence) || 'Support request';
  const priority: Ticket['priority'] = /urgent|cannot|can't|down|outage|charged twice|asap/.test(lower)
    ? 'high'
    : /slow|error|problem|issue/.test(lower)
      ? 'medium'
      : 'low';
  const category: Ticket['category'] = /log ?in|password|account|sign ?in/.test(lower)
    ? 'account'
    : /refund|invoice|charge|payment|billing/.test(lower)
      ? 'billing'
      : /error|crash|bug|slow|api/.test(lower)
        ? 'technical'
        : 'general';
  const tags = ['login', 'password', 'refund', 'invoice', 'crash', 'api', 'mobile', 'urgent']
    .filter((t) => lower.includes(t))
    .slice(0, 5);
  // Domain labels separated by dots; a sentence-ending "." is not part of the address.
  const customerEmail = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(message)?.[0] ?? null;
  return { title: title.length >= 3 ? title : 'Support request', priority, category, tags, customerEmail };
}
