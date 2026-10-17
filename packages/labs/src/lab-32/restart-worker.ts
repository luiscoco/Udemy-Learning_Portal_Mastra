/**
 * Real-restart check, run as its own Node process (see lab32.restart.test.ts):
 *   node --import tsx restart-worker.ts <dir> start            → starts onboarding, suspends, exits
 *   node --import tsx restart-worker.ts <dir> resume <runId>   → a NEW process resumes the persisted run
 * Prints one JSON line on stdout. Offline: the drafter is deterministic, so no provider is called.
 */
import { join } from 'node:path';
import { openMemory } from '@mlp/mastra-runtime';
import { CHECKPOINT_STEP, countOps, Ledger, openOnboarding } from './onboarding.js';
import { draftOffline } from './run.js';

const [dir, phase, runId] = process.argv.slice(2);
if (!dir || (phase !== 'start' && phase !== 'resume') || (phase === 'resume' && !runId)) {
  console.error('usage: restart-worker.ts <dir> start | resume <runId>');
  process.exit(2);
}

const ledger = new Ledger(join(dir, 'ledger.jsonl'));
const opened = await openMemory(join(dir, 'workflows.db'));
try {
  const { workflow } = openOnboarding(opened.storage, { draft: async (a, required) => draftOffline({ name: a.name, required }), ledger });
  if (phase === 'start') {
    const run = await workflow.createRun({ resourceId: 'learner' });
    const res = await run.start({
      inputData: { lineage: run.runId, applicant: { applicationId: 'A-1', name: 'Ana', email: 'ana@example.com', plan: 'personal' } },
    });
    console.log(JSON.stringify({ pid: process.pid, phase, runId: run.runId, status: res.status }));
  } else {
    const run = await workflow.createRun({ runId: runId!, resourceId: 'learner' });
    const res = await run.resume({
      step: CHECKPOINT_STEP,
      resumeData: {
        documents: [
          { type: 'id-document', fileName: 'passport.pdf' },
          { type: 'proof-of-address', fileName: 'bill.pdf' },
        ],
      },
    });
    const entries = ledger.read(runId!);
    console.log(
      JSON.stringify({
        pid: process.pid,
        phase,
        status: res.status,
        result: res.status === 'success' ? res.result : null,
        counts: countOps(entries),
        pids: Object.fromEntries(entries.map((e) => [e.op, e.pid])),
      }),
    );
  }
} finally {
  await opened.close();
}
process.exit(0);
