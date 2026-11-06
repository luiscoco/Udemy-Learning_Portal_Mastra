import { withLiveCheckpoint } from '../shared/live-checkpoint.js';
import { basename, dirname } from 'node:path';
import { z } from 'zod';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import { LabRegistry, LabRunner, type LabImplementation } from '@mlp/lab-engine';
import type { OpenedMemory } from '@mlp/mastra-runtime';
import { partitionOf, TENANTS_DIR, type LabServices } from '../services.js';
import { lab00 } from '../lab-00/run.js';
import { lab62Definition } from './definition.js';

const NAME = /^[a-z0-9._-]{1,32}$/;
export const Lab62InputSchema = z
  .object({
    learnerA: z.string().trim().toLowerCase().regex(NAME),
    learnerB: z.string().trim().toLowerCase().regex(NAME),
    note: z.string().trim().min(3).max(200),
    hostileOwner: z.string().min(1).max(120),
  })
  .refine((v) => v.learnerA !== v.learnerB, { message: 'Choose two different demo learners', path: ['learnerB'] });
export type Lab62Input = z.infer<typeof Lab62InputSchema>;

export interface Lab62Output {
  /** Demo owner ids: namespaced under the running learner's partition, so they never touch a real learner's data. */
  owners: { a: string; b: string };
  shared: { store: string; bSawThreads: { id: string; title: string }[] };
  partitioned: { store: string; fileA: string; fileB: string; bSawThreads: { id: string; title: string }[] };
  partitions: { a: string; b: string; realA: string };
  hostile: { owner: string; partition: string; parentFolder: string; underTenants: boolean };
  run: { ownerOf: string | null; readableByA: boolean; readableByB: boolean };
}

const THREAD = 'notes';
const RESOURCE = 'learner'; // the same resource and thread id for both learners, on purpose

/** The API's rule for run routes (L61/L62): only the owner may read a run; anyone else gets "not found". */
export const canRead = (runner: { ownerOf(id: string): string | null | undefined }, runId: string, sub: string) =>
  runner.ownerOf(runId) === sub;

/** Store path relative to the tenants root: "<partition>/<file>". */
const rel = (file: string) => `${basename(dirname(file))}/${basename(file)}`;

async function writeNote(opened: OpenedMemory, title: string) {
  await opened.memory.deleteThread(THREAD).catch(() => undefined);
  await opened.memory.createThread({ threadId: THREAD, resourceId: RESOURCE, title });
}
async function threadsFor(opened: OpenedMemory) {
  const res = await opened.memory.listThreads({ filter: { resourceId: RESOURCE }, perPage: false });
  return res.threads.map((t) => ({ id: t.id, title: t.title ?? '' }));
}

const baseLab62: LabImplementation<Lab62Input, Lab62Output, LabServices> = {
  definition: lab62Definition as LabDefinition,
  inputSchema: Lab62InputSchema,

  async run(ctx, input) {
    const ns = `demo:${ctx.services.tenant.partition}`;
    const owners = { a: `${ns}:${input.learnerA}`, b: `${ns}:${input.learnerB}` };
    const opened: OpenedMemory[] = [];
    const open = async (s: LabServices, name: string) => {
      const o = await s.memory.open(name);
      opened.push(o);
      return o;
    };
    try {
      // 1. Anti-pattern: one store for everyone. Ids inside it are just data, so B lists A's thread.
      ctx.emit({ type: 'workflow-step', stepId: 'shared store', status: 'running' });
      const shared = await open(ctx.services, 'lab-62-shared');
      await writeNote(shared, `${input.learnerA}: ${input.note}`);
      const bShared = await threadsFor(shared); // B asks for "learner"'s threads, as A did
      ctx.emit({ type: 'workflow-step', stepId: 'shared store', status: 'success', output: { bSawThreads: bShared.length } });

      // 2. Partitioned: the same store name, but each learner's services resolve to their own file.
      ctx.emit({ type: 'workflow-step', stepId: 'partitioned stores', status: 'running' });
      const sa = ctx.services.forTenant(owners.a);
      const sb = ctx.services.forTenant(owners.b);
      const storeA = await open(sa, 'lab-62-notes');
      const storeB = await open(sb, 'lab-62-notes');
      await writeNote(storeA, `${input.learnerA}: ${input.note}`);
      await storeB.memory.deleteThread(THREAD).catch(() => undefined);
      const bPartitioned = await threadsFor(storeB);
      ctx.emit({
        type: 'workflow-step',
        stepId: 'partitioned stores',
        status: 'success',
        output: { bSawThreads: bPartitioned.length },
      });

      // 3. A hostile owner id cannot steer the path: it is hashed before it reaches the file system.
      ctx.emit({ type: 'workflow-step', stepId: 'hostile owner id', status: 'running' });
      const hostile = ctx.services.forTenant(`${ns}:${input.hostileOwner}`);
      const hostileFile = hostile.memory.file('lab-62-notes');
      const partitionDir = dirname(hostileFile);
      ctx.emit({
        type: 'workflow-step',
        stepId: 'hostile owner id',
        status: 'success',
        output: { partition: hostile.tenant.partition },
      });

      // 4. Runs are owner-bound: the runner records the owner, the API serves the run to that owner only.
      ctx.emit({ type: 'workflow-step', stepId: 'run ownership', status: 'running' });
      const runner = new LabRunner<LabServices>({
        registry: new LabRegistry<LabServices>([lab00 as unknown as LabImplementation<unknown, unknown, LabServices>]),
        services: ctx.services,
        servicesFor: (ownerId) => ctx.services.forTenant(ownerId),
        liveEnabled: false,
      });
      let runInfo: Lab62Output['run'];
      try {
        const r = runner.start('lab-00', { input: lab00.definition.exampleInput }, { ownerId: owners.a });
        await runner.waitFor(r.runId);
        runInfo = {
          ownerOf: runner.ownerOf(r.runId) ?? null,
          readableByA: canRead(runner, r.runId, owners.a),
          readableByB: canRead(runner, r.runId, owners.b),
        };
      } finally {
        await runner.dispose();
      }
      ctx.emit({
        type: 'workflow-step',
        stepId: 'run ownership',
        status: 'success',
        output: { readableByB: runInfo.readableByB },
      });

      return {
        owners,
        shared: { store: rel(shared.file), bSawThreads: bShared },
        partitioned: { store: 'lab-62-notes', fileA: rel(storeA.file), fileB: rel(storeB.file), bSawThreads: bPartitioned },
        partitions: { a: sa.tenant.partition, b: sb.tenant.partition, realA: partitionOf(`dev:${input.learnerA}`) },
        hostile: {
          owner: input.hostileOwner,
          partition: hostile.tenant.partition,
          parentFolder: basename(dirname(partitionDir)),
          underTenants: basename(dirname(partitionDir)) === TENANTS_DIR && basename(partitionDir) === hostile.tenant.partition,
        },
        run: runInfo,
      };
    } finally {
      await Promise.all(opened.map((o) => o.close().catch(() => undefined)));
    }
  },

  validate(out, input) {
    const note = `${input.learnerA}: ${input.note}`;
    const hex = /^[0-9a-f]{24}$/;
    return summarizeChecks([
      {
        id: 'shared-store-leaks',
        label: 'Anti-pattern shown: in one shared store, learner B lists learner A’s thread (same ids)',
        passed: out.shared.bSawThreads.some((t) => t.title === note),
        message: `B saw ${out.shared.bSawThreads.length} thread(s) in the shared store`,
      },
      {
        id: 'partitions-isolate',
        label: 'With partitioned stores, learner B sees none of learner A’s threads',
        passed: out.partitioned.bSawThreads.length === 0,
        message: `B saw ${out.partitioned.bSawThreads.length} thread(s) in his own partition`,
      },
      {
        id: 'same-name-different-files',
        label: 'The same store name resolves to a different file per learner',
        passed: out.partitioned.fileA !== out.partitioned.fileB && out.partitioned.fileA.startsWith(`${out.partitions.a}/`),
        message: `${out.partitioned.fileA} vs ${out.partitioned.fileB}`,
      },
      {
        id: 'partition-ids-hashed',
        label: 'Partition ids are fixed-length hashes; no learner name appears in a path',
        passed:
          hex.test(out.partitions.a) &&
          hex.test(out.partitions.b) &&
          ![out.partitioned.fileA, out.partitioned.fileB].some((f) => f.includes(input.learnerA) || f.includes(input.learnerB)),
        message: `${out.partitions.a}, ${out.partitions.b}`,
      },
      {
        id: 'hostile-id-contained',
        label: 'A traversal-looking owner id stays inside the tenants folder',
        passed: out.hostile.underTenants && hex.test(out.hostile.partition),
        message: `${JSON.stringify(out.hostile.owner)} → ${out.hostile.parentFolder}/${out.hostile.partition}`,
      },
      {
        id: 'run-owner-enforced',
        label: 'A run belongs to its owner: A may read it, B may not',
        passed: out.run.ownerOf === out.owners.a && out.run.readableByA && !out.run.readableByB,
        message: `owner ${out.run.ownerOf}; readable by B: ${out.run.readableByB}`,
      },
      {
        id: 'demo-namespaced',
        label: 'Demo learners live under the running learner’s partition, never in a real learner’s partition',
        passed: out.partitions.a !== out.partitions.realA && out.owners.a.startsWith('demo:'),
        message: `demo ${out.partitions.a} ≠ real dev:${input.learnerA} ${out.partitions.realA}`,
      },
    ]);
  },
};

export const lab62 = withLiveCheckpoint(baseLab62);
