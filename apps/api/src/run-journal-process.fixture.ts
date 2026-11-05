import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LabRegistry, LabRunner, makeTestLab, LabError } from '@mlp/lab-engine';
import { SqliteRunJournal } from './run-journal.js';

const [mode, root, runId, approvalId] = process.argv.slice(2) as [string, string, string?, string?];
let journal: SqliteRunJournal;
try {
  journal = new SqliteRunJournal(root, { secret: process.env.RUN_TEST_SECRET! });
} catch {
  if (mode === 'compete') {
    process.stdout.write(JSON.stringify({ locked: true }));
    process.exit(0);
  }
  throw new Error('Test journal failed to open');
}
if (mode === 'compete') {
  journal.close();
  process.stdout.write(JSON.stringify({ locked: false }));
  process.exit(0);
}
const lab = makeTestLab();
const runner = new LabRunner({
  registry: new LabRegistry([
    {
      ...lab,
      async run(ctx, input) {
        const decision = await ctx.requestApproval({ toolName: 'write-test-marker', args: {}, message: 'Write marker?' });
        if (decision.decision === 'approve') writeFileSync(join(root, 'side-effect.txt'), 'executed');
        return { echo: input.text };
      },
    },
  ]),
  services: {},
  liveEnabled: false,
  persistence: journal,
});
if (mode === 'pending') {
  const run = runner.start('lab-99', { input: { text: 'hello' } }, { ownerId: 'dev:alice' });
  const pending = runner.events(run.runId).find((e) => e.type === 'approval-request');
  process.on('message', () => {}); // Keep the process alive until the parent terminates it, without graceful disposal.
  process.send?.({ runId: run.runId, approvalId: pending?.type === 'approval-request' ? pending.approvalId : null });
} else {
  let lateCode = '';
  try {
    runner.resolveApproval(runId!, approvalId!, 'approve');
  } catch (error) {
    lateCode = error instanceof LabError ? error.code : 'unexpected';
  }
  process.stdout.write(
    JSON.stringify({
      snapshot: runner.get(runId!),
      events: runner.events(runId!),
      lateCode,
      sideEffect: existsSync(join(root, 'side-effect.txt')),
    }),
  );
  await runner.dispose();
}
