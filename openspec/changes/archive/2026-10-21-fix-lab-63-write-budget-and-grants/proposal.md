# Proposal

## Why

A review of L63 found two gaps in the tool gateway:

- **Injected calls can use up the write budget.** The per-run write limit counts every write call, including the ones denied by policy. A document with enough injected instructions (three by default) makes the customer's own legitimate action fail with `WRITE_LIMIT`. This fails safe, since nothing unrequested runs, but it is a denial of service the attacker controls.
- **Negated requests grant capabilities.** `grantsFor` grants an email for "Please don't email me", because it only looks for "email … me".

Concurrent approvals were also untested: with "Ask me", a customer who asks for a refund and an email gets two authorized actions in one model turn. The runner supports several pending approvals per run, but no test covered it.

## What Changes

- **Write budget.** The limit counts only authorized side-effect attempts. Calls denied by policy cost nothing, and they stay bounded by the agent's step and tool-call budget. A test with four injected calls plus the customer's own email shows the email still reaches approval and is sent.
- **Negation.** `grantsFor` grants nothing for an action the message negates ("don't", "do not", "never", "no need to" shortly before the verb). This is covered by tests.
- **Concurrent approvals.** A test runs a refund plus an email with "Ask me", resolves both approvals, and checks that both side effects happen exactly once.
- **Course prompts:** follow-up prompt `L63a`.

## Out of scope

The L63 challenge (keeping untrusted text out of outgoing email bodies) stays a learner exercise.
