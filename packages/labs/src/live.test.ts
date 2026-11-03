// Live provider tests: real model calls with the API keys in the repo-root .env.
// Skipped unless RUN_LIVE_TESTS=1 (they cost money and need network). Run: npm run test:live
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import type { ExecutionEvent } from '@mlp/contracts';
import { LabRunner } from '@mlp/lab-engine';
import { allLabs, createLabRegistry, createLabServices, labsPackageDir } from './index.js';
import { testMemoryDir } from './test-memory.js';

const LIVE = process.env.RUN_LIVE_TESTS === '1';
const envFile = join(labsPackageDir(), '..', '..', '.env');
if (LIVE && existsSync(envFile)) process.loadEnvFile(envFile);

const hasOpenAI = Boolean(process.env.OPENAI_API_KEY);
const hasAnthropic = Boolean(process.env.ANTHROPIC_API_KEY);

const secrets = [process.env.OPENAI_API_KEY, process.env.ANTHROPIC_API_KEY, process.env.GOOGLE_API_KEY].filter((v): v is string =>
  Boolean(v && v.length >= 8),
);

const runner = new LabRunner({
  registry: createLabRegistry(),
  services: createLabServices({ serverMode: 'live', env: process.env, memoryDir: testMemoryDir('live') }),
  liveEnabled: true,
  maxConcurrentRuns: 2,
  secrets,
});
afterAll(() => runner.dispose());

/** Live input per lab: the example input with models the configured keys can actually call. */
function liveInput(labId: string, example: Record<string, unknown>): Record<string, unknown> | null {
  const openai = 'openai/gpt-5-mini';
  const anthropic = 'anthropic/claude-haiku-4-5';
  switch (labId) {
    case 'lab-03':
    case 'lab-06':
      return hasOpenAI ? { ...example, modelId: openai } : hasAnthropic ? { ...example, modelId: anthropic } : null;
    case 'lab-04':
      return hasOpenAI && hasAnthropic ? { ...example, modelId: openai, compareModelId: anthropic } : null;
    case 'lab-14':
      // Real model + the real Open-Meteo API (free, no key). Upstream 503s are handled, not failures.
      return { ...example, dataSource: 'open-meteo', timeoutMs: 8000 };
    case 'lab-10':
      // Real providers need realistic per-attempt timeouts (reasoning models can take several seconds).
      return { ...example, scenario: 'none', perAttemptTimeoutMs: 10000, totalBudgetMs: 30000 };
    case 'lab-69':
      // A real voice round trip: OpenAI speaks the sample, whisper-1 transcribes it, tts-1 speaks the answer.
      return hasOpenAI ? { ...example, voice: 'openai', modelId: openai } : null;
    case 'lab-57':
      // The scorer never calls a model; exercise the live path through the agent-written answer.
      return { ...example, answerSource: 'agent' };
    default:
      return { ...example };
  }
}

const liveLabs = allLabs.filter((l) => l.implementation.definition.execution.modes.includes('live'));

describe.skipIf(!LIVE)('live provider runs', () => {
  it('has at least one provider key configured', () => {
    expect(hasOpenAI || hasAnthropic).toBe(true);
  });

  it.each(liveLabs.map((l) => [l.implementation.definition.id, l] as const))(
    '%s example runs live and passes its checks',
    async (labId, lab) => {
      const input = liveInput(labId, lab.implementation.definition.exampleInput);
      if (!input) return; // the needed provider key is not configured
      const run = runner.start(labId, { input, mode: 'live' });
      const snap = await runner.waitFor(run.runId);
      const events: readonly ExecutionEvent[] = runner.events(run.runId);
      const result = events.find((e) => e.type === 'result');
      const error = events.find((e) => e.type === 'error');
      expect(snap.status, JSON.stringify(error)).toBe('succeeded');
      expect(
        result?.type === 'result' && result.validation?.passed,
        JSON.stringify(result?.type === 'result' ? result.validation : null),
      ).toBe(true);
      // Live runs report themselves as not simulated, and never leak keys into events.
      expect(JSON.stringify(result)).toContain('"simulated":false');
      for (const s of secrets) expect(JSON.stringify(events)).not.toContain(s);
    },
    90_000,
  );

  it.skipIf(!hasOpenAI)(
    'lab-15 pauses a real model run for a human decision and resumes it',
    async () => {
      const lab = allLabs.find((l) => l.implementation.definition.id === 'lab-15')!;
      const input = { ...lab.implementation.definition.exampleInput, userDecision: 'ask', modelId: 'openai/gpt-5-mini' };
      const run = runner.start('lab-15', { input, mode: 'live' });
      let approvalId = '';
      for (let i = 0; i < 600 && !approvalId && runner.get(run.runId)?.status === 'running'; i++) {
        const e = runner.events(run.runId).find((x) => x.type === 'approval-request');
        if (e?.type === 'approval-request') approvalId = e.approvalId;
        else await new Promise((r) => setTimeout(r, 100));
      }
      expect(approvalId, 'the live model never requested the refund').not.toBe('');
      runner.resolveApproval(run.runId, approvalId, 'approve');
      const snap = await runner.waitFor(run.runId);
      const result = runner.events(run.runId).find((e) => e.type === 'result');
      expect(snap.status).toBe('succeeded');
      expect(result).toMatchObject({ validation: { passed: true }, output: { refundExecutions: 1 } });
    },
    90_000,
  );
});
