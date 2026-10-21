# Tool approval policies

The policy decides what is possible; humans only confirm within that space; the audit proves what happened.

```ts
const tool = createTool({
  id: 'issueRefund',
  inputSchema,
  // Every call that is not plainly allowed goes to Mastra's approval gate…
  requireApproval: (input) => evaluate(policy, { role, toolName: 'issueRefund', args: input }).effect !== 'allow',
  // …where denied calls are rejected: they never execute and no human sees them.
  beforeApproval: async (input, { toolCallId }) => {
    const d = evaluate(policy, { role, toolName: 'issueRefund', args: input });
    await audit.append({ stage: 'policy', decision: d.effect, ruleId: d.ruleId, toolCallId, ... });
    if (d.effect === 'deny') return { proceed: false, output: { ok: false, code: 'DENIED_BY_POLICY' } };
  },
  // beforeApproval does not run on resume: enforce again right before the side effect.
  execute: async (input, { agent }) => {
    const d = evaluate(policy, { role, toolName: 'issueRefund', args: input });
    if (d.effect === 'deny') return refuse();
    if (d.effect === 'confirm' && approvals.get(agent.toolCallId)?.argsHash !== argsHashOf(input)) return refuse();
    return refund(input);
  },
});
```

Run loop: for each `tool-call-approval`, check `eligibleApprover(decision, approver)` (never `self`, and only roles the rule names), then record the approval bound to `toolCallId` and `argsHash` before calling `agent.approveToolCall`, or call `agent.declineToolCall`.

Audit: each JSONL entry stores `prevHash` and `hash = sha256(prevHash + canonical(entry))`. Verification recomputes the chain and reports the first broken entry. Edit a line in `.data/memory/tenants/<partition>/files/lab-64-audit/audit.jsonl` and rerun to see `audit-chain-intact` fail; tick "Start a new audit log" to rotate it.

Challenge outline: add `when.maxDailyRefundCents` to the rule schema; in `evaluate`, sum `executed` `issueRefund` entries of the same actor for today from `audit.read()` (only after `audit.verify().valid`), and deny when the new amount would exceed the cap.

Example input: the default request, role support-agent, approver team-lead, approve. Expected counters: issueRefund 2, changeEmail 1, closeAccount 0.
