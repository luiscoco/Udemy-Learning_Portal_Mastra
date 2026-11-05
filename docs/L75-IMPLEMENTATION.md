# Lab 75 delivery evidence

Verified on November 5, 2026, using Node 24.21.0 and npm 11.19.0. All 75 course labs and the Lab 00 orientation are now registered and available. No dependency versions or lockfile entries changed.

## Implementation

| Path | Delivery |
| --- | --- |
| `packages/labs/src/lab-75/definition.ts` | Complete concept, objectives, inputs, guide, hints, mistakes, challenge, quiz, automated checks and seven-minute instructor outline |
| `packages/labs/src/lab-75/run.ts` | Typed five-step workflow, two agents, tenant memory, real MCP case lookup, RAG, citation guard, native scorer, approval, budgets and correlated native tracing |
| `packages/labs/src/lab-75/policy.ts` | Server-owned fixture cases, eligibility checks and an atomic tenant-local simulated refund ledger with replay/conflict protection |
| `packages/labs/src/lab-75/fixtures.ts` | Eight deterministic offline safety scenarios |
| `packages/labs/src/lab-75/lab75.test.ts` | Fourteen tests covering integration, ownership, eligibility, replay, concurrent requests, isolation, approval and cancellation |
| `packages/labs/src/lab-75/solution.md` | Readable reference explanation, demo and limitations |
| `packages/labs/src/index.ts`, `packages/lab-catalog/src/labs.ts` | Server registration and released catalog entry; stable routes preserved |
| `e2e/enterprise-capstone.spec.ts` | Interactive approval, citation inspection, bad-citation rejection and foreign-case refusal on desktop and mobile |
| `apps/web/src/shell.test.tsx`, `e2e/shell.spec.ts` | Explicit locked-preview fixture and final-capstone release checks, replacing the assumption that a real course lab must remain locked |
| `apps/web/src/chat.test.tsx` | Deterministic cancellation mock: explicit server stream completion replaces a timing-sensitive 30 ms timer; no application behavior changed |
| `README.md`, `docs/COMPATIBILITY.md` | Course completion status, exact API compatibility and simulation/cost boundaries |

## Verification

Final results, after resolving the catalog assumptions and the pre-existing cancellation-test race:

| Command | Actual result |
| --- | --- |
| `npm ci` | Installed the existing exact lockfile; no dependency upgrade |
| `npm exec -- vitest run packages/labs/src/lab-75/lab75.test.ts packages/labs/src/conformance.test.ts -t 'Lab 75\|lab-75\|capstone action'` | 29 passed; unrelated conformance cases intentionally filtered |
| `npm run verify` with `VITEST_MAX_WORKERS=4` | Passed environment/spec checks, lint, all workspace types, 1596 tests (69 skipped), both production builds and bundle secret scan; 134 test files passed, 2 skipped |
| `npm run test:e2e` | 241 passed, 158 intentional skips, zero failures; desktop and mobile |
| `A11Y_SWEEP=1 npm run test:e2e -- e2e/a11y-sweep.spec.ts --grep 'lab-75$' --project desktop` | Setup and sweep passed; both Learn and Run returned empty axe violation arrays |
| `npm exec -- openspec validate lab-75-enterprise-ai-assistant-capstone --strict` | Passed using the project's pinned CLI |
| `npm exec -- openspec validate --specs --strict --no-interactive` | All 88 main capabilities passed after syncing the new capstone capability |

PowerShell environment syntax for the worker setting is `$env:VITEST_MAX_WORKERS = '4'`. It was a verification environment setting, not a repository configuration change. NVM's recommended `nvm reshim` was run with approved access to restore its trusted package-manager entrypoints. No trust check was bypassed.

The build retains the existing Vite large-chunk notice and Tailwind sourcemap warning; neither fails the build. Dependency advisories remain governed by the existing regression allowlist/release review; no blanket audit fix or framework upgrade was attempted.

## Demo

Run `npm run dev`, sign in locally and open `/labs/lab-75?tab=run`.

1. Run the default offline request: inspect verified policy citations, quality score 1, memory counts, MCP tools, trace spans and the simulated receipt.
2. Repeat the same request: the prior receipt is returned without another refund and memory counts increase.
3. Choose **Ask me in the Run tab** and approve, decline or cancel while waiting.
4. Try the unavailable case, expired case or amount above 25000 cents; each prevents a new refund.
5. Inject the invented citation or ask about quantum entanglement; missing verified evidence blocks refund execution.

## Costs and remaining boundaries

- Verification was entirely offline: no provider calls and no provider costs. No cloud deployment was performed.
- Optional live models are implemented but were not exercised in this delivery. They require server-configured keys and incur provider charges; step/tool/output limits are not a dollar spending cap.
- Cases and refunds are always simulations. No real customer or payment integration is claimed.
- Retrieval and the refund gateway are explicitly app-level adapters. Quote verification is not a proof of semantic entailment; business eligibility comes from fixed trusted server policy.
- Locks and ledger writes support one API process. Pending HTTP approvals remain in memory. Platform-wide durable progress, sessions/run recovery, quotas, cost caps and the other public-host release gates remain separate pending work.

OpenSpec main capability: `openspec/specs/course-labs/lab-75-enterprise-ai-assistant-capstone/spec.md`. Its three requirements were synced and compared with the delta before archiving. The completed change is archived at `openspec/changes/archive/2026-11-05-lab-75-enterprise-ai-assistant-capstone/`; all six tasks are complete. The archive command used `--skip-specs` because the spec had already been synced and validated.
