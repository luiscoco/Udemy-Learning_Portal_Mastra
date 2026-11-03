import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { ModelRouterLanguageModel } from '@mastra/core/llm';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { consumeStream } from '../shared/tool-stream.js';
import { lab65Definition } from './definition.js';
import { guardModel, MODEL_FAULTS } from './model-guard.js';
import { backoffMs, CircuitBreaker, type AttemptRecord, type Transition } from './resilience.js';
import { createDeskTools, RECOMMENDATION_FAULTS, TRACKER_FAULTS, type Degraded } from './tools.js';

export const BASE_DELAY_MS = 50;
export const CANCEL_AFTER_MS = 150;
/** Allowed overshoot of an attempt beyond its timeout (timer and event-loop delay on a busy machine). */
export const TIMEOUT_SLACK_MS = 2_000;
const MAX_STEPS = 3;

export const Lab65InputSchema = z.object({
  questions: z
    .string()
    .max(1_200)
    .transform((s) =>
      s
        .split('\n')
        .map((q) => q.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.string().max(200)).min(1).max(6)),
  primaryModelId: z.enum(DEFAULT_LIVE_MODELS),
  fallbackModelId: z.enum(DEFAULT_LIVE_MODELS),
  primaryFault: z.enum(MODEL_FAULTS),
  trackerFault: z.enum(TRACKER_FAULTS),
  recommendationsFault: z.enum(RECOMMENDATION_FAULTS),
  /** 0 = none; otherwise the 1-based question the customer abandons 150 ms after asking it. */
  cancelQuestion: z.number().int().min(0).max(6),
  maxAttempts: z.number().int().min(1).max(4),
  modelTimeoutMs: z.number().int().min(200).max(30_000),
  toolTimeoutMs: z.number().int().min(100).max(10_000),
  failureThreshold: z.number().int().min(1).max(10),
  coolDownMs: z.number().int().min(0).max(300_000),
});
export type Lab65Input = z.infer<typeof Lab65InputSchema>;

export interface QuestionReport {
  index: number;
  question: string;
  answer: string;
  answeredBy: 'primary' | 'fallback' | null;
  degraded: string[];
  status: 'answered' | 'cancelled' | 'failed';
  durationMs: number;
}
export interface CallRow extends AttemptRecord {
  question: number;
}
export interface Lab65Output {
  simulated: boolean;
  questions: QuestionReport[];
  calls: CallRow[];
  breakers: Record<string, { state: string; transitions: Transition[]; shortCircuited: number }>;
  bounds: { runMs: number; boundMs: number; maxAttempts: number; modelTimeoutMs: number; toolTimeoutMs: number };
  faults: { primary: string; tracker: string; recommendations: string; cancelQuestion: number };
}

export const INSTRUCTIONS =
  'You are a support assistant for an online shop. Use lookupOrder, trackShipment and getRecommendations to answer. ' +
  'If a tool returns degraded: true, do not retry it: say briefly that this part is unavailable right now and answer the rest. ' +
  'Answer in at most three short sentences.';

const ORDER = /\bORD-\d{4}\b/i;
type Intent = { orderId: string | null; track: boolean; recommend: boolean };
export function intentOf(question: string): Intent {
  return {
    orderId: question.toUpperCase().match(ORDER)?.[0] ?? null,
    track: /\b(where|track|arrive|status|when)\b/i.test(question),
    recommend: /\b(suggest|recommend|recommendations|go with)\b/i.test(question),
  };
}

const isDegraded = (o: unknown): o is Degraded => Boolean(o && typeof o === 'object' && (o as Degraded).degraded === true);

/** Offline desk model (used for both the primary and the fallback): calls the needed tools, then answers honestly. */
export function deskScript(question: string) {
  const intent = intentOf(question);
  return (v: PromptView): ScriptedTurn => {
    if (v.toolResults.length === 0) {
      if (!intent.orderId) return { text: 'Please tell me your order number (ORD-1234).' };
      const calls = [{ toolName: 'lookupOrder', input: { orderId: intent.orderId } }];
      if (intent.track) calls.push({ toolName: 'trackShipment', input: { orderId: intent.orderId } });
      if (intent.recommend) calls.push({ toolName: 'getRecommendations', input: { orderId: intent.orderId } });
      return { toolCalls: calls };
    }
    const out = (name: string) => v.toolResults.find((r) => r.toolName === name)?.output as Record<string, unknown> | undefined;
    const order = out('lookupOrder');
    const parts = [
      order?.ok ? `${intent.orderId} (${String(order.item)}) is ${String(order.status)}.` : `I could not find ${intent.orderId}.`,
    ];
    const track = out('trackShipment');
    if (track)
      parts.push(
        isDegraded(track)
          ? 'Live tracking is unavailable right now.'
          : `${String(track.carrier)} expects to deliver it ${String(track.eta)}.`,
      );
    const rec = out('getRecommendations');
    if (rec)
      parts.push(
        isDegraded(rec)
          ? 'Recommendations are unavailable right now.'
          : `You might like: ${(rec.suggestions as string[]).join(', ')}.`,
      );
    return { text: parts.join(' ') };
  };
}

/** Worst case of one call: every attempt times out, plus the backoff between attempts. */
const worstCall = (attempts: number, timeoutMs: number) =>
  attempts * timeoutMs +
  Array.from({ length: attempts - 1 }, (_, i) => backoffMs(i + 1, BASE_DELAY_MS)).reduce((a, b) => a + b, 0);

export const lab65: LabImplementation<Lab65Input, Lab65Output, LabServices> = {
  definition: lab65Definition as LabDefinition,
  inputSchema: Lab65InputSchema,

  async run(ctx, input) {
    const started = Date.now();
    const breakerOpts = { failureThreshold: input.failureThreshold, coolDownMs: input.coolDownMs };
    const breakers = {
      primary: new CircuitBreaker('primary model', breakerOpts),
      fallback: new CircuitBreaker('fallback model', breakerOpts),
      tracker: new CircuitBreaker('shipment tracker', breakerOpts),
      recommendations: new CircuitBreaker('recommendations', breakerOpts),
    };
    const calls: CallRow[] = [];
    let current = 0;
    let questionSignal: AbortSignal = ctx.signal;
    const onStart = (dep: string, attempt: number) =>
      ctx.emit({ type: 'workflow-step', stepId: `q${current} ${dep} #${attempt}`, status: 'running' });
    const onAttempt = (r: AttemptRecord) => {
      calls.push({ ...r, question: current });
      ctx.emit({
        type: 'workflow-step',
        stepId: `q${current} ${r.dep} #${r.attempt}`,
        status: r.outcome === 'ok' ? 'success' : r.outcome === 'short-circuit' ? 'skipped' : 'failed',
        durationMs: r.durationMs,
        output: { outcome: r.outcome, ...(r.error ? { error: r.error } : {}) },
      });
      if (r.outcome === 'short-circuit') ctx.log('warn', `q${current}: ${r.dep} short-circuited (breaker open)`);
    };

    // The same models offline and live; faults are injected by the guard before the provider is called.
    const model = (id: string, script: () => ReturnType<typeof deskScript>) => {
      const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: id, offline: (v) => script()(v) });
      return { model: resolved.scripted ?? new ModelRouterLanguageModel(id as never), simulated: resolved.simulated };
    };
    let script = deskScript('');
    const primary = model(input.primaryModelId, () => script);
    const fallback = model(input.fallbackModelId, () => script);
    const guard = (m: unknown, dep: 'primary' | 'fallback') =>
      guardModel(m as never, {
        dep,
        fault: dep === 'primary' ? input.primaryFault : 'none',
        attempts: input.maxAttempts,
        timeoutMs: input.modelTimeoutMs,
        baseDelayMs: BASE_DELAY_MS,
        breaker: breakers[dep],
        onAttempt,
        onStart: (n) => onStart(dep, n),
      });
    const toolDep = { attempts: input.maxAttempts, timeoutMs: input.toolTimeoutMs, baseDelayMs: BASE_DELAY_MS };
    const agent = new Agent({
      id: 'lab65-desk',
      name: 'Resilient support desk',
      instructions: INSTRUCTIONS,
      // Native Mastra fallback; maxRetries: 0 because the guards own attempts (no hidden retry amplification).
      model: [
        { model: guard(primary.model, 'primary') as never, maxRetries: 0 },
        { model: guard(fallback.model, 'fallback') as never, maxRetries: 0 },
      ],
      tools: createDeskTools({
        trackerFault: input.trackerFault,
        recommendationsFault: input.recommendationsFault,
        deps: {
          tracker: { ...toolDep, breaker: breakers.tracker },
          recommendations: { ...toolDep, breaker: breakers.recommendations },
        },
        signal: () => questionSignal,
        onAttempt,
        onStart,
      }),
    });

    const questions: QuestionReport[] = [];
    for (const [i, question] of input.questions.entries()) {
      ctx.throwIfAborted();
      current = i + 1;
      script = deskScript(question);
      const qc = new AbortController();
      questionSignal = AbortSignal.any([ctx.signal, qc.signal]);
      const timer =
        input.cancelQuestion === current
          ? setTimeout(() => qc.abort(new Error('the customer closed the chat')), CANCEL_AFTER_MS)
          : undefined;
      const t0 = Date.now();
      ctx.emit({ type: 'workflow-step', stepId: `q${current}`, status: 'running', input: { question } });
      let answer = '';
      let status: QuestionReport['status'] = 'answered';
      try {
        const stream = await agent.stream(question, { maxSteps: MAX_STEPS, abortSignal: questionSignal });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const res = await consumeStream(ctx, stream as any, { emitTokens: false });
        answer = res.text.trim();
        if (qc.signal.aborted) status = 'cancelled';
        else if (!answer) status = 'failed';
      } catch (err) {
        if (ctx.signal.aborted) throw err;
        status = qc.signal.aborted ? 'cancelled' : 'failed';
        if (status === 'failed') ctx.log('warn', `q${current} failed: ${(err as Error).message}`);
      } finally {
        clearTimeout(timer);
      }
      const mine = calls.filter((c) => c.question === current);
      const okModels = mine.filter((c) => c.outcome === 'ok' && (c.dep === 'primary' || c.dep === 'fallback'));
      const report: QuestionReport = {
        index: current,
        question,
        answer,
        answeredBy: status === 'answered' ? ((okModels.at(-1)?.dep as 'primary' | 'fallback' | undefined) ?? null) : null,
        degraded: [
          ...new Set(
            mine.filter((c) => c.outcome !== 'ok' && (c.dep === 'tracker' || c.dep === 'recommendations')).map((c) => c.dep),
          ),
        ].filter((dep) => !mine.some((c) => c.dep === dep && c.outcome === 'ok')),
        status,
        durationMs: Date.now() - t0,
      };
      questions.push(report);
      ctx.emit({
        type: 'workflow-step',
        stepId: `q${current}`,
        status: status === 'answered' ? 'success' : 'failed',
        durationMs: report.durationMs,
        output: { status, answeredBy: report.answeredBy },
      });
    }

    const perQuestion =
      2 * (worstCall(input.maxAttempts, input.modelTimeoutMs) * 2) + 2 * worstCall(input.maxAttempts, input.toolTimeoutMs);
    const simulated = primary.simulated && fallback.simulated;
    ctx.setResultExtras({ effective: { mode: ctx.mode, modelId: input.primaryModelId, simulated } });
    return {
      simulated,
      questions,
      calls,
      breakers: Object.fromEntries(
        Object.entries(breakers).map(([k, b]) => [
          k,
          { state: b.state, transitions: [...b.transitions], shortCircuited: b.shortCircuited },
        ]),
      ),
      bounds: {
        runMs: Date.now() - started,
        boundMs: input.questions.length * perQuestion + TIMEOUT_SLACK_MS * input.questions.length,
        maxAttempts: input.maxAttempts,
        modelTimeoutMs: input.modelTimeoutMs,
        toolTimeoutMs: input.toolTimeoutMs,
      },
      faults: {
        primary: input.primaryFault,
        tracker: input.trackerFault,
        recommendations: input.recommendationsFault,
        cancelQuestion: input.cancelQuestion,
      },
    };
  },

  validate(out, input) {
    const attemptsPerCall = new Map<string, number>();
    // A logical call = consecutive attempts of one dependency within one question until attempt 1 starts again.
    let key = '';
    let n = 0;
    for (const c of out.calls) {
      if (c.attempt === 1) {
        n += 1;
        key = `${c.question}:${c.dep}:${n}`;
      }
      if (c.outcome !== 'short-circuit') attemptsPerCall.set(key, Math.max(attemptsPerCall.get(key) ?? 0, c.attempt));
    }
    const maxSeen = Math.max(0, ...attemptsPerCall.values());
    const badKeyRetried =
      input.primaryFault === 'bad-key' &&
      out.calls.some((c) => c.dep === 'primary' && c.attempt > 1 && c.outcome !== 'short-circuit');
    const overshoot = out.calls.map((c) => c.durationMs - c.timeoutMs);
    const live = out.questions.filter((q) => q.status !== 'cancelled');
    const persistent = [
      ...(input.primaryFault !== 'none' ? ['primary'] : []),
      ...(input.trackerFault === 'slow' ? ['tracker'] : []),
      ...(input.recommendationsFault === 'down' ? ['recommendations'] : []),
    ];
    /** Once a dependency reached the failure threshold, only short-circuits (or half-open probes) may follow. */
    const cutOff = (dep: string) => {
      const b = out.breakers[dep]!;
      const probes = b.transitions.filter((t) => t.to === 'half-open').length;
      let streak = 0;
      let open = false;
      let realAfterOpen = 0;
      for (const c of out.calls.filter((x) => x.dep === dep)) {
        if (open && c.outcome !== 'short-circuit') realAfterOpen += 1;
        if (c.outcome === 'failed' || c.outcome === 'timeout') streak += 1;
        else if (c.outcome === 'ok') streak = 0;
        if (streak >= input.failureThreshold) open = true;
      }
      const opened = b.transitions.some((t) => t.to === 'open');
      return (!open || opened) && realAfterOpen <= probes;
    };
    const cancelled = out.questions.find((q) => q.index === input.cancelQuestion);
    const cancelledCalls = out.calls.filter((c) => c.question === input.cancelQuestion);
    const expectedModel = input.primaryFault === 'none' ? 'primary' : 'fallback';
    return summarizeChecks([
      {
        id: 'retries-bounded',
        label: 'Retries stayed within the attempt limit, and a non-retryable failure was never retried',
        passed: maxSeen <= input.maxAttempts && !badKeyRetried,
        message: `at most ${maxSeen} attempt(s) per call (limit ${input.maxAttempts})${input.trackerFault === 'flaky' ? '; the flaky tracker recovered on a retry' : ''}`,
      },
      {
        id: 'timeouts-enforced',
        label: 'No attempt ran longer than its timeout',
        passed: overshoot.every((over) => over <= TIMEOUT_SLACK_MS),
        message: `${out.calls.filter((c) => c.outcome === 'timeout').length} attempt(s) timed out; worst overshoot ${Math.max(0, ...overshoot)} ms`,
      },
      {
        id: 'failing-dependency-isolated',
        label: 'A dependency that kept failing was cut off by its breaker, and every question still got an answer',
        passed:
          live.every((q) => q.status === 'answered' && q.answer.length > 0) &&
          ['primary', 'fallback', 'tracker', 'recommendations'].every(cutOff),
        message:
          persistent.length > 0
            ? persistent
                .map((dep) => `${dep}: ${out.breakers[dep]!.state}, ${out.breakers[dep]!.shortCircuited} short-circuited`)
                .join('; ')
            : 'no persistent failures injected',
      },
      {
        id: 'fallback-model-used',
        label: 'Answers came from the fallback model exactly when the primary was failing',
        passed: live.every((q) => q.answeredBy === expectedModel),
        message: `answered by: ${live.map((q) => `q${q.index} ${q.answeredBy}`).join(', ')}`,
      },
      {
        id: 'cancellation-propagates',
        label: 'Cancelling a question stopped its calls without affecting the next questions',
        passed:
          input.cancelQuestion === 0 ||
          !cancelled ||
          (cancelledCalls.every((c) => c.outcome !== 'timeout' || c.durationMs <= c.timeoutMs + TIMEOUT_SLACK_MS) &&
            out.questions.filter((q) => q.index > input.cancelQuestion).every((q) => q.status === 'answered')),
        message:
          input.cancelQuestion === 0
            ? 'no cancellation requested'
            : `q${input.cancelQuestion}: ${cancelled?.status ?? 'not reached'}; ${cancelledCalls.filter((c) => c.outcome === 'cancelled').length} call(s) cancelled in flight`,
      },
      {
        id: 'no-hang',
        label: 'Every question ended, and the run finished within its computed bound',
        passed: out.questions.length === input.questions.length && out.bounds.runMs <= out.bounds.boundMs,
        message: `${out.bounds.runMs} ms (bound ${out.bounds.boundMs} ms)`,
      },
    ]);
  },
};
