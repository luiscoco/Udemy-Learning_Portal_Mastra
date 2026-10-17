import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import { dataDir } from '../paths.js';
import type { LabServices } from '../services.js';
import { usageOf, withLabLogger } from '../shared/agent-kit.js';
import { simulatedAnswer } from '../shared/simulated.js';
import { lab07Definition } from './definition.js';
import { listComparisons, saveComparison, type SavedComparisonSummary } from './store.js';

const label = z.string().trim().min(1, 'Give the variant a short label').max(40);
const instructions = z.string().trim().min(10, 'Write at least one sentence of instructions').max(2000);

export const Lab07InputSchema = z.object({
  modelId: z.enum(DEFAULT_LIVE_MODELS),
  prompt: z.string().trim().min(1, 'The prompt must not be empty').max(1000),
  labelA: label,
  instructionsA: instructions,
  labelB: label,
  instructionsB: instructions,
});
export type Lab07Input = z.infer<typeof Lab07InputSchema>;

export interface VariantResult {
  label: string;
  configHash: string;
  config: { modelId: string; instructionsSha256: string; instructionsChars: number; settings: Settings };
  instructions: string;
  output: string;
  durationMs: number;
  usage?: { inputTokens?: number; outputTokens?: number; totalTokens?: number };
}

interface Settings {
  modelId: string;
  maxSteps: number;
}

export interface Lab07Output {
  comparisonId: string;
  settings: Settings & { mode: string; simulated: boolean };
  prompt: string;
  variants: [VariantResult, VariantResult];
  identicalSettingsVerified: boolean | null;
  outputsDiffer: boolean;
  saved: { id: string; file: string };
  recentComparisons: SavedComparisonSummary[];
}

const sha12 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12);

/** Stable hash of everything that defines a variant's behaviour. */
export function configHash(labelText: string, modelId: string, instr: string, settings: Settings): string {
  return sha12(JSON.stringify({ label: labelText, modelId, instructions: instr, settings }));
}

export function comparisonsDir(): string {
  return join(dataDir(), 'comparisons');
}

export const lab07: LabImplementation<Lab07Input, Lab07Output, LabServices> = {
  definition: lab07Definition as LabDefinition,
  inputSchema: Lab07InputSchema,

  async run(ctx, input) {
    // One settings object shared by both variants: only the instructions differ.
    const settings: Settings = { modelId: input.modelId, maxSteps: 1 };
    const seen: { system: string; user: string; modelId: string }[] = [];
    let simulated = true;

    const runVariant = async (key: 'A' | 'B'): Promise<VariantResult> => {
      const variantLabel = key === 'A' ? input.labelA : input.labelB;
      const variantInstructions = key === 'A' ? input.instructionsA : input.instructionsB;
      const hash = configHash(variantLabel, settings.modelId, variantInstructions, settings);
      ctx.emit({
        type: 'workflow-step',
        stepId: `variant-${key}`,
        status: 'running',
        input: { label: variantLabel, configHash: hash },
      });
      const resolved = ctx.services.models.resolve({
        mode: ctx.mode,
        modelId: settings.modelId,
        offline: (view) => ({ text: simulatedAnswer({ modelId: settings.modelId, system: view.system, user: view.lastUser }) }),
      });
      simulated = resolved.simulated;
      const agent = withLabLogger(
        ctx,
        new Agent({
          id: `variant-${key.toLowerCase()}`,
          name: variantLabel,
          instructions: variantInstructions,
          model: resolved.model,
        }),
      );
      const started = Date.now();
      const res = await agent.generate(input.prompt, { abortSignal: ctx.signal, maxSteps: settings.maxSteps });
      const durationMs = Date.now() - started;
      const call = resolved.scripted?.calls[0];
      if (call) seen.push({ system: call.system, user: call.lastUser, modelId: settings.modelId });
      ctx.log('info', `Variant ${key} "${variantLabel}" (config ${hash}): ${res.text.length} characters in ${durationMs} ms`);
      ctx.emit({ type: 'workflow-step', stepId: `variant-${key}`, status: 'success', durationMs, output: { configHash: hash } });
      return {
        label: variantLabel,
        configHash: hash,
        config: {
          modelId: settings.modelId,
          instructionsSha256: sha12(variantInstructions),
          instructionsChars: variantInstructions.length,
          settings,
        },
        instructions: variantInstructions,
        output: res.text,
        durationMs,
        ...(res.usage ? { usage: usageOf(res.usage) } : {}),
      };
    };

    const a = await runVariant('A');
    const b = await runVariant('B');

    const identicalSettingsVerified =
      seen.length === 2 ? seen[0]!.user === seen[1]!.user && seen[0]!.modelId === seen[1]!.modelId : null;

    ctx.emit({ type: 'workflow-step', stepId: 'save-comparison', status: 'running' });
    const record = {
      id: ctx.runId,
      savedAt: new Date().toISOString(),
      settings: { ...settings, mode: ctx.mode, simulated },
      prompt: input.prompt,
      variants: [a, b],
    };
    const dir = comparisonsDir();
    await saveComparison(dir, ctx.runId, record);
    const recentComparisons = await listComparisons(dir);
    ctx.emit({ type: 'workflow-step', stepId: 'save-comparison', status: 'success', output: { id: ctx.runId } });

    ctx.setResultExtras({ effective: { ...settings, mode: ctx.mode, simulated }, annotations: { modelCalls: 2 } });
    return {
      comparisonId: ctx.runId,
      settings: { ...settings, mode: ctx.mode, simulated },
      prompt: input.prompt,
      variants: [a, b],
      identicalSettingsVerified,
      outputsDiffer: a.output !== b.output,
      saved: { id: ctx.runId, file: `comparisons/${ctx.runId}.json` },
      recentComparisons,
    };
  },

  validate(out, input) {
    const [a, b] = out.variants;
    const instructionsDiffer = input.instructionsA.trim() !== input.instructionsB.trim();
    return summarizeChecks([
      {
        id: 'both-outputs',
        label: 'Both variants produced an output',
        passed: a.output.trim().length > 0 && b.output.trim().length > 0,
      },
      {
        id: 'identical-settings',
        label: 'Model, prompt and settings were identical for both variants',
        passed: out.identicalSettingsVerified !== false && a.config.modelId === b.config.modelId,
        message:
          out.identicalSettingsVerified === null
            ? 'Not observable in live mode; both used one shared settings object.'
            : undefined,
      },
      {
        id: 'variants-differ',
        label: 'The two variants use different instructions',
        passed: instructionsDiffer,
        message: instructionsDiffer
          ? undefined
          : 'Both variants have the same instructions — change one so the comparison means something.',
      },
      {
        id: 'outputs-linked',
        label: 'Each output is linked to its configuration (configHash)',
        passed:
          [a, b].every((v) => v.configHash === configHash(v.label, v.config.modelId, v.instructions, v.config.settings)) &&
          a.configHash !== b.configHash,
        message: `${a.label}: ${a.configHash} · ${b.label}: ${b.configHash}`,
      },
      {
        id: 'comparison-saved',
        label: 'The comparison was saved and appears in the recent list',
        passed: out.recentComparisons.some((c) => c.id === out.saved.id),
        message: out.saved.file,
      },
    ]);
  },
};
