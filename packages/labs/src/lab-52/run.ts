import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { summarizeChecks, type AgentConversation, type ConversationMessage, type LabDefinition } from '@mlp/contracts';
import type { LabImplementation } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';
import { withLabLogger } from '../shared/agent-kit.js';
import { runTypedWorkflow } from '../shared/workflow-stream.js';
import {
  DOMAIN_TOOL,
  HandoffDesk,
  PING_PONG_LINE,
  SPECIALIST_COMMON,
  SPECIALIST_INSTRUCTIONS,
  specialistPrompt,
  specialistScript,
  specialistTools,
  TRIAGE_INSTRUCTIONS,
  triageScript,
  triageTools,
} from './agents.js';
import { lab52Definition } from './definition.js';
import {
  DOMAIN_FIELD,
  expectedTarget,
  extractCase,
  PACKET_FIELDS,
  redact,
  secretsIn,
  SPECIALISTS,
  type AgentId,
  type Case,
  type Specialist,
} from './routing.js';
import {
  buildHandoffWorkflow,
  FAULTS,
  OutcomeSchema,
  type DecisionRecord,
  type Orchestration,
  type Outcome,
  type PacketRecord,
} from './workflow.js';

export const Lab52InputSchema = z.object({
  message: z.string().trim().min(10).max(1_000),
  routingFault: z.enum(FAULTS),
  maxHops: z.number().int().min(1).max(4),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab52Input = z.infer<typeof Lab52InputSchema>;

export interface Lab52Output {
  /** The case record triage extracted (the orchestrator's copy; specialists only see packets). */
  case: Case | null;
  triageChoice: Specialist | null;
  decisions: DecisionRecord[];
  packets: PacketRecord[];
  visited: Specialist[];
  outcome: Outcome | null;
  toolCalls: { agent: AgentId; toolName: string; args: unknown; status: string }[];
  agentConversation: AgentConversation;
  error: string | null;
}

const AGENTS: AgentConversation['agents'] = [
  {
    id: 'orchestrator',
    name: 'Workflow (orchestrator)',
    role: 'Accepts or refuses every handoff; builds the packets',
    tools: [],
  },
  {
    id: 'triage',
    name: 'Triage agent',
    role: 'Extracts the case and requests one transfer',
    tools: SPECIALISTS.map((s) => `transfer_to_${s}`),
  },
  ...SPECIALISTS.map((s) => ({
    id: s,
    name: `${s[0]!.toUpperCase()}${s.slice(1)} specialist`,
    role: SPECIALIST_INSTRUCTIONS[s].replace(/^You are the \w+ specialist\. /, ''),
    tools: [DOMAIN_TOOL[s], ...SPECIALISTS.filter((t) => t !== s).map((t) => `transfer_to_${t}`)],
  })),
];

export const lab52: LabImplementation<Lab52Input, Lab52Output, LabServices> = {
  definition: lab52Definition as LabDefinition,
  inputSchema: Lab52InputSchema,

  async run(ctx, input) {
    const desk = new HandoffDesk();
    const resolve = (offline: ReturnType<typeof triageScript>) =>
      ctx.services.models.resolve({ mode: ctx.mode, modelId: input.modelId, offline });
    const triageModel = resolve(triageScript());
    const triage = withLabLogger(
      ctx,
      new Agent({
        id: 'triage',
        name: 'Triage agent',
        instructions: TRIAGE_INSTRUCTIONS,
        model: triageModel.model,
        tools: triageTools(desk),
      }),
    );
    const fault = input.routingFault === 'ping-pong' ? PING_PONG_LINE : '';
    const specialists = Object.fromEntries(
      SPECIALISTS.map((s) => [
        s,
        withLabLogger(
          ctx,
          new Agent({
            id: s,
            name: `${s} specialist`,
            instructions: SPECIALIST_INSTRUCTIONS[s] + SPECIALIST_COMMON + fault,
            model: resolve(specialistScript(s)).model,
            tools: specialistTools(s, desk),
          }),
        ),
      ]),
    ) as Orchestration['specialists'];

    const messages: ConversationMessage[] = [];
    const post: Orchestration['post'] = (m) => {
      messages.push({ seq: messages.length + 1, ...m });
      ctx.log('info', `${m.from} → ${m.to} [${m.kind}${m.round === null ? '' : ` hop ${m.round}`}]: ${m.summary}`);
    };
    post({
      from: 'customer',
      to: 'triage',
      kind: 'task',
      stepId: 'triage',
      round: null,
      summary: 'Customer message (card numbers and passwords redacted here)',
      content: redact(input.message),
    });
    if (fault)
      ctx.log('warn', 'Fault injection: every specialist is told never to resolve (ping-pong); the guards must stop it.');
    const record: Orchestration['record'] = {
      triageChoice: null,
      triageTools: [],
      decisions: [],
      packets: [],
      specialistTools: [],
    };
    const workflow = buildHandoffWorkflow({
      ctx,
      triage,
      specialists,
      desk,
      fault: input.routingFault,
      maxHops: input.maxHops,
      post,
      record,
    });
    const res = await runTypedWorkflow(
      ctx,
      'handoff-workflow',
      await workflow.createRun(),
      { message: input.message },
      OutcomeSchema,
    );
    ctx.setResultExtras({
      effective: { mode: ctx.mode, modelId: input.modelId, simulated: triageModel.simulated, maxHops: input.maxHops },
    });

    const outcome = res.typed;
    return {
      case: desk.requests.find((r) => r.from === 'triage')?.case ?? null,
      triageChoice: record.triageChoice,
      decisions: record.decisions,
      packets: record.packets,
      visited: record.packets.map((p) => p.to),
      outcome,
      toolCalls: [
        ...record.triageTools.map((t) => ({ agent: 'triage' as const, toolName: t.toolName, args: t.args, status: t.status })),
        ...record.specialistTools.map((t) => ({ agent: t.agent, toolName: t.toolName, args: t.args, status: t.status })),
      ],
      agentConversation: {
        agents: AGENTS,
        messages,
        outcome: outcome
          ? {
              status: outcome.status === 'resolved' ? 'resolved' : 'needs-human',
              text: outcome.reply,
              issues: outcome.escalation ? [`${outcome.escalation.reason}: ${outcome.escalation.detail}`] : [],
            }
          : { status: 'failed', text: '', issues: [res.error ?? 'the workflow did not finish'] },
      },
      error: res.error ?? null,
    };
  },

  validate(out, input) {
    const expected = expectedTarget(input.message);
    const truth = extractCase(input.message);
    const o = out.outcome;

    let targetOk: boolean;
    let targetMsg: string;
    if (!truth.customerId) {
      targetOk = o?.status === 'escalated' && o.escalation?.reason === 'missing-context';
      targetMsg = `no customer id: ${o?.escalation?.reason ?? o?.status ?? 'no outcome'}`;
    } else if (input.routingFault === 'ping-pong') {
      targetOk =
        out.triageChoice === expected &&
        o?.status === 'escalated' &&
        (o.escalation?.reason === 'cycle' || o.escalation?.reason === 'hop-limit');
      targetMsg = `triage chose ${out.triageChoice ?? 'nothing'} (expected ${expected}); ${o?.escalation?.reason ?? o?.status ?? 'no outcome'}`;
    } else {
      targetOk = out.triageChoice === expected && o?.status === 'resolved' && o.resolver === expected;
      targetMsg = `triage chose ${out.triageChoice ?? 'nothing'}, resolved by ${o?.resolver ?? 'nobody'} (expected ${expected})`;
    }

    const secrets = secretsIn(input.message);
    const leaks = out.packets.filter((p) => secrets.some((x) => p.prompt.includes(x)));
    const shapeOk = out.packets.every(
      (p) =>
        JSON.stringify(Object.keys(p.packet)) === JSON.stringify(PACKET_FIELDS[p.to]) &&
        p.prompt === specialistPrompt(p.packet, p.from as AgentId, p.reason, p.note),
    );

    const resolverPacket = o?.resolver ? out.packets.find((p) => p.to === o.resolver) : undefined;
    const field = o?.resolver ? DOMAIN_FIELD[o.resolver as Specialist] : null;
    const preservedOk =
      out.packets.every((p) => p.packet.customerId === truth.customerId) &&
      out.packets.every((p) => !('errorCode' in p.packet) || !truth.errorCode || p.packet.errorCode === truth.errorCode) &&
      (!resolverPacket || !field || !truth[field] || resolverPacket.packet[field] === truth[field]);

    const accepted = out.decisions.filter((d) => d.accepted);
    const refused = out.decisions.filter((d) => !d.accepted);
    const boundedOk =
      accepted.length <= input.maxHops &&
      new Set(out.visited).size === out.visited.length &&
      refused.length <= 1 &&
      (refused.length === 0 || out.decisions.at(-1) === refused[0]) &&
      out.decisions.length <= input.maxHops + 1;

    let toolOk = true;
    let toolMsg = 'not resolved: no lookup expected';
    if (o?.status === 'resolved' && resolverPacket && field) {
      const call = out.toolCalls.find((t) => t.agent === o.resolver && t.toolName === DOMAIN_TOOL[o.resolver as Specialist]);
      toolOk =
        !!call &&
        call.status === 'success' &&
        (call.args as Record<string, unknown>)[field] === resolverPacket.packet[field] &&
        !!o.reply;
      toolMsg = call
        ? `${o.resolver} called ${call.toolName}(${JSON.stringify(call.args)})`
        : `${o.resolver} answered without its tool`;
    }

    return summarizeChecks([
      {
        id: 'correct-target',
        label: 'The case reaches the correct specialist, or is escalated for the right reason',
        passed: targetOk,
        message: targetMsg,
      },
      {
        id: 'minimal-context',
        label: 'Each specialist receives only its packet fields: no raw message, card numbers or passwords',
        passed: shapeOk && leaks.length === 0,
        message: `${out.packets.length} packet(s); ${leaks.length ? `secret found in the prompt for ${leaks.map((l) => l.to).join(', ')}` : 'no secrets in any prompt'}`,
      },
      {
        id: 'context-preserved',
        label: 'The required context survives every hop (customer id, and the resolver’s domain field)',
        passed: preservedOk,
        message: out.packets.map((p) => `${p.to}: ${JSON.stringify(p.packet)}`).join('; ') || 'no packets',
      },
      {
        id: 'routing-bounded',
        label: 'No agent handles the case twice and handoffs stay within the hop limit',
        passed: boundedOk,
        message: `${out.decisions.map((d) => `${d.from}→${d.to} ${d.accepted ? 'accepted' : `refused (${d.reason})`}`).join(', ')}; limit ${input.maxHops}`,
      },
      {
        id: 'resolved-with-tool',
        label: 'A resolving specialist looks the case up with the packet value',
        passed: toolOk,
        message: toolMsg,
      },
    ]);
  },
};
