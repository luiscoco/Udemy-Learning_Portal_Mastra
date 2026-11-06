import { randomUUID } from 'node:crypto';
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { Mastra } from '@mastra/core/mastra';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { LibSQLStore } from '@mastra/libsql';

export const WORKFLOW_ID = 'billing-run';
export const RETRY_ATTEMPTS = 3;

export const InvoiceSchema = z.object({
  invoiceId: z.string().regex(/^INV-\d{1,6}$/),
  customer: z.string().trim().min(1).max(80),
  amount: z.number().min(0.01).max(10_000),
  /** Transient 503s the provider returns before this charge succeeds (within the retry budget). */
  failTimes: z.number().int().min(0).max(RETRY_ATTEMPTS - 1).default(0),
});
export type Invoice = z.infer<typeof InvoiceSchema>;

export const BatchInputSchema = z.object({ invoices: z.array(InvoiceSchema).min(1).max(6) });
export type BatchInput = z.infer<typeof BatchInputSchema>;

export const BillingStateSchema = z.object({
  charged: z.array(z.object({ invoiceId: z.string(), chargeId: z.string(), attempts: z.number().int() })),
  total: z.number(),
});
export type BillingState = z.infer<typeof BillingStateSchema>;
export const INITIAL_STATE: BillingState = { charged: [], total: 0 };

export const BatchResultSchema = z.object({ chargedCount: z.number().int(), total: z.number(), summary: z.string(), state: BillingStateSchema });
export type BatchResult = z.infer<typeof BatchResultSchema>;

export const chargeStepId = (invoiceId: string) => `charge-${invoiceId}`;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ---------- Simulated charge provider (durable ledger) ----------

export interface Charge {
  batch: string;
  invoiceId: string;
  chargeId: string;
  idempotencyKey: string | null;
  amount: number;
  pid: number;
  at: string;
}

export class ChargeProvider {
  /** Calls per batch:invoice (in memory): drives the transient failures. */
  private readonly calls = new Map<string, number>();
  constructor(readonly file: string) {}

  callsFor(batch: string, invoiceId: string) {
    return this.calls.get(`${batch}:${invoiceId}`) ?? 0;
  }

  /** Fails with 503 (nothing recorded) the first `failTimes` calls, then records; a known key replays. */
  charge(o: { key: string | null; batch: string; invoice: Invoice }): { chargeId: string; replayed: boolean } {
    const k = `${o.batch}:${o.invoice.invoiceId}`;
    const n = (this.calls.get(k) ?? 0) + 1;
    this.calls.set(k, n);
    if (n <= o.invoice.failTimes) throw new Error('503 service unavailable');
    const existing = o.key ? this.read(o.batch).find((c) => c.idempotencyKey === o.key) : undefined;
    if (existing) return { chargeId: existing.chargeId, replayed: true };
    const c: Charge = {
      batch: o.batch,
      invoiceId: o.invoice.invoiceId,
      chargeId: `CH-${randomUUID().slice(0, 8)}`,
      idempotencyKey: o.key,
      amount: o.invoice.amount,
      pid: process.pid,
      at: new Date().toISOString(),
    };
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, `${JSON.stringify(c)}\n`);
    return { chargeId: c.chargeId, replayed: false };
  }

  read(batch?: string): Charge[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as Charge)
      .filter((c) => batch === undefined || c.batch === batch);
  }
}

// ---------- Workflow ----------

export interface Execution {
  stepId: string;
  instance: string;
  /** Invoice ids already in the workflow state when the step started. */
  chargedAtEntry: string[];
  attempt: number;
}

export interface BillingDeps {
  provider: ChargeProvider;
  idempotency: 'key' | 'none';
  /** Which worker this is ("A" before a crash, "B" after the restart): recorded in the execution log. */
  instance: string;
  executions: Execution[];
  retryDelayMs: number;
  /** When set, this worker "crashes" right after the provider records this invoice's charge. */
  crashAfter?: { invoiceId: string; onCrash: () => void };
  summarize: (state: BillingState) => Promise<string>;
}

/** Builds a fresh billing workflow and Mastra instance for these invoices (same input → same step graph). */
export function openBilling(storage: LibSQLStore, invoices: Invoice[], deps: BillingDeps) {
  const Pass = BatchInputSchema;
  const openBatch = createStep({
    id: 'openBatch',
    description: 'Validates the batch (no side effects).',
    inputSchema: Pass,
    outputSchema: Pass,
    stateSchema: BillingStateSchema,
    execute: async ({ inputData }) => inputData,
  });
  const chargeSteps = invoices.map((inv) =>
    createStep({
      id: chargeStepId(inv.invoiceId),
      description: `Charges ${inv.invoiceId} (idempotent, retried on transient errors).`,
      inputSchema: Pass,
      outputSchema: Pass,
      stateSchema: BillingStateSchema,
      execute: async ({ inputData, state, setState, runId, retryCount }) => {
        const s = state ?? INITIAL_STATE;
        deps.executions.push({
          stepId: chargeStepId(inv.invoiceId),
          instance: deps.instance,
          chargedAtEntry: s.charged.map((c) => c.invoiceId),
          attempt: (retryCount ?? 0) + 1,
        });
        const paid = deps.provider.charge({ key: deps.idempotency === 'key' ? `charge:${runId}:${inv.invoiceId}` : null, batch: runId, invoice: inv });
        if (deps.crashAfter?.invoiceId === inv.invoiceId) {
          deps.crashAfter.onCrash();
          await new Promise<never>(() => {}); // the worker is gone: this step never returns
        }
        const charged = [...s.charged.filter((c) => c.invoiceId !== inv.invoiceId), { invoiceId: inv.invoiceId, chargeId: paid.chargeId, attempts: (retryCount ?? 0) + 1 }];
        await setState({ charged, total: round2(charged.reduce((n, c) => n + (invoices.find((i) => i.invoiceId === c.invoiceId)?.amount ?? 0), 0)) });
        return inputData;
      },
    }),
  );
  const closeBatch = createStep({
    id: 'closeBatch',
    description: 'Summarises the batch for the operator from the workflow state.',
    inputSchema: Pass,
    outputSchema: BatchResultSchema,
    stateSchema: BillingStateSchema,
    execute: async ({ state }) => {
      const s = state ?? INITIAL_STATE;
      return { chargedCount: s.charged.length, total: s.total, summary: await deps.summarize(s), state: s };
    },
  });
  let wf = createWorkflow({
    id: WORKFLOW_ID,
    // Recovery is owned by this lab's explicit selected-run operator, not a generic boot-time sweep.
    options: { autoRestartActiveRuns: false },
    inputSchema: Pass,
    outputSchema: BatchResultSchema,
    stateSchema: BillingStateSchema,
    retryConfig: { attempts: RETRY_ATTEMPTS, delay: deps.retryDelayMs },
  }).then(openBatch);
  for (const s of chargeSteps) wf = wf.then(s);
  const workflow = wf.then(closeBatch).commit();
  const mastra = new Mastra({ workflows: { [WORKFLOW_ID]: workflow }, storage, logger: false });
  return { mastra, workflow: mastra.getWorkflow(WORKFLOW_ID) };
}
