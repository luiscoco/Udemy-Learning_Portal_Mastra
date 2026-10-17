import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';
import { Mastra } from '@mastra/core/mastra';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { LibSQLStore } from '@mastra/libsql';

export const WORKFLOW_ID = 'account-onboarding';
export const CHECKPOINT_STEP = 'awaitDocuments';
export const PRE_CHECKPOINT_STEPS = ['createAccount', 'chargeFee', 'draftRequest'] as const;

export const ApplicantSchema = z.object({
  applicationId: z.string().regex(/^A-\d{1,6}$/),
  name: z.string().trim().min(1).max(80),
  email: z.string().email().max(120),
  plan: z.enum(['personal', 'business']),
});
export type Applicant = z.infer<typeof ApplicantSchema>;

export const DocumentSchema = z.object({
  type: z.enum(['id-document', 'proof-of-address', 'company-registration']),
  fileName: z.string().trim().min(1).max(120),
});
export type SubmittedDocument = z.infer<typeof DocumentSchema>;

export const REQUIRED_DOCUMENTS: Record<Applicant['plan'], SubmittedDocument['type'][]> = {
  personal: ['id-document', 'proof-of-address'],
  business: ['id-document', 'proof-of-address', 'company-registration'],
};
export const FEES: Record<Applicant['plan'], number> = { personal: 25, business: 49 };

export const OnboardingInputSchema = z.object({
  /** Business identity of the application: survives a rerun under a new workflow run id. */
  lineage: z.string().min(1).max(64),
  applicant: ApplicantSchema,
  /** Only used by the "rerun" anti-pattern: the documents are given up front instead of on resume. */
  prefilledDocuments: z.array(DocumentSchema).max(5).optional(),
});
export type OnboardingInput = z.infer<typeof OnboardingInputSchema>;

export const SuspendSchema = z.object({
  required: z.array(z.string()),
  message: z.string(),
  received: z.array(DocumentSchema),
});
export const ResumeSchema = z.object({ documents: z.array(DocumentSchema).min(1).max(5) });
export type ResumeData = z.infer<typeof ResumeSchema>;

export const ActivationSchema = z.object({
  accountId: z.string(),
  status: z.literal('active'),
  feeCharged: z.number(),
  documents: z.array(z.string()),
});
export type Activation = z.infer<typeof ActivationSchema>;

// ---------- Side-effect ledger (app-level, durable) ----------

export type SideEffect = 'account-created' | 'fee-charged' | 'request-drafted' | 'account-activated';
export interface LedgerEntry {
  lineage: string;
  workflowRunId: string;
  op: SideEffect;
  pid: number;
  at: string;
}

export class Ledger {
  constructor(readonly file: string) {}
  append(e: Omit<LedgerEntry, 'pid' | 'at'>) {
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, `${JSON.stringify({ ...e, pid: process.pid, at: new Date().toISOString() })}\n`);
  }
  read(lineage: string): LedgerEntry[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l) as LedgerEntry)
      .filter((e) => e.lineage === lineage);
  }
}

export const countOps = (entries: LedgerEntry[]) =>
  entries.reduce<Record<string, number>>((m, e) => ((m[e.op] = (m[e.op] ?? 0) + 1), m), {});

/** Documents still missing after everything received so far. */
export function missingDocuments(plan: Applicant['plan'], received: SubmittedDocument[]) {
  const have = new Set(received.map((d) => d.type));
  return REQUIRED_DOCUMENTS[plan].filter((t) => !have.has(t));
}

export type RequestDrafter = (applicant: Applicant, required: string[]) => Promise<string>;

/**
 * Builds a fresh workflow and Mastra instance on the given storage. Nothing is shared between two
 * calls, so building again on the same file is a restart as far as Mastra is concerned.
 */
export function openOnboarding(storage: LibSQLStore, deps: { draft: RequestDrafter; ledger: Ledger }) {
  const { ledger } = deps;
  const lineageOf = (init: unknown) => (init as OnboardingInput).lineage;

  const Created = z.object({ applicant: ApplicantSchema, accountId: z.string() });
  const Charged = Created.extend({ feeCharged: z.number() });
  const Drafted = Charged.extend({ required: z.array(z.string()), message: z.string() });
  const Collected = z.object({ accountId: z.string(), feeCharged: z.number(), documents: z.array(DocumentSchema) });

  const createAccount = createStep({
    id: 'createAccount',
    description: 'Side effect: creates the customer account.',
    inputSchema: OnboardingInputSchema,
    outputSchema: Created,
    execute: async ({ inputData, runId }) => {
      ledger.append({ lineage: inputData.lineage, workflowRunId: runId, op: 'account-created' });
      return { applicant: inputData.applicant, accountId: `ACC-${inputData.applicant.applicationId.slice(2)}` };
    },
  });
  const chargeFee = createStep({
    id: 'chargeFee',
    description: 'Side effect: charges the onboarding fee.',
    inputSchema: Created,
    outputSchema: Charged,
    execute: async ({ inputData, runId, getInitData }) => {
      ledger.append({ lineage: lineageOf(getInitData()), workflowRunId: runId, op: 'fee-charged' });
      return { ...inputData, feeCharged: FEES[inputData.applicant.plan] };
    },
  });
  const draftRequest = createStep({
    id: 'draftRequest',
    description: 'Paid side effect: an agent drafts the request for documents.',
    inputSchema: Charged,
    outputSchema: Drafted,
    execute: async ({ inputData, runId, getInitData }) => {
      const required = REQUIRED_DOCUMENTS[inputData.applicant.plan];
      const message = await deps.draft(inputData.applicant, required);
      ledger.append({ lineage: lineageOf(getInitData()), workflowRunId: runId, op: 'request-drafted' });
      return { ...inputData, required, message };
    },
  });
  const awaitDocuments = createStep({
    id: CHECKPOINT_STEP,
    description: 'Checkpoint: suspends until the required documents arrive (suspends again if some are missing).',
    inputSchema: Drafted,
    outputSchema: Collected,
    suspendSchema: SuspendSchema,
    resumeSchema: ResumeSchema,
    execute: async ({ inputData, resumeData, suspendData, suspend, getInitData }) => {
      const prefilled = (getInitData() as OnboardingInput).prefilledDocuments;
      const received = [...(suspendData?.received ?? []), ...(resumeData?.documents ?? prefilled ?? [])];
      const missing = missingDocuments(inputData.applicant.plan, received);
      if (received.length === 0) return await suspend({ required: inputData.required, message: inputData.message, received: [] });
      if (missing.length > 0)
        return await suspend({ required: missing, message: `Thank you. We still need: ${missing.join(', ')}.`, received });
      return { accountId: inputData.accountId, feeCharged: inputData.feeCharged, documents: received };
    },
  });
  const activate = createStep({
    id: 'activate',
    description: 'Side effect: activates the account.',
    inputSchema: Collected,
    outputSchema: ActivationSchema,
    execute: async ({ inputData, runId, getInitData }) => {
      ledger.append({ lineage: lineageOf(getInitData()), workflowRunId: runId, op: 'account-activated' });
      return { accountId: inputData.accountId, status: 'active' as const, feeCharged: inputData.feeCharged, documents: inputData.documents.map((d) => d.type) };
    },
  });
  const workflow = createWorkflow({ id: WORKFLOW_ID, inputSchema: OnboardingInputSchema, outputSchema: ActivationSchema })
    .then(createAccount)
    .then(chargeFee)
    .then(draftRequest)
    .then(awaitDocuments)
    .then(activate)
    .commit();
  const mastra = new Mastra({ workflows: { [WORKFLOW_ID]: workflow }, storage, logger: false });
  return { mastra, workflow: mastra.getWorkflow(WORKFLOW_ID) };
}

export { classifyResumeError, type ResumeErrorCode } from '../shared/resume.js';
