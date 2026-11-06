# Solution: retries, persisted state, restart and idempotency

```ts
const State = z.object({ charged: z.array(z.object({ invoiceId: z.string(), chargeId: z.string() })), total: z.number() });

const charge = (inv: Invoice) =>
  createStep({
    id: `charge-${inv.invoiceId}`,
    inputSchema: Batch,
    outputSchema: Batch,
    stateSchema: State,
    execute: async ({ inputData, state, setState, runId }) => {
      const c = await payments.charge({ idempotencyKey: `charge:${runId}:${inv.invoiceId}`, amount: inv.amount }); // stable key
      await setState({ charged: [...state.charged, { invoiceId: inv.invoiceId, chargeId: c.id }], total: state.total + inv.amount });
      return inputData;
    },
  });

const billing = createWorkflow({ id: 'billing-run', options: { autoRestartActiveRuns: false }, inputSchema: Batch, outputSchema: Result, stateSchema: State, retryConfig: { attempts: 3, delay: 100 } })
  .then(openBatch)
  .then(charge(inv1)).then(charge(inv2)).then(charge(inv3))
  .then(closeBatch)
  .commit();

new Mastra({ workflows: { 'billing-run': billing }, storage: new LibSQLStore({ id: 'billing', url: 'file:./billing.db' }) });
```

To recover after a crash, start a new process and run:

```ts
const { runs } = await mastra.getWorkflow('billing-run').listActiveWorkflowRuns();
for (const r of runs) {
  if (await leases.tryAcquire(r.runId)) await (await workflow.createRun({ runId: r.runId })).restart();
}
```

`restart()` skips completed steps and re-runs the interrupted one from its start. The idempotency key makes the provider replay a charge that already happened, so every invoice is charged once.

**Challenge:** keep a `leases` table `(runId, owner, expiresAt)`. Acquire a lease with one atomic `INSERT … ON CONFLICT DO UPDATE … WHERE expiresAt < now`, and renew it from a timer while the run executes. A worker only restarts runs whose lease has expired, so a slow but alive worker keeps its run.

On core 1.79+, this lab assigns recovery to its explicit selected-run operator with `options.autoRestartActiveRuns: false`. The framework generic boot-time sweep must not independently re-drive this simulated billing workflow. Workflows eligible for generic recovery keep the framework ownership lease; do not disable that protection for a shared automatically recovered worker. This lesson still verifies a real process crash and native restart, and demonstrates the duplicate charge when no idempotency key is used.
