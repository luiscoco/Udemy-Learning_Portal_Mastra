# Solution: a traced business process with enforced reviewer controls

```ts
const humanReview = createStep({
  id: 'humanReview',
  inputSchema: Assessment,
  outputSchema: Decision,
  suspendSchema: ReviewRequest,
  resumeSchema: ReviewAttempt,
  execute: async ({ inputData: a, resumeData, suspendData, suspend, getInitData }) => {
    if (!resumeData) return await suspend({ ...view(a), attemptsUsed: 0 });
    const attempt = (suspendData?.attemptsUsed ?? 0) + 1;
    const violations = checkControls(getInitData().requestedBy, a.level, resumeData); // SOD, AUTHORITY, RATIONALE
    audit.record({ caseId: a.caseId, attempt, ...resumeData, accepted: violations.length === 0, violations });
    if (violations.length === 0) return { branch: resumeData.decision === 'approve' ? 'approved' : 'rejected', decidedBy: resumeData };
    if (attempt >= 3) return { branch: 'pending-review', decidedBy: null };
    return await suspend({ ...view(a), attemptsUsed: attempt, lastViolations: violations });
  },
});

createWorkflow({ id: 'vendor-due-diligence', inputSchema: VendorCase, outputSchema: Report })
  .then(intake)
  .parallel([registryLookup, sanctionsScreen, mediaScan])
  .then(riskReview) // pure scoring rules
  .branch([
    [async ({ inputData }) => inputData.level === 'low', autoApprove],
    [async ({ inputData }) => inputData.level === 'medium' || inputData.level === 'high', humanReview],
    [async ({ inputData }) => inputData.level === 'blocked', autoBlock],
  ])
  .then(report) // pick the defined branch key; an agent writes only the summary
  .commit();
```

Test one fixture per branch (low, medium approved, high rejected, blocked, pending-review) and one per control (self-approval, insufficient role, missing rationale).

**Challenge (escalate):** add `decision: 'escalate'` to the resume schema. When a manager escalates a medium case, the step suspends again with `requiredRoles: ['senior']`, kept in the suspend payload so later attempts are checked against it. The audit records an `escalated` entry.
