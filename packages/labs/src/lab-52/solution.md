# Solution: explicit handoffs with minimum context

```ts
import { z } from 'zod';
import { createTool } from '@mastra/core/tools';

// 1. Transfer tools only queue a request; they never run the next agent.
const desk: { from: string; to: string; reason: string; case?: Case }[] = [];
const transferTo = (to: 'billing' | 'technical' | 'account') =>
  createTool({
    id: `transfer_to_${to}`,
    description: `Hands the case to ${to}.`,
    inputSchema: CaseSchema.extend({ reason: z.string() }), // the case record, validated
    execute: async ({ reason, ...c }) => (desk.push({ from: 'triage', to, reason, case: c }), { queued: true }),
  });

// 2. Stop the agent right after it transfers.
const stopAfterTransfer = ({ steps }) => steps.some((s) => s.toolCalls.some((c) => c.toolName.startsWith('transfer_to_')));
await triage.stream(message, { toolChoice: 'required', stopWhen: stopAfterTransfer });

// 3. The orchestrator decides, and builds the packet from the record it keeps.
const PACKET_FIELDS = { billing: ['customerId', 'orderId', 'summary'], technical: ['customerId', 'product', 'errorCode', 'summary'], account: ['customerId', 'accountIssue', 'summary'] };
function decide(from, to, visited, hops, maxHops, record) {
  if (!ALLOWED[from].includes(to)) return { accepted: false, reason: 'not-allowed' };
  if (hops + 1 > maxHops) return { accepted: false, reason: 'hop-limit' };
  if (visited.includes(to)) return { accepted: false, reason: 'cycle' };
  if (!record.customerId) return { accepted: false, reason: 'missing-context' };
  const packet = Object.fromEntries(PACKET_FIELDS[to].map((k) => [k, k === 'summary' ? redact(record.summary) : record[k]]));
  return { accepted: true, packet };
}
// 4. Loop with .dountil(handle, done || iterationCount >= maxHops + 1); escalate every refusal to a human.
```
