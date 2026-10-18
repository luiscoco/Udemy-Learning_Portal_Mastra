/**
 * Real-crash check, run as its own Node process (see lab34.crash.test.ts):
 *   node --import tsx crash-worker.ts <dir> start     → charges INV-1 and INV-2, then exits the process inside INV-2's step
 *   node --import tsx crash-worker.ts <dir> recover   → a NEW process finds the running run and restarts it
 * Prints one JSON line on stdout. Offline: no model is called.
 */
import { join } from 'node:path';
import { openMemory } from '@mlp/mastra-runtime';
import { ChargeProvider, INITIAL_STATE, openBilling, type Execution, type Invoice } from './billing.js';

const [dir, phase] = process.argv.slice(2);
if (!dir || (phase !== 'start' && phase !== 'recover')) {
  console.error('usage: crash-worker.ts <dir> start|recover');
  process.exit(2);
}

const invoices: Invoice[] = [
  { invoiceId: 'INV-1', customer: 'Ana', amount: 10, failTimes: 0 },
  { invoiceId: 'INV-2', customer: 'Sam', amount: 20, failTimes: 0 },
  { invoiceId: 'INV-3', customer: 'Kim', amount: 30, failTimes: 0 },
];
const provider = new ChargeProvider(join(dir, 'charges.jsonl'));
const executions: Execution[] = [];
const opened = await openMemory(join(dir, 'workflows.db'));
const { workflow } = openBilling(opened.storage, invoices, {
  provider,
  idempotency: 'key',
  instance: String(process.pid),
  executions,
  retryDelayMs: 0,
  summarize: async (s) => `charged ${s.charged.length}`,
  ...(phase === 'start'
    ? { crashAfter: { invoiceId: 'INV-2', onCrash: () => (console.log(JSON.stringify({ pid: process.pid, phase, crashedIn: 'charge-INV-2' })), process.exit(1)) } }
    : {}),
});

if (phase === 'start') {
  const run = await workflow.createRun({ resourceId: 'learner' });
  console.error(`runId=${run.runId}`);
  await run.start({ inputData: { invoices }, initialState: INITIAL_STATE } as never);
  console.log(JSON.stringify({ pid: process.pid, phase, error: 'expected a crash' }));
} else {
  const active = (await workflow.listActiveWorkflowRuns()) as { runs: { runId: string }[] };
  const runId = active.runs[0]!.runId;
  const r = (await (await workflow.createRun({ runId })).restart()) as { status: string; result?: unknown };
  const charges = provider.read(runId);
  console.log(
    JSON.stringify({
      pid: process.pid,
      phase,
      active: active.runs.length,
      status: r.status,
      result: r.result,
      ranAfterRestart: executions.map((e) => e.stepId),
      counts: Object.fromEntries(invoices.map((i) => [i.invoiceId, charges.filter((c) => c.invoiceId === i.invoiceId).length])),
    }),
  );
}
await opened.close();
process.exit(0);
