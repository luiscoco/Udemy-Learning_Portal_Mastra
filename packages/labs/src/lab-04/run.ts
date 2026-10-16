import { createHash } from 'node:crypto';
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { checkModelId, DEFAULT_LIVE_MODELS, liveModelCatalog } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { simulatedAnswer } from '../shared/simulated.js';
import { lab04Definition } from './definition.js';

/** Model id validated against the installed Mastra provider registry, with suggestions on failure. */
export const ModelIdSchema = z
  .string()
  .trim()
  .min(3)
  .max(80)
  .superRefine((id, ctx) => {
    const c = checkModelId(id);
    if (!c.ok) {
      ctx.addIssue({
        code: 'custom',
        message: `${c.reason} Tested ids: ${DEFAULT_LIVE_MODELS.join(', ')}.`,
      });
    }
  });

export const Lab04InputSchema = z.object({
  modelId: ModelIdSchema,
  compareModelId: z.enum(DEFAULT_LIVE_MODELS),
  instructions: z.string().trim().min(10, 'Write at least one sentence of instructions').max(2000),
  prompt: z.string().trim().min(1, 'Ask something').max(500),
});
export type Lab04Input = z.infer<typeof Lab04InputSchema>;

interface Variant {
  modelId: string;
  provider: string;
  simulated: boolean;
  text: string;
  supportsTemperature: boolean | undefined;
  supportsStructuredOutput: boolean | undefined;
  durationMs: number;
}

export interface Lab04Output {
  primary: Variant;
  comparison: Variant;
  sameInputDelivered: boolean | null;
  record: {
    mode: string;
    models: string[];
    instructionsSha256: string;
    instructionsChars: number;
    promptChars: number;
  };
}

export const sha12 = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 12);

export const lab04: LabImplementation<Lab04Input, Lab04Output, LabServices> = {
  definition: lab04Definition as LabDefinition,
  inputSchema: Lab04InputSchema,

  preflight() {
    const { models } = liveModelCatalog(process.env);
    return [
      {
        id: 'live-models',
        label: 'Models enabled for live runs (LIVE_MODELS)',
        passed: true,
        message: models.map((m) => `${m.id} (${m.configured ? 'key configured' : `needs ${m.apiKeyEnvVar}`})`).join('; '),
      },
    ];
  },

  async run(ctx, input) {
    const runVariant = async (
      modelId: string,
      step: string,
    ): Promise<{ v: Variant; seen?: { system: string; user: string } }> => {
      ctx.emit({ type: 'workflow-step', stepId: step, status: 'running', input: { modelId } });
      const resolved = ctx.services.models.resolve({
        mode: ctx.mode,
        modelId,
        offline: (view) => ({ text: simulatedAnswer({ modelId, system: view.system, user: view.lastUser }) }),
      });
      const agent = new Agent({
        id: `${step}-agent`,
        name: `Agent (${modelId})`,
        instructions: input.instructions,
        model: resolved.model,
      });
      const started = Date.now();
      const res = await agent.generate(input.prompt, { abortSignal: ctx.signal });
      const durationMs = Date.now() - started;
      const check = checkModelId(modelId);
      ctx.log('info', `${modelId}${resolved.simulated ? ' (simulated)' : ''}: ${res.text.length} characters in ${durationMs} ms`);
      ctx.emit({ type: 'workflow-step', stepId: step, status: 'success', durationMs, output: { characters: res.text.length } });
      const call = resolved.scripted?.calls[0];
      return {
        v: {
          modelId,
          provider: modelId.split('/')[0]!,
          simulated: resolved.simulated,
          text: res.text,
          supportsTemperature: check.ok ? check.supportsTemperature : undefined,
          supportsStructuredOutput: check.ok ? check.supportsStructuredOutput : undefined,
          durationMs,
        },
        seen: call ? { system: call.system, user: call.lastUser } : undefined,
      };
    };

    const a = await runVariant(input.modelId, 'primary-model');
    const b = await runVariant(input.compareModelId, 'comparison-model');
    const record = {
      mode: ctx.mode,
      models: [input.modelId, input.compareModelId],
      instructionsSha256: sha12(input.instructions),
      instructionsChars: input.instructions.length,
      promptChars: input.prompt.length,
    };
    ctx.setResultExtras({ effective: record, annotations: { modelCalls: 2 } });
    return {
      primary: a.v,
      comparison: b.v,
      sameInputDelivered: a.seen && b.seen ? a.seen.system === b.seen.system && a.seen.user === b.seen.user : null,
      record,
    };
  },

  validate(out, input) {
    const recordJson = JSON.stringify(out.record);
    const secretShaped = /(sk-[A-Za-z0-9-]{8,}|AIza[0-9A-Za-z_-]{10,})/.test(recordJson);
    const envValues = Object.entries(process.env)
      .filter(([k, v]) => /_API_KEY$/.test(k) && v && v.length >= 8)
      .map(([, v]) => v!);
    return summarizeChecks([
      {
        id: 'models-supported',
        label: 'Both model ids exist in the installed Mastra registry',
        passed: [out.primary.modelId, out.comparison.modelId].every((id) => checkModelId(id).ok),
      },
      {
        id: 'both-outputs',
        label: 'Both models produced an answer for the same prompt',
        passed: out.primary.text.length > 0 && out.comparison.text.length > 0,
      },
      {
        id: 'same-input',
        label: 'Both models received identical instructions and prompt',
        passed: out.sameInputDelivered !== false,
        message:
          out.sameInputDelivered === null
            ? 'Not observable in live mode; both agents were built from the same values.'
            : undefined,
      },
      {
        id: 'record-complete',
        label: 'Run record lists models, instructions hash and lengths',
        passed: out.record.instructionsSha256 === sha12(input.instructions) && out.record.models.length === 2,
        message: `instructions sha256 ${out.record.instructionsSha256}`,
      },
      {
        id: 'record-secret-free',
        label: 'Run record contains no API keys',
        passed: !secretShaped && envValues.every((v) => !recordJson.includes(v)),
      },
    ]);
  },
};
