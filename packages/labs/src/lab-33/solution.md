# Solution: a durable approval gate with an idempotent payment

```ts
const supervisorApproval = createStep({
  id: 'supervisorApproval',
  inputSchema: Prepared,
  outputSchema: Gated,
  suspendSchema: z.object({ refundId: z.string(), amount: z.number(), summary: z.string(), expiresAt: z.string() }),
  resumeSchema: z.object({ decision: z.enum(['approve', 'reject', 'expire']), supervisor: z.string() }),
  execute: async ({ inputData, resumeData, suspendData, suspend }) => {
    if (!resumeData) return await suspend({ ...view(inputData), expiresAt: new Date(Date.now() + ttl).toISOString() });
    const expired = resumeData.decision === 'expire' || Date.now() > Date.parse(suspendData!.expiresAt);
    return { ...inputData, status: expired ? 'expired' : resumeData.decision === 'approve' ? 'approved' : 'rejected' };
  },
});

const settle = createStep({
  id: 'settle',
  retries: 2, // transient provider errors
  inputSchema: Gated,
  outputSchema: Outcome,
  execute: async ({ inputData, runId }) => {
    if (inputData.status !== 'approved') return { status: inputData.status, paymentId: null }; // no money moves
    const p = await payments.refund({ idempotencyKey: `refund:${runId}`, amount: inputData.request.amount });
    return { status: 'refunded', paymentId: p.id };
  },
});
```

Register the workflow on `new Mastra({ workflows, storage })`.

- **Decisions:** `createRun({ runId }).resume({ step: 'supervisorApproval', resumeData })`.
- **Expiry sweep:** `listWorkflowRuns({ status: 'suspended' })`, then resume the overdue runs with `{ decision: 'expire' }`.
- **Duplicate or late approvals:** Mastra rejects them once the run has completed ("not suspended").

**Challenge (four eyes):** above 500, the first approval suspends again with `{ approvals: [first] }` in the payload. The second resume must come from a different supervisor (compare with `suspendData.approvals`), and only then does the step return `approved`.
