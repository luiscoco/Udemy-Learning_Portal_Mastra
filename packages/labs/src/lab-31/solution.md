# Solution: a reusable subworkflow with a schema boundary

```ts
export const VerificationInput = z.object({ email: z.string(), country: z.string(), total: z.number(), notes: z.string() });

export const verifyCustomer = createWorkflow({ id: 'verify-customer', inputSchema: VerificationInput, outputSchema: VerificationResult })
  .then(checkIdentity)
  .then(screenRisk)
  .then(decide)
  .commit();

const prepareOrder = createStep({
  id: 'prepareOrder',
  inputSchema: Order,
  outputSchema: VerificationInput,
  execute: async ({ inputData: o }) => ({ email: o.customer.email, country: o.customer.country, total: totalOf(o), notes: o.notes }),
});

export const orderWorkflow = createWorkflow({ id: 'order-workflow', inputSchema: Order, outputSchema: Fulfilment })
  .then(prepareOrder)
  .then(verifyCustomer) // a committed workflow used as a step
  .then(fulfil)
  .commit();
```

- **Trace:** nested steps stream as `verify-customer.checkIdentity`, `verify-customer.screenRisk` and `verify-customer.decide`.
- **Input boundary:** a strict schema strips undeclared keys, while `z.looseObject` lets them through.
- **Output boundary:** Mastra does not validate it. Parse `res.steps['verify-customer'].output` with `VerificationResult` and report a failure as the subworkflow's.
- **Reuse:** `(await verifyCustomer.createRun()).start({ inputData: minimal })` must equal the nested output.

**Challenge:** a refund workflow maps `{ email, total, notes }` and must supply `country`, for example from the customer record. If it forgets, Mastra fails at `verify-customer` with `WORKFLOW_STEP_INPUT_VALIDATION_FAILED`, because subworkflow input is validated.
