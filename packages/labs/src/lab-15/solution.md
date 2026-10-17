# Solution: an approval-gated side effect

```ts
const ledger: string[] = [];

export const issueRefund = createTool({
  id: 'issue-refund',
  description: 'Refunds an order. Amount in euro cents.',
  inputSchema: z.object({ orderId: z.string(), amountCents: z.number().int().positive() }),
  requireApproval: true, // the stream pauses with a tool-call-approval chunk
  execute: async ({ orderId, amountCents }) => {
    if (amountCents > 20_000) return { ok: false, code: 'OVER_LIMIT' }; // policy still applies after approval
    if (ledger.includes(orderId)) return { ok: false, code: 'ALREADY_REFUNDED' }; // idempotent
    ledger.push(orderId);
    return { ok: true };
  },
});

const agent = new Agent({ id: 'support', name: 'Support', instructions: '…', model, tools: { issueRefund } });
// Register the agent so the paused run can be resumed.
export const mastra = new Mastra({ agents: { agent } });
```

Test both decisions:

```ts
async function pendingCall() {
  const out = await agent.stream('Refund 45.00 on ORD-1001');
  for await (const c of out.fullStream)
    if (c.type === 'tool-call-approval') return { runId: out.runId, toolCallId: c.payload.toolCallId };
  throw new Error('no approval requested');
}

it('runs once on approve', async () => {
  const resumed = await agent.approveToolCall(await pendingCall());
  for await (const _ of resumed.fullStream);
  expect(ledger).toEqual(['ORD-1001']);
});

it('never runs on decline', async () => {
  ledger.length = 0;
  const resumed = await agent.declineToolCall({ ...(await pendingCall()), reason: 'not approved' });
  for await (const _ of resumed.fullStream);
  expect(ledger).toEqual([]);
});
```

Use a scripted model, as this platform does, so the tool call is deterministic.

**Challenge:** `requireApproval` also accepts a function of the tool input, for example `requireApproval: (input) => input.amountCents > 2000`. Small refunds then execute directly, so their audit entries go straight to `executed` with no `approval-requested` or `approved`.
