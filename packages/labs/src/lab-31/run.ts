import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS, type PromptView, type ScriptedTurn } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { runTypedWorkflow, streamWorkflow } from '../shared/workflow-stream.js';
import { lab31Definition } from './definition.js';
import {
  buildOrderWorkflow,
  buildVerificationWorkflow,
  FulfilmentSchema,
  OrderSchema,
  RiskSchema,
  SUBWORKFLOW_ID,
  VERIFICATION_INPUT_KEYS,
  VerificationResultSchema,
  type Fulfilment,
  type Risk,
  type VerificationInput,
  type VerificationResult,
} from './verification.js';

export const Lab31InputSchema = z.object({
  orders: z
    .array(OrderSchema.extend({ expectDecision: z.enum(['approved', 'held']) }))
    .min(1)
    .max(4)
    .refine((o) => new Set(o.map((x) => x.orderId)).size === o.length, { message: 'orderId values must be unique' }),
  boundaryFault: z.enum(['none', 'whole-order', 'loose-schema', 'bad-output']),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab31Input = z.infer<typeof Lab31InputSchema>;

export const NESTED_STEPS = ['checkIdentity', 'screenRisk', 'decide'].map((s) => `${SUBWORKFLOW_ID}.${s}`);

export interface OrderOutcome {
  orderId: string;
  expectDecision: string;
  workflowStatus: string;
  /** Step ids in the order Mastra streamed their results (nested steps included). */
  trace: string[];
  /** Keys the subworkflow actually received (from the stream payload). */
  receivedKeys: string[];
  subworkflowOutput: unknown;
  outputBoundary: { valid: boolean; issues: string[] };
  fulfilment: Fulfilment | null;
  standalone: VerificationResult | null;
  error: string | null;
}

export interface Lab31Output {
  boundaryFault: Lab31Input['boundaryFault'];
  declaredKeys: string[];
  outcomes: OrderOutcome[];
  screenings: { calls: number; reused: number };
}

const HIGH_RISK = /gift ?cards?|rush|different country|reship|wire transfer|crypto/i;

/** Offline risk screening: unambiguous keyword and amount rules. */
export function screenOffline(input: VerificationInput): Risk {
  if (HIGH_RISK.test(input.notes)) return { riskLevel: 'high', reasons: ['order notes match a known fraud pattern'] };
  if (input.total > 2_000) return { riskLevel: 'medium', reasons: ['order total above 2,000'] };
  return { riskLevel: 'low', reasons: ['no risk signals'] };
}

export function offlineScript() {
  return (v: PromptView): ScriptedTurn => {
    const input = JSON.parse(v.lastUser) as VerificationInput;
    return { text: JSON.stringify(screenOffline(input)) };
  };
}

export const lab31: LabImplementation<Lab31Input, Lab31Output, LabServices> = {
  definition: lab31Definition as LabDefinition,
  inputSchema: Lab31InputSchema,

  async run(ctx, input) {
    const resolved = ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline: offlineScript() });
    const agent = withLabLogger(
      ctx,
      new Agent({
        id: 'risk-screener',
        name: 'Risk Screener',
        instructions:
          'You screen e-commerce orders for fraud risk. The user message is JSON { email, country, total, notes }. ' +
          'high = the notes show a fraud pattern (gift cards in bulk, rush to a different country, reshipping, wire transfer or crypto payment); ' +
          'medium = a large total without other signals; low = otherwise. Give up to three short reasons.',
        model: resolved.model,
      }),
    );
    // Memoised per lab run: the standalone reuse run gets the same screening without another model call.
    const cache = new Map<string, Risk>();
    const screenings = { calls: 0, reused: 0 };
    const screen = async (v: VerificationInput): Promise<Risk> => {
      const key = JSON.stringify([v.email, v.country, v.total, v.notes]);
      const hit = cache.get(key);
      if (hit) {
        screenings.reused++;
        ctx.log('info', 'Risk screening reused from this run’s cache (no model call).');
        return hit;
      }
      screenings.calls++;
      const r = await agent.generate(JSON.stringify({ email: v.email, country: v.country, total: v.total, notes: v.notes }), {
        structuredOutput: { schema: RiskSchema },
        abortSignal: ctx.signal,
      });
      const risk = RiskSchema.parse(r.object);
      cache.set(key, risk);
      return risk;
    };
    const verification = buildVerificationWorkflow(screen, input.boundaryFault);
    const orderWorkflow = buildOrderWorkflow(verification, input.boundaryFault);

    const outcomes: OrderOutcome[] = [];
    for (const o of input.orders) {
      ctx.throwIfAborted();
      const { expectDecision, ...order } = o;
      const res = await runTypedWorkflow(ctx, `order-workflow#${o.orderId}`, await orderWorkflow.createRun(), order, FulfilmentSchema);
      const subStart = res.steps.find((s) => s.stepId === SUBWORKFLOW_ID);
      const received = subStart?.input && typeof subStart.input === 'object' ? Object.keys(subStart.input).sort() : [];
      const subOutput = res.stepRecords[SUBWORKFLOW_ID]?.output;
      const parsed = VerificationResultSchema.safeParse(subOutput);
      const outputBoundary = {
        valid: parsed.success,
        issues: parsed.success ? [] : parsed.error.issues.map((i) => `${SUBWORKFLOW_ID} output ${i.path.join('.') || '(root)'}: ${i.message}`),
      };
      for (const i of outputBoundary.issues) ctx.log('error', `Boundary violation: ${i}`);

      // Reuse: the same workflow instance, run on its own with the same minimal input.
      let standalone: VerificationResult | null = null;
      if (res.stepRecords.prepareOrder?.status === 'success') {
        const minimal = pickVerificationInput(res.stepRecords.prepareOrder.output);
        const alone = await streamWorkflow<VerificationResult>(ctx, `${SUBWORKFLOW_ID} (standalone)#${o.orderId}`, await verification.createRun(), minimal);
        const p = VerificationResultSchema.safeParse(alone.result);
        standalone = p.success ? p.data : null;
      }
      const fulfilment = res.typed;
      ctx.log(
        fulfilment?.decision === expectDecision ? 'info' : 'warn',
        `${o.orderId}: ${fulfilment?.decision ?? res.status} (expected ${expectDecision}); subworkflow received [${received.join(', ')}]`,
      );
      outcomes.push({
        orderId: o.orderId,
        expectDecision,
        workflowStatus: res.status,
        trace: res.steps.map((s) => s.stepId),
        receivedKeys: received,
        subworkflowOutput: subOutput ?? null,
        outputBoundary,
        fulfilment,
        standalone,
        error: res.error ?? null,
      });
    }
    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: resolved.simulated, boundaryFault: input.boundaryFault },
    });
    return { boundaryFault: input.boundaryFault, declaredKeys: VERIFICATION_INPUT_KEYS, outcomes, screenings };
  },

  validate(out) {
    const badTrace = out.outcomes.filter((o) => {
      const sub = o.trace.indexOf(SUBWORKFLOW_ID);
      const idx = NESTED_STEPS.map((s) => o.trace.indexOf(s));
      return sub < 0 || idx.some((i) => i < 0 || i > sub) || idx.some((i, k) => k > 0 && i < idx[k - 1]!);
    });
    const leaked = out.outcomes.filter((o) => JSON.stringify(o.receivedKeys) !== JSON.stringify(out.declaredKeys));
    const badOutput = out.outcomes.filter((o) => !o.outputBoundary.valid);
    const notReused = out.outcomes.filter(
      (o) => !o.standalone || !o.outputBoundary.valid || JSON.stringify(o.standalone) !== JSON.stringify(o.subworkflowOutput),
    );
    const wrong = out.outcomes.filter((o) => o.fulfilment?.decision !== o.expectDecision);
    return summarizeChecks([
      {
        id: 'subworkflow-trace',
        label: 'The subworkflow’s steps are visible in the trace, inside the subworkflow step',
        passed: badTrace.length === 0,
        message: badTrace.length ? `missing or out of order for ${badTrace.map((o) => o.orderId).join(', ')}` : NESTED_STEPS.join(' → '),
      },
      {
        id: 'input-boundary',
        label: 'Only the declared verification input crossed into the subworkflow',
        passed: leaked.length === 0,
        message: leaked.length
          ? leaked.map((o) => `${o.orderId} leaked ${o.receivedKeys.filter((k) => !out.declaredKeys.includes(k)).join(', ')}`).join('; ')
          : `received exactly [${out.declaredKeys.join(', ')}]`,
      },
      {
        id: 'output-boundary',
        label: 'The subworkflow’s output matches its declared schema (checked by the app)',
        passed: badOutput.length === 0,
        message: badOutput.length ? badOutput.flatMap((o) => o.outputBoundary.issues).slice(0, 3).join('; ') : 'valid for every order',
      },
      {
        id: 'reusable',
        label: 'The same subworkflow run on its own gives the same result',
        passed: notReused.length === 0,
        message: notReused.length ? `differs for ${notReused.map((o) => o.orderId).join(', ')}` : `${out.outcomes.length} standalone run(s) matched`,
      },
      {
        id: 'decision-correct',
        label: 'Every order got its expected decision',
        passed: wrong.length === 0,
        message: wrong.length ? wrong.map((o) => `${o.orderId}: ${o.fulfilment?.decision ?? o.workflowStatus}`).join('; ') : 'all as expected',
      },
    ]);
  },
};

/** The minimal input, exactly as declared (the standalone run must not depend on the fault mode). */
function pickVerificationInput(value: unknown): VerificationInput {
  const v = value as Record<string, unknown>;
  return { email: String(v.email), country: String(v.country), total: Number(v.total), notes: String(v.notes) };
}
