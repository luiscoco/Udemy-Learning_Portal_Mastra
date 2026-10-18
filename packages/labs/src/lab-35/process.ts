import { z } from 'zod';
import { Mastra } from '@mastra/core/mastra';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import type { LibSQLStore } from '@mastra/libsql';
import {
  checkControls,
  MAX_ATTEMPTS,
  mediaScan,
  registryLookup,
  REQUIRED_ROLES,
  ReviewAttemptSchema,
  sanctionsScreen,
  scoreRisk,
  VendorCaseSchema,
  type ReviewAttempt,
  type VendorCase,
  type Violation,
} from './rules.js';

export const WORKFLOW_ID = 'vendor-due-diligence';
export const REVIEW_STEP = 'humanReview';
export const BRANCH_STEPS = ['autoApprove', REVIEW_STEP, 'autoBlock'] as const;

const AnyFinding = z.record(z.string(), z.unknown());
const AssessmentSchema = z.object({
  caseId: z.string(),
  level: z.enum(['low', 'medium', 'high', 'blocked']),
  score: z.number(),
  factors: z.array(z.string()),
  findings: z.object({ registry: AnyFinding, sanctions: AnyFinding, media: AnyFinding }),
});
export type Assessment = z.infer<typeof AssessmentSchema>;

const DecisionSchema = z.object({
  branch: z.enum(['auto-approved', 'approved', 'rejected', 'blocked', 'pending-review']),
  decidedBy: ReviewAttemptSchema.nullable(),
});
type Decision = z.infer<typeof DecisionSchema>;

export const ReviewSuspendSchema = z.object({
  caseId: z.string(),
  level: z.enum(['medium', 'high']),
  score: z.number(),
  factors: z.array(z.string()),
  requiredRoles: z.array(z.string()),
  attemptsUsed: z.number().int(),
  remaining: z.number().int(),
  lastViolations: z.array(z.string()),
});

export const ReportSchema = z.object({
  caseId: z.string(),
  vendor: z.string(),
  branch: DecisionSchema.shape.branch,
  level: AssessmentSchema.shape.level,
  score: z.number(),
  factors: z.array(z.string()),
  findings: AssessmentSchema.shape.findings,
  decision: ReviewAttemptSchema.nullable(),
  summary: z.string(),
});
export type Report = z.infer<typeof ReportSchema>;

export interface AuditEntry {
  caseId: string;
  attempt: number;
  reviewer: string;
  role: string;
  decision: string;
  rationale: string;
  accepted: boolean;
  violations: Violation[];
}

export interface ProcessDeps {
  controls: 'enforced' | 'disabled';
  audit: AuditEntry[];
  summarize: (r: Omit<Report, 'summary'>) => Promise<string>;
}

export function openProcess(storage: LibSQLStore, deps: ProcessDeps) {
  const intake = createStep({
    id: 'intake',
    description: 'Normalises and validates the vendor request.',
    inputSchema: VendorCaseSchema,
    outputSchema: VendorCaseSchema,
    execute: async ({ inputData: c }) => ({
      ...c,
      vendor: { ...c.vendor, name: c.vendor.name.trim().replace(/\s+/g, ' '), country: c.vendor.country.toUpperCase() },
      requestedBy: c.requestedBy.trim(),
    }),
  });
  const research = <Id extends string, T>(id: Id, description: string, fn: (c: VendorCase) => T) =>
    createStep({ id, description, inputSchema: VendorCaseSchema, outputSchema: AnyFinding, execute: async ({ inputData }) => fn(inputData) as Record<string, unknown> });
  const registry = research('registryLookup', 'Simulated company registry lookup.', (c) => registryLookup(c.vendor));
  const sanctions = research('sanctionsScreen', 'Simulated sanctions-list screening.', (c) => sanctionsScreen(c.vendor));
  const media = research('mediaScan', 'Simulated adverse-media keyword scan.', (c) => mediaScan(c.notes));

  const riskReview = createStep({
    id: 'riskReview',
    description: 'Deterministic risk score from the joined research findings.',
    inputSchema: z.object({ registryLookup: AnyFinding, sanctionsScreen: AnyFinding, mediaScan: AnyFinding }),
    outputSchema: AssessmentSchema,
    execute: async ({ inputData, getInitData }) => {
      const c = getInitData() as VendorCase;
      const findings = { registry: inputData.registryLookup, sanctions: inputData.sanctionsScreen, media: inputData.mediaScan };
      const risk = scoreRisk(c, findings as never);
      return { caseId: c.caseId, ...risk, findings };
    },
  });
  const autoApprove = createStep({
    id: 'autoApprove',
    description: 'Low risk: approved by policy without a reviewer.',
    inputSchema: AssessmentSchema,
    outputSchema: DecisionSchema,
    execute: async () => ({ branch: 'auto-approved' as const, decidedBy: null }),
  });
  const autoBlock = createStep({
    id: 'autoBlock',
    description: 'Sanctions match: blocked; no reviewer can approve it.',
    inputSchema: AssessmentSchema,
    outputSchema: DecisionSchema,
    execute: async () => ({ branch: 'blocked' as const, decidedBy: null }),
  });
  const humanReview = createStep({
    id: REVIEW_STEP,
    description: 'Suspends for a reviewer; enforces segregation of duties, authority and rationale on every attempt.',
    inputSchema: AssessmentSchema,
    outputSchema: DecisionSchema,
    suspendSchema: ReviewSuspendSchema,
    resumeSchema: ReviewAttemptSchema,
    execute: async ({ inputData: a, resumeData, suspendData, suspend, getInitData }) => {
      const level = a.level as 'medium' | 'high';
      const base = { caseId: a.caseId, level, score: a.score, factors: a.factors, requiredRoles: REQUIRED_ROLES[level] };
      if (!resumeData) return await suspend({ ...base, attemptsUsed: 0, remaining: MAX_ATTEMPTS, lastViolations: [] });
      const attempt = (suspendData?.attemptsUsed ?? 0) + 1;
      const violations = deps.controls === 'enforced' ? checkControls((getInitData() as VendorCase).requestedBy, level, resumeData) : [];
      deps.audit.push({
        caseId: a.caseId,
        attempt,
        reviewer: resumeData.reviewer,
        role: resumeData.role,
        decision: resumeData.decision,
        rationale: resumeData.rationale,
        accepted: violations.length === 0,
        violations,
      });
      if (violations.length === 0) return { branch: resumeData.decision === 'approve' ? ('approved' as const) : ('rejected' as const), decidedBy: resumeData };
      if (attempt >= MAX_ATTEMPTS) return { branch: 'pending-review' as const, decidedBy: null };
      return await suspend({ ...base, attemptsUsed: attempt, remaining: MAX_ATTEMPTS - attempt, lastViolations: violations });
    },
  });
  const report = createStep({
    id: 'report',
    description: 'Typed report with findings, decision and an agent-written summary.',
    inputSchema: z.record(z.string(), DecisionSchema.optional()),
    outputSchema: ReportSchema,
    execute: async ({ inputData, getInitData, getStepResult }) => {
      // Branch output has a key per branch step; the ones that did not run are undefined (verified).
      const decision = Object.values(inputData).find((d): d is Decision => d !== undefined)!;
      const a = getStepResult(riskReview) as Assessment;
      const c = getInitData() as VendorCase;
      const body = {
        caseId: a.caseId,
        vendor: c.vendor.name,
        branch: decision.branch,
        level: a.level,
        score: a.score,
        factors: a.factors,
        findings: a.findings,
        decision: decision.decidedBy,
      };
      return { ...body, summary: await deps.summarize(body) };
    },
  });

  const workflow = createWorkflow({ id: WORKFLOW_ID, inputSchema: VendorCaseSchema, outputSchema: ReportSchema })
    .then(intake)
    .parallel([registry, sanctions, media])
    .then(riskReview)
    .branch([
      [async ({ inputData }) => inputData.level === 'low', autoApprove],
      [async ({ inputData }) => inputData.level === 'medium' || inputData.level === 'high', humanReview],
      [async ({ inputData }) => inputData.level === 'blocked', autoBlock],
    ])
    .then(report)
    .commit();
  const mastra = new Mastra({ workflows: { [WORKFLOW_ID]: workflow }, storage, logger: false });
  return { mastra, workflow: mastra.getWorkflow(WORKFLOW_ID) };
}

export type { ReviewAttempt };
