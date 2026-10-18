import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type AgentConversation, type ConversationMessage, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { streamAgent } from '../shared/tool-stream.js';
import {
  FAULT_LINES,
  FAULTS,
  searchTool,
  supervisorInstructions,
  supervisorScript,
  WORKER_DESCRIPTIONS,
  WORKER_INSTRUCTIONS,
  workerScript,
} from './agents.js';
import {
  budgetLine,
  decideDelegation,
  isWorker,
  Ledger,
  normalisePrompt,
  WORKERS,
  type BudgetSnapshot,
  type Limits,
  type RefusalReason,
  type Worker,
} from './budget.js';
import { lab53Definition } from './definition.js';

export const Lab53InputSchema = z.object({
  task: z.string().trim().min(10).max(1_000),
  maxDelegations: z.number().int().min(1).max(8),
  perWorkerLimit: z.number().int().min(1).max(3),
  tokenBudget: z.number().int().min(10).max(100_000),
  maxIterations: z.number().int().min(2).max(10),
  fault: z.enum(FAULTS),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab53Input = z.infer<typeof Lab53InputSchema>;

/** Worker step cap applied to every accepted delegation (modifiedMaxSteps). */
export const WORKER_MAX_STEPS = 3;

export interface AuditEntry {
  seq: number;
  toolCallId: string;
  worker: string;
  prompt: string;
  decision: 'accepted' | 'refused';
  reason: RefusalReason | null;
  detail: string | null;
  budgetBefore: BudgetSnapshot;
  workerMaxSteps: number | null;
  completion: {
    success: boolean;
    durationMs: number;
    tokens: number;
    workerTools: string[];
    text: string;
    budgetAfter: BudgetSnapshot;
  } | null;
}

export interface Lab53Output {
  limits: Limits & { maxIterations: number };
  audit: AuditEntry[];
  /** Delegation tool calls as the supervisor's stream reported them. */
  delegationCalls: { toolCallId: string; toolName: string }[];
  supervisorSteps: number;
  finishReason: string | null;
  outcome: { status: 'finished' | 'stopped' | 'failed'; answer: string; partial: { worker: string; text: string }[] };
  budget: BudgetSnapshot;
  agentConversation: AgentConversation;
  error: string | null;
}

const AGENTS: AgentConversation['agents'] = [
  {
    id: 'supervisor',
    name: 'Supervisor',
    role: 'Plans the work and delegates it; writes the final answer',
    tools: WORKERS.map((w) => `agent-${w}`),
  },
  {
    id: 'orchestrator',
    name: 'Budget guard (delegation hooks)',
    role: 'Accepts or refuses every delegation; keeps the audit',
    tools: [],
  },
  { id: 'researcher', name: 'Research worker', role: WORKER_DESCRIPTIONS.researcher, tools: ['search_sources'] },
  { id: 'planner', name: 'Planning worker', role: WORKER_DESCRIPTIONS.planner, tools: [] },
  { id: 'analyst', name: 'Analysis worker', role: WORKER_DESCRIPTIONS.analyst, tools: [] },
];

export const lab53: LabImplementation<Lab53Input, Lab53Output, LabServices> = {
  definition: lab53Definition as LabDefinition,
  inputSchema: Lab53InputSchema,

  async run(ctx, input) {
    const limits: Limits = {
      maxDelegations: input.maxDelegations,
      perWorkerLimit: input.perWorkerLimit,
      tokenBudget: input.tokenBudget,
    };
    const ledger = new Ledger();
    const audit: AuditEntry[] = [];
    const messages: ConversationMessage[] = [];
    const post = (m: Omit<ConversationMessage, 'seq'>) => {
      messages.push({ seq: messages.length + 1, ...m });
      ctx.log('info', `${m.from} → ${m.to} [${m.kind}]: ${m.summary}`);
    };
    const model = (offline: ReturnType<typeof supervisorScript>) =>
      ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline });

    const workers = Object.fromEntries(
      WORKERS.map((w) => [
        w,
        withLabLogger(
          ctx,
          new Agent({
            id: w,
            name: w,
            description: WORKER_DESCRIPTIONS[w],
            instructions: WORKER_INSTRUCTIONS[w],
            model: model(workerScript(w)).model,
            ...(w === 'researcher' ? { tools: { search_sources: searchTool } } : {}),
          }),
        ),
      ]),
    ) as Record<Worker, Agent<string, any>>; // eslint-disable-line @typescript-eslint/no-explicit-any
    const supModel = model(supervisorScript());
    const faultLine = input.fault === 'none' ? '' : FAULT_LINES[input.fault];
    const supervisor = withLabLogger(
      ctx,
      new Agent({
        id: 'supervisor',
        name: 'Supervisor',
        instructions: supervisorInstructions(input.fault),
        model: supModel.model,
        agents: workers,
      }),
    );
    if (faultLine) ctx.log('warn', `Fault injection (${input.fault}): ${faultLine.trim()}`);
    post({
      from: 'user',
      to: 'supervisor',
      kind: 'task',
      stepId: 'supervisor',
      round: null,
      summary: 'Task',
      content: input.task,
    });

    const res = await streamAgent(ctx, supervisor, input.task, {
      maxSteps: input.maxIterations,
      emitTokens: false,
      delegation: {
        // Fail closed: a throwing hook blocks the delegation instead of letting it bypass the budget.
        hookErrorStrategy: 'throw',
        // Workers see only their delegation prompt, never the supervisor's conversation.
        messageFilter: () => [],
        onDelegationStart: (d: { primitiveId: string; prompt: string; toolCallId: string }) => {
          const budgetBefore = ledger.snapshot();
          const decision = decideDelegation(ledger, limits, d.primitiveId, d.prompt);
          const entry: AuditEntry = {
            seq: audit.length + 1,
            toolCallId: d.toolCallId,
            worker: d.primitiveId,
            prompt: d.prompt,
            decision: decision.accepted ? 'accepted' : 'refused',
            reason: decision.accepted ? null : decision.reason,
            detail: decision.accepted ? null : decision.detail,
            budgetBefore,
            workerMaxSteps: decision.accepted ? WORKER_MAX_STEPS : null,
            completion: null,
          };
          audit.push(entry);
          if (!decision.accepted) {
            post({
              from: 'orchestrator',
              to: 'supervisor',
              kind: 'refusal',
              stepId: 'delegation',
              round: entry.seq,
              summary: `Refused delegation to ${d.primitiveId}: ${decision.reason}`,
              content: `${decision.detail}\n\nPrompt:\n${d.prompt}`,
            });
            return { proceed: false, rejectionReason: `${decision.reason}: ${decision.detail}` };
          }
          post({
            from: 'supervisor',
            to: d.primitiveId,
            kind: 'task',
            stepId: 'delegation',
            round: entry.seq,
            summary: `Delegation ${ledger.accepted}/${limits.maxDelegations} accepted (${budgetBefore.tokens}/${limits.tokenBudget} tokens spent)`,
            content: d.prompt,
          });
          return { modifiedMaxSteps: WORKER_MAX_STEPS };
        },
        onDelegationComplete: (d: {
          toolCallId: string;
          primitiveId: string;
          success: boolean;
          duration: number;
          result: { text: string; usage?: { totalTokens?: number }; subAgentToolResults?: { toolName: string }[] };
        }) => {
          const tokens = d.result.usage?.totalTokens ?? 0;
          ledger.spend(tokens);
          const entry = audit.find((a) => a.toolCallId === d.toolCallId);
          if (entry)
            entry.completion = {
              success: d.success,
              durationMs: Math.round(d.duration),
              tokens,
              workerTools: (d.result.subAgentToolResults ?? []).map((t) => t.toolName),
              text: d.result.text,
              budgetAfter: ledger.snapshot(),
            };
          post({
            from: d.primitiveId,
            to: 'supervisor',
            kind: 'result',
            stepId: 'delegation',
            round: entry?.seq ?? null,
            summary: `${d.success ? 'Result' : 'Failed'}: ${tokens} tokens, ${Math.round(d.duration)} ms`,
            content: d.result.text,
          });
          return { resultText: `${d.result.text}\n${budgetLine(ledger, limits)}` };
        },
      },
    });
    ctx.setResultExtras({
      effective: {
        mode: ctx.mode,
        modelId: input.modelId,
        simulated: supModel.simulated,
        maxIterations: input.maxIterations,
        workerMaxSteps: WORKER_MAX_STEPS,
      },
      annotations: {
        tokensSpent: ledger.spentTokens,
        tokenUsageSource: supModel.simulated ? 'scripted model counts (simulated)' : 'provider usage',
      },
    });

    const answer = res.text.trim();
    const partial = audit.filter((a) => a.completion?.success).map((a) => ({ worker: a.worker, text: a.completion!.text }));
    const status: Lab53Output['outcome']['status'] = answer
      ? 'finished'
      : res.steps >= input.maxIterations
        ? 'stopped'
        : 'failed';
    if (status === 'finished')
      post({
        from: 'supervisor',
        to: 'user',
        kind: 'final',
        stepId: 'supervisor',
        round: null,
        summary: 'Final answer',
        content: answer,
      });
    else
      post({
        from: 'orchestrator',
        to: 'human',
        kind: 'escalation',
        stepId: 'supervisor',
        round: null,
        summary:
          status === 'stopped'
            ? `Stopped at the iteration cap (${input.maxIterations} steps) without a final answer`
            : 'The supervisor gave no answer',
        content: partial.map((p) => `${p.worker}: ${p.text}`).join('\n\n') || '(no worker results)',
      });

    return {
      limits: { ...limits, maxIterations: input.maxIterations },
      audit,
      delegationCalls: res.tools
        .filter((t) => t.toolName.startsWith('agent-'))
        .map((t) => ({ toolCallId: t.toolCallId, toolName: t.toolName })),
      supervisorSteps: res.steps,
      finishReason: res.finishReason,
      outcome: { status, answer, partial },
      budget: ledger.snapshot(),
      agentConversation: {
        agents: AGENTS,
        messages,
        outcome: {
          status: status === 'finished' ? 'resolved' : status === 'stopped' ? 'needs-human' : 'failed',
          text: answer,
          issues: audit.filter((a) => a.decision === 'refused').map((a) => `${a.worker}: ${a.reason} (${a.detail})`),
        },
      },
      error: null,
    };
  },

  validate(out, input) {
    const accepted = out.audit.filter((a) => a.decision === 'accepted');
    const refused = out.audit.filter((a) => a.decision === 'refused');

    const auditedOk =
      out.delegationCalls.length === out.audit.length &&
      out.delegationCalls.every((c) => out.audit.filter((a) => a.toolCallId === c.toolCallId).length === 1) &&
      accepted.every((a) => a.completion !== null && a.workerMaxSteps === 3) &&
      refused.every((a) => a.reason !== null && a.detail !== null);

    const perWorker = (w: string) => accepted.filter((a) => a.worker === w).length;
    const budgetOk =
      accepted.length <= input.maxDelegations &&
      WORKERS.every((w) => perWorker(w) <= input.perWorkerLimit) &&
      accepted.every((a) => a.budgetBefore.tokens < input.tokenBudget);

    const keys = accepted.map((a) => `${a.worker}|${normalisePrompt(a.prompt)}`);
    const reasons = new Set(refused.map((a) => a.reason));
    // The limits must hold whatever the supervisor does. Whether an injected fault was actually acted on
    // (a live model may ignore it) is reported in the message, not required.
    const cycleOk =
      new Set(keys).size === keys.length && out.supervisorSteps <= input.maxIterations && out.outcome.status !== 'failed';
    const exercised =
      input.fault === 'repeat-delegation'
        ? reasons.has('duplicate')
          ? '; repeat fault exercised: duplicate refused'
          : '; repeat fault not exercised: the supervisor did not resend the task'
        : input.fault === 'runaway'
          ? refused.length > 0 || out.outcome.status === 'stopped'
            ? '; runaway fault exercised'
            : '; runaway fault not exercised: the supervisor finished on its own'
          : '';

    // Each worker either ran successfully, or was refused because the budget ran out.
    const budgetReasons: (string | null)[] = ['total-cap', 'token-budget'];
    const firstAccepted = WORKERS.map((w) => accepted.findIndex((a) => a.worker === w));
    const ran = WORKERS.filter((w, i) => firstAccepted[i]! >= 0 && accepted[firstAccepted[i]!]!.completion?.success);
    const dispatchedOk =
      WORKERS.every((w) => ran.includes(w) || refused.some((a) => a.worker === w && budgetReasons.includes(a.reason))) &&
      firstAccepted.filter((i) => i >= 0).every((v, i, arr) => i === 0 || v > arr[i - 1]!) &&
      out.audit.every((a) => isWorker(a.worker));

    const o = out.outcome;
    const finalOk =
      o.status === 'finished'
        ? o.answer.length > 0
        : o.status === 'stopped' &&
          out.supervisorSteps === input.maxIterations &&
          o.partial.length === accepted.filter((a) => a.completion?.success).length;

    return summarizeChecks([
      {
        id: 'decisions-audited',
        label: 'Every delegation decision is audited once, with its reason, budget snapshot and, when accepted, its usage',
        passed: auditedOk,
        message: `${out.audit.length} decisions for ${out.delegationCalls.length} delegation calls (${accepted.length} accepted, ${refused.length} refused)`,
      },
      {
        id: 'budget-respected',
        label: 'Delegations stay within the total cap, the per-worker cap and the token budget',
        passed: budgetOk,
        message: `${accepted.length}/${input.maxDelegations} delegations; ${WORKERS.map((w) => `${w} ${perWorker(w)}`).join(', ')}; ${out.budget.tokens}/${input.tokenBudget} tokens`,
      },
      {
        id: 'cycle-limits',
        label: 'No delegation runs twice and the supervisor stays within its iteration cap',
        passed: cycleOk,
        message: `${out.supervisorSteps}/${input.maxIterations} supervisor steps; refusals: ${[...reasons].join(', ') || 'none'}${exercised}`,
      },
      {
        id: 'tasks-dispatched',
        label: 'Research, planning and analysis are dispatched in order, or refused for budget',
        passed: dispatchedOk,
        message: `ran: ${ran.join(' → ') || 'none'}`,
      },
      {
        id: 'final-answer',
        label: 'The supervisor answers, or the run is reported as stopped at the cap with its partial results',
        passed: finalOk,
        message: `${o.status}${o.status === 'finished' ? '' : `, ${o.partial.length} partial result(s)`}`,
      },
    ]);
  },
};
