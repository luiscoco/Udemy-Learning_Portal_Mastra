import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { RequestContext } from '@mastra/core/request-context';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { usageOf, withLabLogger } from '../shared/agent-kit.js';
import { lab16Definition } from './definition.js';
import {
  buildInstructions,
  formatFacts,
  normalize,
  PERSONAS,
  ProfileSchema,
  settingsFrom,
  SupportContextSchema,
  type Locale,
  type SupportContext,
  type Tone,
} from './profiles.js';

export const QUESTION = 'My order ORD-2042 has not arrived yet. When will it come, and how much did I pay?';

export const Lab16InputSchema = z.object({
  question: z.string().trim().min(1).max(500),
  profiles: z
    .array(ProfileSchema)
    .min(1)
    .max(4)
    .refine(
      (p) => new Set(p.map((x) => x.persona)).size === p.length,
      'Use each persona at most once so answers can be told apart',
    ),
  strategy: z.enum(['request-context', 'shared-module-state']),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab16Input = z.infer<typeof Lab16InputSchema>;

export interface RequestResult {
  requestId: string;
  persona: string;
  tone: Tone;
  locale: Locale;
  /** Instructions Mastra resolved for this request (captured inside the instructions function). */
  instructions: string;
  answer: string;
  startedAtMs: number;
  finishedAtMs: number;
}

export interface Lab16Output {
  strategy: Lab16Input['strategy'];
  requests: RequestResult[];
  /** Offline only: the system prompt the model actually received, per request id. */
  modelSaw: Record<string, string>;
  probe: { rejected: boolean; errorId: string | null; instructionsResolved: boolean };
}

const GREETINGS: Record<Locale, Record<Tone, string>> = {
  'en-US': { friendly: 'Hi there!', formal: 'Good afternoon.', concise: '' },
  'es-ES': { friendly: '¡Hola!', formal: 'Buenas tardes.', concise: '' },
  'fr-FR': { friendly: 'Bonjour !', formal: 'Madame, Monsieur,', concise: '' },
  'de-DE': { friendly: 'Hallo!', formal: 'Guten Tag.', concise: '' },
  'ja-JP': { friendly: 'こんにちは！', formal: 'いつもご利用いただきありがとうございます。', concise: '' },
};
const FACTS: Record<Locale, (date: string, total: string) => string> = {
  'en-US': (d, t) => `Your order ORD-2042 should arrive on ${d}; the total is ${t}.`,
  'es-ES': (d, t) => `Su pedido ORD-2042 debería llegar el ${d}; el total es ${t}.`,
  'fr-FR': (d, t) => `Votre commande ORD-2042 devrait arriver le ${d} ; le total est de ${t}.`,
  'de-DE': (d, t) => `Ihre Bestellung ORD-2042 sollte am ${d} ankommen; der Gesamtbetrag beträgt ${t}.`,
  'ja-JP': (d, t) => `ご注文 ORD-2042 は${d}に到着予定です。合計は${t}です。`,
};

/**
 * Offline model: answers strictly from the system prompt it receives (persona, tone, locale, facts), so
 * whatever instructions reach the model are visible in the answer. Later requests answer sooner, so
 * finish order differs from start order.
 */
export function offlineScript(seen: Map<string, string>, total: number) {
  return (v: PromptView): ScriptedTurn => {
    const field = (label: string) => v.system.match(new RegExp(`^${label}: (.+)$`, 'm'))?.[1]?.trim() ?? '';
    const requestId = field('Request reference');
    seen.set(requestId, v.system);
    const locale = field('Locale').split('.')[0] as Locale;
    const tone = field('Tone').split('.')[0] as Tone;
    const text = [
      GREETINGS[locale]?.[tone] ?? '',
      FACTS[locale]?.(field('Delivery date'), field('Total')) ?? '',
      field('Sign off with'),
    ]
      .filter(Boolean)
      .join(' ');
    const n = Number(requestId.replace('req-', '')) || 1;
    return { text, delayMs: (total - n + 1) * 40 };
  };
}

export const lab16: LabImplementation<Lab16Input, Lab16Output, LabServices> = {
  definition: lab16Definition as LabDefinition,
  inputSchema: Lab16InputSchema,

  async run(ctx, input) {
    const seen = new Map<string, string>();
    const resolved = ctx.services.models.resolve({
      mode: ctx.mode,
      modelId: input.modelId,
      offline: offlineScript(seen, input.profiles.length),
    });

    // Captured per request id: what the instructions function actually produced.
    const resolvedInstructions = new Map<string, string>();
    // Simulated module-level state for the anti-pattern. It lives in this run's closure so a learner
    // demonstrating the leak can never affect another learner's run.
    const moduleState: { current?: SupportContext } = {};

    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'support-agent',
        name: 'Support Agent',
        model: resolved.model,
        requestContextSchema: SupportContextSchema,
        instructions: ({ requestContext }) => {
          const fromContext = settingsFrom(requestContext as RequestContext<SupportContext>);
          const settings =
            input.strategy === 'request-context' ? fromContext : { ...moduleState.current!, requestId: fromContext.requestId };
          const text = buildInstructions(settings);
          resolvedInstructions.set(fromContext.requestId, text);
          return text;
        },
      }),
    );
    ctx.log('info', `One shared agent, ${input.profiles.length} parallel request(s), strategy: ${input.strategy}`);

    const t0 = Date.now();
    const requests = await Promise.all(
      input.profiles.map(async (profile, i) => {
        const requestId = `req-${i + 1}`;
        const settings: SupportContext = { ...profile, requestId };
        // Anti-pattern: write the "current user" settings into shared state, then await.
        if (input.strategy === 'shared-module-state') moduleState.current = settings;
        const requestContext = new RequestContext<SupportContext>(Object.entries(settings) as never);
        ctx.emit({ type: 'workflow-step', stepId: requestId, status: 'running', input: profile });
        const startedAtMs = Date.now() - t0;
        const res = await agent.generate(input.question, { requestContext, abortSignal: ctx.signal });
        ctx.throwIfAborted();
        const finishedAtMs = Date.now() - t0;
        ctx.emit({
          type: 'workflow-step',
          stepId: requestId,
          status: 'success',
          output: { persona: profile.persona, locale: profile.locale },
          durationMs: finishedAtMs - startedAtMs,
          annotations: { startedAtMs, finishedAtMs },
        });
        const usage = usageOf(res.usage);
        if (usage?.totalTokens) ctx.log('debug', `${requestId} used ${usage.totalTokens} tokens`);
        return {
          requestId,
          ...profile,
          instructions: resolvedInstructions.get(requestId) ?? '',
          answer: res.text,
          startedAtMs,
          finishedAtMs,
        } satisfies RequestResult;
      }),
    );
    for (const r of [...requests].sort((a, b) => a.finishedAtMs - b.finishedAtMs))
      ctx.log('info', `${r.requestId} (${r.persona}, ${r.locale}) finished at ${r.finishedAtMs} ms`);

    // Probe: an invalid context must be rejected by requestContextSchema before any model call.
    const probe: Lab16Output['probe'] = { rejected: false, errorId: null, instructionsResolved: false };
    try {
      await agent.generate('probe', {
        requestContext: new RequestContext([
          ['persona', 'ava'],
          ['tone', 'friendly'],
          ['locale', 'xx-XX'],
          ['requestId', 'probe'],
        ]) as never,
        abortSignal: ctx.signal,
      });
    } catch (err) {
      ctx.throwIfAborted();
      probe.rejected = true;
      probe.errorId = (err as { id?: string }).id ?? null;
      ctx.log('info', `Invalid context rejected: ${probe.errorId}`);
    }
    probe.instructionsResolved = resolvedInstructions.has('probe');

    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, strategy: input.strategy },
      annotations: { parallelRequests: requests.length },
    });
    return { strategy: input.strategy, requests, modelSaw: Object.fromEntries(seen), probe };
  },

  validate(out) {
    const names = out.requests.map((r) => PERSONAS[r.persona as keyof typeof PERSONAS].name);
    const isolated = out.requests.map((r, i) => {
      const own = r.instructions.includes(`You are ${names[i]},`) && r.instructions.includes(`Locale: ${r.locale}.`);
      const others = out.requests.some((o, j) => j !== i && r.instructions.includes(`You are ${names[j]},`));
      const ref = r.instructions.includes(`Request reference: ${r.requestId}`);
      const modelAgrees = out.modelSaw[r.requestId] === undefined || out.modelSaw[r.requestId] === r.instructions;
      return own && !others && ref && modelAgrees;
    });
    const signed = out.requests.map((r, i) => {
      const a = normalize(r.answer);
      return a.includes(`— ${names[i]}`) && names.every((n, j) => j === i || !a.includes(`— ${n}`));
    });
    const facts = out.requests.map((r) => normalize(r.answer).includes(normalize(formatFacts(r.locale).total)));
    const overlap = Math.max(...out.requests.map((r) => r.startedAtMs)) < Math.min(...out.requests.map((r) => r.finishedAtMs));
    const bad = (flags: boolean[]) =>
      out.requests
        .filter((_, i) => !flags[i])
        .map((r) => r.requestId)
        .join(', ');
    return summarizeChecks([
      {
        id: 'parallel',
        label: 'All requests ran at the same time on one agent',
        passed: out.requests.length === 1 || overlap,
        message: out.requests.map((r) => `${r.requestId} ${r.startedAtMs}–${r.finishedAtMs} ms`).join(', '),
      },
      {
        id: 'instructions-isolated',
        label: 'Each request resolved instructions with only its own persona, locale and reference',
        passed: isolated.every(Boolean),
        message: isolated.every(Boolean) ? 'no leaks' : `leaked into: ${bad(isolated)}`,
      },
      {
        id: 'answers-signed',
        label: 'Each answer is signed by its own persona',
        passed: signed.every(Boolean),
        message: signed.every(Boolean) ? 'all signed correctly' : `wrong or missing sign-off: ${bad(signed)}`,
      },
      {
        id: 'locale-facts',
        label: 'Each answer quotes the total formatted for its own locale',
        passed: facts.every(Boolean),
        message: facts.every(Boolean) ? 'all locales correct' : `wrong format: ${bad(facts)}`,
      },
      {
        id: 'context-validated',
        label: 'An invalid request context was rejected before the instructions or the model ran',
        passed:
          out.probe.rejected &&
          out.probe.errorId === 'AGENT_REQUEST_CONTEXT_VALIDATION_FAILED' &&
          !out.probe.instructionsResolved,
        message: out.probe.errorId ?? 'not rejected',
      },
    ]);
  },
};
