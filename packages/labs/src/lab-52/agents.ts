import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import type { PromptView, ScriptedTurn } from '@mlp/mastra-runtime';
import { modelOutput } from '../lab-50/run.js';
import {
  ALLOWED,
  CaseSchema,
  DOMAIN_FIELD,
  expectedTarget,
  extractCase,
  PRODUCTS,
  SPECIALISTS,
  type AgentId,
  type Case,
  type Packet,
  type Specialist,
} from './routing.js';

/** A transfer request, recorded by a transfer tool for the orchestrator to accept or refuse. */
export interface TransferRequest {
  from: AgentId;
  to: Specialist;
  reason: string;
  note: string | null;
  case: Case | null;
}

/** The run's handoff desk: transfer tools only queue requests here; they never run another agent. */
export class HandoffDesk {
  readonly requests: TransferRequest[] = [];
  take(from: AgentId): TransferRequest | null {
    return this.requests.filter((r) => r.from === from).at(-1) ?? null;
  }
}

/**
 * Ends an agent's loop once it has queued a transfer. A transfer call with invalid arguments queues
 * nothing, so the model sees the validation error and can retry within maxSteps.
 */
export const stopWhenQueued = (desk: HandoffDesk, from: AgentId) => () => desk.requests.some((r) => r.from === from);

const Reason = z.string().trim().min(3).max(200);
const queued = z.object({ queued: z.boolean() });

export function triageTools(desk: HandoffDesk) {
  return Object.fromEntries(
    SPECIALISTS.map((to) => [
      `transfer_to_${to}`,
      createTool({
        id: `transfer_to_${to}`,
        description: `Hands the case to the ${to} specialist. Fill in every field you can find in the message; use null when a field is unknown. Never put card numbers or passwords in the summary.`,
        inputSchema: CaseSchema.extend({ reason: Reason }),
        outputSchema: queued,
        execute: async ({ reason, ...c }) => (
          desk.requests.push({ from: 'triage', to, reason, note: null, case: c }),
          { queued: true }
        ),
      }),
    ]),
  );
}

/** Local fixture data for the domain tools. */
export const INVOICES: Record<string, { customerId: string; charges: { amount: number; at: string }[] }> = {
  'ORD-7781': {
    customerId: 'C-1042',
    charges: [
      { amount: 49, at: '2026-10-01' },
      { amount: 49, at: '2026-10-01' },
    ],
  },
  'ORD-5520': { customerId: 'C-2201', charges: [{ amount: 120, at: '2026-09-12' }] },
};
export const INCIDENTS: Record<string, { status: string; incident: string | null; note: string }> = {
  Reports: { status: 'degraded', incident: 'INC-311', note: 'Exports fail with E503; a fix is rolling out' },
};
export const ACCOUNTS: Record<string, { status: string; reason: string | null }> = {
  'C-3300': { status: 'locked', reason: 'too many failed logins' },
  'C-1042': { status: 'active', reason: null },
};

function domainTool(s: Specialist) {
  if (s === 'billing')
    return createTool({
      id: 'lookup_invoice',
      description: 'Looks up the charges of an order.',
      inputSchema: z.object({ orderId: z.string().regex(/^ORD-\d{3,8}$/) }),
      execute: async ({ orderId }) => {
        const inv = INVOICES[orderId];
        return inv ? { found: true, orderId, ...inv, duplicate: inv.charges.length > 1 } : { found: false, orderId };
      },
    });
  if (s === 'technical')
    return createTool({
      id: 'check_service_status',
      description: 'Returns the current status of a product and any open incident.',
      inputSchema: z.object({ product: z.enum(PRODUCTS) }),
      execute: async ({ product }) => ({
        product,
        ...(INCIDENTS[product] ?? { status: 'operational', incident: null, note: 'No known issue' }),
      }),
    });
  return createTool({
    id: 'lookup_account',
    description: 'Returns the status of a customer account.',
    inputSchema: z.object({ customerId: z.string().regex(/^C-\d{3,6}$/) }),
    execute: async ({ customerId }) => ({ customerId, ...(ACCOUNTS[customerId] ?? { status: 'unknown', reason: null }) }),
  });
}
export const DOMAIN_TOOL: Record<Specialist, string> = {
  billing: 'lookup_invoice',
  technical: 'check_service_status',
  account: 'lookup_account',
};

export function specialistTools(s: Specialist, desk: HandoffDesk) {
  return {
    [DOMAIN_TOOL[s]]: domainTool(s),
    ...Object.fromEntries(
      ALLOWED[s].map((to) => [
        `transfer_to_${to}`,
        createTool({
          id: `transfer_to_${to}`,
          description: `Transfers the case to the ${to} specialist when it is not yours. You cannot change the case; add a short note.`,
          inputSchema: z.object({ reason: Reason, note: z.string().trim().max(200).nullable() }),
          outputSchema: queued,
          execute: async ({ reason, note }) => (desk.requests.push({ from: s, to, reason, note, case: null }), { queued: true }),
        }),
      ]),
    ),
  };
}

export const TRIAGE_INSTRUCTIONS =
  'You are the triage agent of a support desk. You never answer the customer yourself. ' +
  'Read the message and call exactly one transfer tool: billing (charges, refunds, invoices), technical (errors, crashes, a product not working) or account (login, locked accounts, two-factor). ' +
  'Extract the customer id (C-…), order id (ORD-…), product, error code (E…) and account issue when present, otherwise null, and write a one-sentence summary without card numbers or passwords.';

export const SPECIALIST_INSTRUCTIONS: Record<Specialist, string> = {
  billing: 'You are the billing specialist. You handle charges, refunds and invoices.',
  technical: 'You are the technical specialist. You handle errors, crashes and products that do not work.',
  account: 'You are the account specialist. You handle logins, locked accounts and two-factor problems.',
};
export const SPECIALIST_COMMON =
  ' You receive a handoff packet with only the fields you need. If the case belongs to you, call your lookup tool with the packet value and answer the customer in one or two sentences based on the result. ' +
  'If it belongs to another specialist, call that transfer tool with a reason instead. Never ask for card numbers or passwords.';
export const PING_PONG_LINE = ' Fault injection: never resolve; always transfer the case to another specialist.';

/** The specialist's prompt: the packet and the handoff metadata, nothing else. */
export const specialistPrompt = (packet: Packet, from: AgentId, reason: string, note: string | null) =>
  `HANDOFF PACKET:\n${JSON.stringify(packet)}\nFROM: ${from}\nREASON: ${reason}${note ? `\nNOTE: ${note}` : ''}`;

/** Offline triage: transfer to the oracle's target with the oracle's case record. */
export function triageScript() {
  return (view: PromptView): ScriptedTurn => {
    const to = expectedTarget(view.lastUser);
    const c = extractCase(view.lastUser);
    return { text: '', toolCalls: [{ toolName: `transfer_to_${to}`, input: { ...c, reason: `The message is about ${to}.` } }] };
  };
}

/** Offline specialist: transfer when the case is not its own (or under the ping-pong fault), else look up and reply. */
export function specialistScript(self: Specialist) {
  return (view: PromptView): ScriptedTurn => {
    const packet = JSON.parse(/^HANDOFF PACKET:\n(.+)$/m.exec(view.lastUser)?.[1] ?? '{}') as Packet;
    const result = view.toolResults.find((r) => r.toolName === DOMAIN_TOOL[self]);
    if (result) return { text: reply(self, modelOutput(result.output)) };
    const owner = expectedTarget(String(packet.summary ?? ''));
    const pingPong = view.system.includes(PING_PONG_LINE.trim());
    if (pingPong || owner !== self) {
      const to = pingPong ? ALLOWED[self][0]! : owner;
      return {
        text: '',
        toolCalls: [
          {
            toolName: `transfer_to_${to}`,
            input: {
              reason: pingPong ? 'Fault injection: transferring instead of resolving.' : `This case is about ${to}.`,
              note: null,
            },
          },
        ],
      };
    }
    const value = packet[DOMAIN_FIELD[self]];
    if (!value) return { text: `I need your ${DOMAIN_FIELD[self]} to look into this.` };
    return { text: '', toolCalls: [{ toolName: DOMAIN_TOOL[self], input: { [DOMAIN_FIELD[self]]: value } }] };
  };
}

function reply(self: Specialist, r: Record<string, unknown>): string {
  if (self === 'billing') {
    if (!r.found) return `I could not find order ${String(r.orderId)}.`;
    const charges = r.charges as { amount: number }[];
    return r.duplicate
      ? `Order ${String(r.orderId)} was charged ${charges.length} times (${charges[0]!.amount.toFixed(2)} each). A refund of ${charges[0]!.amount.toFixed(2)} for the duplicate charge has been requested.`
      : `Order ${String(r.orderId)} has a single charge of ${charges[0]!.amount.toFixed(2)}; there is no duplicate.`;
  }
  if (self === 'technical')
    return r.incident
      ? `${String(r.product)} is ${String(r.status)} (${String(r.incident)}): ${String(r.note)}.`
      : `${String(r.product)} is ${String(r.status)}: ${String(r.note)}.`;
  return r.status === 'locked'
    ? `Account ${String(r.customerId)} is locked (${String(r.reason)}). Use the self-service unlock link on the sign-in page.`
    : `Account ${String(r.customerId)} is ${String(r.status)}.`;
}
