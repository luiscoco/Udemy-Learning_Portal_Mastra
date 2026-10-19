import { z } from 'zod';
import { Mastra } from '@mastra/core';
import { Agent } from '@mastra/core/agent';
import { noopLogger } from '@mastra/core/logger';
import { LibSQLStore } from '@mastra/libsql';
import { summarizeChecks, type EvalItem, type EvalReport, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation, RunContext } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import { OFFLINE_PROVIDER, type LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { KeyedLock } from '../shared/keyed-lock.js';
import { searchTool } from '../lab-56/pipeline.js';
import { AGENT_ID, FAQ_INSTRUCTIONS, faqScript } from './agent.js';
import { ensureDataset, itemsOf, type SeedResult } from './dataset.js';
import { lab58Definition } from './definition.js';
import { AssertionsSchema, DATASET_ID, LATEST_REVISION } from './scenarios.js';
import {
  answerText,
  createAssertionsScorer,
  createDatasetRubricScorer,
  createProvenanceScorer,
  evaluateAssertions,
  PROVENANCE_ID,
} from './scorers.js';

export const STORE = 'lab-58-datasets';
export const Lab58InputSchema = z.object({
  revision: z.enum(['latest', '1', '2']),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab58Input = z.infer<typeof Lab58InputSchema>;

export interface Lab58Output {
  seed: { created: boolean; applied: SeedResult['applied']; reseedApplied: number };
  requestedVersion: number;
  itemsAtVersion: { itemId: string; externalId: string | null; datasetVersion: number; groundTruth: unknown }[];
  recorded: { found: boolean; status: string | null; datasetVersion: number | null; totalItems: number | null };
  replay: { signatures: string[]; providers: string[] };
  evalReport: EvalReport;
}

const lock = new KeyedLock();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Summary = { experimentId: string; status: string; startedAt: Date | string; completedAt: Date | string; results: any[] };

const iso = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString();
/** The provider that produced an item's answer, as the provenance scorer read it (OFFLINE_PROVIDER = the mock provider). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const providerOf = (result: any): string =>
  String((result.scores ?? []).find((s: { scorerId: string }) => s.scorerId === PROVENANCE_ID)?.reason ?? 'unknown');

async function itemsOfReport(
  summary: Summary,
  titles: Map<string, { externalId: string | null; title: string | null }>,
): Promise<EvalItem[]> {
  const items: EvalItem[] = [];
  for (const r of summary.results) {
    const answer = answerText(r.output);
    const gt = AssertionsSchema.safeParse(r.groundTruth);
    const assertions = gt.success ? await evaluateAssertions(answer, gt.data) : [];
    const error = r.error ? String(r.error.message ?? r.error).slice(0, 300) : null;
    const meta = titles.get(r.itemId);
    items.push({
      itemId: r.itemId,
      externalId: meta?.externalId ?? null,
      title: meta?.title ?? null,
      itemVersion: typeof r.itemVersion === 'number' ? r.itemVersion : null,
      input: typeof r.input === 'string' ? r.input : JSON.stringify(r.input).slice(0, 5_000),
      answer: answer.slice(0, 5_000),
      scores: (r.scores ?? []).map(
        (s: { scorerId: string; score: number | null; reason: string | null; notScorable?: { reason?: string } | null }) => ({
          scorerId: s.scorerId,
          score: s.score ?? null,
          reason: s.reason ? String(s.reason).slice(0, 2_000) : null,
          notScorable: s.notScorable?.reason ?? null,
        }),
      ),
      assertions,
      passed: !error && assertions.length > 0 && assertions.every((a) => a.passed),
      durationMs:
        r.startedAt && r.completedAt ? Math.max(0, new Date(r.completedAt).getTime() - new Date(r.startedAt).getTime()) : null,
      error,
    });
  }
  return items.sort((a, b) => String(a.externalId).localeCompare(String(b.externalId)));
}

const signatureOf = (items: EvalItem[]) =>
  items
    .map((i) => `${i.externalId}:${i.passed}:${i.scores.map((s) => `${s.scorerId}=${s.score ?? 'n/a'}`).join(',')}`)
    .join(' | ');

export const lab58: LabImplementation<Lab58Input, Lab58Output, LabServices> = {
  definition: lab58Definition as LabDefinition,
  inputSchema: Lab58InputSchema,

  async run(ctx, input) {
    const file = ctx.services.memory.file(STORE);
    return lock.run(
      file,
      async () => {
        const storage = new LibSQLStore({ id: STORE, url: `file:${file}` });
        const agentFor = (offline: boolean) => {
          const m = offline
            ? ctx.services.models.resolve({ mode: 'offline', modelId: input.modelId, offline: faqScript() })
            : ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: faqScript() });
          return {
            agent: withLabLogger(
              ctx as RunContext<unknown>,
              new Agent({
                id: AGENT_ID,
                name: 'FAQ agent',
                instructions: FAQ_INSTRUCTIONS,
                model: m.model,
                tools: { search_sources: searchTool('none') },
              }),
            ),
            simulated: m.simulated,
          };
        };
        const main = agentFor(false);
        const mastra = new Mastra({ agents: { [AGENT_ID]: main.agent }, logger: noopLogger, storage });

        ctx.emit({ type: 'workflow-step', stepId: 'seed dataset', status: 'running' });
        const seed = await ensureDataset(mastra);
        const reseed = await ensureDataset(mastra); // must be a no-op: the seed is idempotent
        const version = input.revision === 'latest' ? seed.version : seed.meta.revisionVersions[input.revision];
        if (!version) throw new Error(`Revision ${input.revision} has no dataset version`);
        const atVersion = await itemsOf(seed.dataset, version);
        ctx.emit({
          type: 'workflow-step',
          stepId: 'seed dataset',
          status: 'success',
          output: {
            created: seed.created,
            applied: seed.applied.length,
            latestVersion: seed.version,
            runVersion: version,
            items: atVersion.length,
          },
        });
        for (const a of seed.applied)
          ctx.log('info', `seed revision ${a.revision}: ${a.op} ${a.externalId} → dataset version ${a.version}`);

        const scorers = [createDatasetRubricScorer(), createAssertionsScorer(), createProvenanceScorer()];
        const experiment = (persist: boolean) =>
          seed.dataset.startExperiment({
            version,
            targetType: 'agent',
            targetId: AGENT_ID,
            scorers,
            maxConcurrency: 2,
            itemTimeout: 60_000,
            name: persist ? `lab-58 ${ctx.mode} run` : 'lab-58 reproducibility replay',
            metadata: { labRunId: ctx.runId, correlationId: ctx.correlationId },
            signal: ctx.signal,
            ...(persist ? {} : { persistence: { experiments: 'none', scores: 'none' } }),
          } as never) as Promise<Summary>;

        ctx.emit({ type: 'workflow-step', stepId: `experiment on version ${version}`, status: 'running' });
        const summary = await experiment(true);
        const titles = new Map(
          atVersion.map((i) => [
            i.id,
            { externalId: i.externalId ?? null, title: String((i.metadata as { title?: string } | null)?.title ?? '') || null },
          ]),
        );
        const items = await itemsOfReport(summary, titles);
        ctx.emit({
          type: 'workflow-step',
          stepId: `experiment on version ${version}`,
          status: summary.status === 'completed' ? 'success' : 'failed',
          output: { passed: items.filter((i) => i.passed).length, total: items.length },
        });

        // Reproducibility: replay the same version on the mock provider (twice when the main run was live).
        const offlineMastra = new Mastra({ agents: { [AGENT_ID]: agentFor(true).agent }, logger: noopLogger, storage });
        const offlineDataset = await offlineMastra.datasets.get({ id: DATASET_ID });
        const replayProviders = new Set<string>();
        const replayOnce = async () => {
          const s = (await offlineDataset.startExperiment({
            version,
            targetType: 'agent',
            targetId: AGENT_ID,
            scorers,
            maxConcurrency: 2,
            name: 'lab-58 reproducibility replay',
            persistence: { experiments: 'none', scores: 'none' },
          } as never)) as Summary;
          for (const r of s.results) replayProviders.add(providerOf(r));
          return itemsOfReport(s, titles);
        };
        ctx.emit({ type: 'workflow-step', stepId: 'offline replay', status: 'running' });
        const replays = ctx.mode === 'offline' ? [items, await replayOnce()] : [await replayOnce(), await replayOnce()];
        ctx.emit({
          type: 'workflow-step',
          stepId: 'offline replay',
          status: 'success',
          output: { identical: new Set(replays.map(signatureOf)).size === 1 },
        });

        const listed = (await seed.dataset.listExperiments({ perPage: 100 } as never)) as {
          experiments: { id: string; status: string; datasetVersion: number; totalItems: number }[];
        };
        const rec = listed.experiments.find((e) => e.id === summary.experimentId);
        const details = await seed.dataset.getDetails();
        const versions = (await seed.dataset.listVersions({ perPage: 200 } as never)) as {
          versions: { version: number; createdAt: Date | string }[];
        };
        ctx.setResultExtras({
          effective: {
            mode: ctx.mode,
            modelId: input.modelId,
            simulated: main.simulated,
            datasetVersion: version,
            store: 'LibSQLStore (lab memory file)',
          },
        });

        const passed = items.filter((i) => i.passed).length;
        const errored = items.filter((i) => i.error).length;
        const startedAt = iso(summary.startedAt);
        const completedAt = iso(summary.completedAt);
        const revision = Number(Object.entries(seed.meta.revisionVersions).find(([, v]) => v === version)?.[0] ?? NaN);
        return {
          seed: { created: seed.created, applied: seed.applied, reseedApplied: reseed.applied.length },
          requestedVersion: version,
          itemsAtVersion: atVersion.map((i) => ({
            itemId: i.id,
            externalId: i.externalId ?? null,
            datasetVersion: i.datasetVersion,
            groundTruth: i.groundTruth,
          })),
          recorded: {
            found: !!rec,
            status: rec?.status ?? null,
            datasetVersion: rec?.datasetVersion ?? null,
            totalItems: rec?.totalItems ?? null,
          },
          replay: { signatures: replays.map(signatureOf), providers: [...replayProviders] },
          evalReport: {
            dataset: {
              id: DATASET_ID,
              name: details.name,
              version: details.version,
              seedRevision: seed.meta.seedRevision,
              revisionVersions: seed.meta.revisionVersions,
              versions: versions.versions
                .map((v) => ({ version: v.version, createdAt: iso(v.createdAt) }))
                .sort((a, b) => a.version - b.version),
            },
            experiment: {
              id: summary.experimentId,
              datasetVersion: version,
              revision: Number.isFinite(revision) ? revision : null,
              status: summary.status,
              targetId: AGENT_ID,
              provider: [...new Set(summary.results.map((r) => providerOf(r)))].join(', '),
              startedAt,
              completedAt,
              durationMs: Math.max(0, new Date(completedAt).getTime() - new Date(startedAt).getTime()),
            },
            items,
            summary: {
              total: items.length,
              passed,
              failed: items.length - passed,
              errored,
              passRate: items.length ? Math.round((passed / items.length) * 10_000) / 10_000 : 0,
            },
          },
        };
      },
      ctx.signal,
    );
  },

  validate(out, input, vctx) {
    const r = out.evalReport;
    const rv = r.dataset.revisionVersions;
    const versionedOk =
      r.dataset.versions.length >= 2 &&
      !!rv['1'] &&
      !!rv[String(LATEST_REVISION)] &&
      rv['1']! < rv[String(LATEST_REVISION)]! &&
      r.dataset.seedRevision === LATEST_REVISION &&
      out.seed.reseedApplied === 0;

    const expectedItems = input.revision === '1' ? 3 : 4;
    const toolValidation = out.itemsAtVersion.find((i) => i.externalId === 'tool-validation');
    const minScore = (toolValidation?.groundTruth as { minScore?: number } | undefined)?.minScore;
    const pinnedOk =
      r.experiment.datasetVersion === out.requestedVersion &&
      out.itemsAtVersion.length === expectedItems &&
      r.items.length === expectedItems &&
      r.items.every((i) => i.itemVersion === null || i.itemVersion <= out.requestedVersion) &&
      minScore === (input.revision === '1' ? 0.5 : 0.7);

    const mode = vctx?.mode ?? 'offline';
    const providers = r.experiment.provider.split(', ');
    // The main run's provider depends on the mode; the replay is always on the mock provider.
    const mainOk =
      mode === 'offline'
        ? providers.every((p) => p === OFFLINE_PROVIDER)
        : providers.every((p) => p !== OFFLINE_PROVIDER && p !== 'unknown');
    const mockOk = mainOk && out.replay.providers.length > 0 && out.replay.providers.every((p) => p === OFFLINE_PROVIDER);

    const assertionsOk =
      r.items.length > 0 &&
      r.items.every((i) => {
        const a = i.scores.find((s) => s.scorerId === 'scenario-assertions');
        const rub = i.scores.find((s) => s.scorerId === 'scenario-rubric');
        const gt = out.itemsAtVersion.find((x) => x.itemId === i.itemId)?.groundTruth as { rubricId?: string | null } | undefined;
        return (
          !!a &&
          a.score !== null &&
          i.assertions.length > 0 &&
          i.assertions.every((x) => a.reason?.includes(x.label)) &&
          i.passed === i.assertions.every((x) => x.passed) &&
          !!rub &&
          (gt?.rubricId ? rub.score !== null : rub.notScorable !== null)
        );
      });

    const recordedOk =
      out.recorded.found &&
      out.recorded.status === 'completed' &&
      out.recorded.datasetVersion === out.requestedVersion &&
      out.recorded.totalItems === r.items.length;
    const reproducibleOk = out.replay.signatures.length === 2 && new Set(out.replay.signatures).size === 1;

    return summarizeChecks([
      {
        id: 'dataset-versioned',
        label: 'The dataset is stored with one version per seed revision, and reseeding is a no-op',
        passed: versionedOk,
        message: `versions ${r.dataset.versions.map((v) => v.version).join(', ')}; revisions ${JSON.stringify(rv)}; reseed applied ${out.seed.reseedApplied}`,
      },
      {
        id: 'version-pinned',
        label: 'The experiment ran on the requested dataset version and its scenarios',
        passed: pinnedOk,
        message: `revision ${input.revision} → version ${out.requestedVersion}: ${r.items.length} item(s); tool-validation minScore ${minScore}`,
      },
      {
        id: 'runs-on-mock-provider',
        label: 'Offline, every answer comes from the mock provider (no external LLM); live, from a real provider',
        passed: mockOk,
        message: `${mode}: provider ${r.experiment.provider}; replay provider ${out.replay.providers.join(', ') || 'none'}`,
      },
      {
        id: 'assertions-evaluated',
        label: 'Every scenario is scored by the rubric and assertions scorers, with each assertion explained',
        passed: assertionsOk,
        message: `${r.summary.passed}/${r.summary.total} scenarios pass (pass rate ${r.summary.passRate})`,
      },
      {
        id: 'experiment-recorded',
        label: 'The experiment is recorded in the dataset with its version',
        passed: recordedOk,
        message: `found ${out.recorded.found}, status ${out.recorded.status}, version ${out.recorded.datasetVersion}`,
      },
      {
        id: 'reproducible',
        label: 'Replaying the same version on the mock provider gives the same per-scenario outcomes',
        passed: reproducibleOk,
        message: reproducibleOk ? 'identical' : out.replay.signatures.join(' ≠ '),
      },
    ]);
  },
};
