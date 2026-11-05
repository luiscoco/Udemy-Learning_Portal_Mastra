import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { LabError } from '@mlp/lab-engine';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';
import type { LabServices } from '../services.js';

export const Lab75InputSchema = z.object({
  question: z.string().trim().min(5).max(500),
  threadId: z.string().regex(/^[a-z0-9][a-z0-9-]{2,40}$/),
  caseId: z.enum(['case-100', 'case-expired', 'case-foreign']),
  action: z.enum(['answer', 'refund']),
  amountCents: z.number().int().min(1).max(50_000),
  approver: z.enum(['approve', 'decline', 'ask']),
  fault: z.enum(['none', 'bad-citation']),
  modelId: z.enum(DEFAULT_LIVE_MODELS),
});
export type Lab75Input = z.infer<typeof Lab75InputSchema>;

export const ReceiptSchema = z.object({ id: z.string(), caseId: z.string(), amountCents: z.number().int().positive() });
const LedgerSchema = z.record(z.string(), ReceiptSchema);
export const ActionSchema = z.object({
  status: z.enum(['not-requested', 'blocked', 'declined', 'issued', 'already-issued', 'conflict']),
  reason: z.string(),
  receipt: ReceiptSchema.nullable(),
});
export type RefundAction = z.infer<typeof ActionSchema>;

/** All customer records are teaching fixtures. Only the server decides their owner and eligibility. */
export function lookupCase(partition: string, caseId: string) {
  const record = {
    'case-100': { owner: partition, totalCents: 25_000, daysSinceDelivery: 10, unused: true },
    'case-expired': { owner: partition, totalCents: 25_000, daysSinceDelivery: 45, unused: true },
    'case-foreign': { owner: 'another-tenant', totalCents: 99_999, daysSinceDelivery: 1, unused: true },
  }[caseId];
  return record?.owner === partition
    ? {
        available: true as const,
        caseId,
        totalCents: record.totalCents,
        daysSinceDelivery: record.daysSinceDelivery,
        unused: record.unused,
      }
    : { available: false as const };
}

export function eligible(partition: string, caseId: string, amountCents: number): boolean {
  const c = lookupCase(partition, caseId);
  return (
    c.available &&
    c.unused &&
    c.daysSinceDelivery <= 30 &&
    Number.isInteger(amountCents) &&
    amountCents > 0 &&
    amountCents <= c.totalCents
  );
}

export function ledgerOf(services: LabServices) {
  const dir = services.files('lab-75');
  mkdirSync(dir, { recursive: true });
  const file = join(dir, 'refunds.json');
  const receipts = existsSync(file) ? LedgerSchema.parse(JSON.parse(readFileSync(file, 'utf8'))) : {};
  return { file, receipts };
}

/** Called only inside the tenant lock. Recheck every control at the side-effect boundary. No real payment API. */
export function issueRefund(o: {
  services: LabServices;
  signal: AbortSignal;
  caseId: string;
  amountCents: number;
  qualityPassed: boolean;
  approved: boolean;
}): RefundAction {
  if (o.signal.aborted) throw o.signal.reason ?? new LabError('CANCELLED', 'Cancelled before the simulated refund.');
  const blocked = (reason: string): RefundAction => ({ status: 'blocked', reason, receipt: null });
  if (!eligible(o.services.tenant.partition, o.caseId, o.amountCents))
    return blocked('Case unavailable or amount outside the trusted refund policy.');
  if (!o.qualityPassed || !o.approved) return blocked('A passing quality gate and approval are both required.');
  const { file, receipts } = ledgerOf(o.services);
  const previous = receipts[o.caseId];
  if (previous)
    return {
      status: previous.amountCents === o.amountCents ? 'already-issued' : 'conflict',
      reason: 'This case already has a simulated refund; no second payment was made.',
      receipt: previous,
    };
  const receipt = {
    id: `sim-${createHash('sha256').update(`${o.services.tenant.partition}:${o.caseId}`).digest('hex').slice(0, 12)}`,
    caseId: o.caseId,
    amountCents: o.amountCents,
  };
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify({ ...receipts, [o.caseId]: receipt }));
  renameSync(temporary, file);
  return { status: 'issued', reason: 'Simulated refund recorded. No money moved.', receipt };
}

export class ToolBudget {
  used = 0;
  readonly limit = 8;
  take(signal: AbortSignal) {
    if (signal.aborted) throw signal.reason ?? new LabError('CANCELLED', 'Cancelled.');
    if (this.used >= this.limit) throw new LabError('VALIDATION_FAILED', 'Capstone tool budget exhausted.');
    this.used += 1;
  }
}
