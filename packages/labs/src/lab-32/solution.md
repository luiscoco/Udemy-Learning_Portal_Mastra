# Solution: suspend, persist, resume after a restart

```ts
const awaitDocuments = createStep({
  id: 'awaitDocuments',
  inputSchema: Drafted,
  outputSchema: Collected,
  suspendSchema: z.object({ required: z.array(z.string()), message: z.string(), received: z.array(Doc) }),
  resumeSchema: z.object({ documents: z.array(Doc).min(1) }),
  execute: async ({ inputData, resumeData, suspendData, suspend }) => {
    const received = [...(suspendData?.received ?? []), ...(resumeData?.documents ?? [])];
    const missing = missingDocuments(inputData.plan, received);
    if (missing.length) return await suspend({ required: missing, message: inputData.message, received });
    return { ...inputData, documents: received };
  },
});

const onboarding = createWorkflow({ id: 'account-onboarding', inputSchema: Applicant, outputSchema: Activation })
  .then(createAccount).then(chargeFee).then(draftRequest) // side effects: must run once
  .then(awaitDocuments)
  .then(activate)
  .commit();

const mastra = new Mastra({ workflows: { 'account-onboarding': onboarding }, storage: new LibSQLStore({ id: 'wf', url: 'file:./workflows.db' }) });
```

**Process 1:**

```ts
const run = await mastra.getWorkflow('account-onboarding').createRun();
await run.start({ inputData }); // status: 'suspended'
save(run.runId);
```

**Process 2** (after a restart):

```ts
const run = await mastra.getWorkflow('account-onboarding').createRun({ runId });
const res = await run.resume({ step: 'awaitDocuments', resumeData: { documents } });
// only awaitDocuments and activate ran
```

Prove it by counting side effects in a ledger, and never "resume" by starting a new run.

**Challenge:** store `expiresAt` in the suspend payload. A scheduled job lists suspended runs (`listWorkflowRuns({ status: 'suspended' })`) and resumes expired ones with `{ expired: true }`. The step then cancels the account and refunds the fee, using an idempotency key (`refund:<applicationId>`), so a second expiry pass refunds nothing.
