# Design

## Files

| File | Role |
| --- | --- |
| `regression/gates.json` | Thresholds per gate, the advisory allowlist and the a11y options. Reviewed like code. |
| `regression/baseline.json` | `eval.golden` (count, all ok), `eval.experiment` (passRate, per-item outcome), `tracing.signature`. |
| `packages/labs/src/lab-74/gates.ts` | `evaluateSecurity`, `evaluateLoad`, `evaluateEval`, `evaluateTracing`, `evaluateRecovery`, `evaluateA11y`, `spanSignature`, `percentile`, `summarize`. Pure functions, unit-tested with passing and regressed inputs. |
| `scripts/regression.ts` | Measures each gate, then evaluates it, writes the evidence and sets the exit code. `--only a,b` and `--inject gate` are supported. |
| `scripts/regression-server.ts` | Starts the built API in production mode on a free loopback port, with throwaway secrets and a password user, and stops it afterwards. |
| `e2e/a11y-sweep.spec.ts` | Runs only when `A11Y_SWEEP=1`. Visits `/labs/<id>?tab=learn` and `?tab=run` for every available lab, runs axe (WCAG 2.1 AA) and writes `test-results/a11y-sweep.json`. |

## Gates and thresholds

| Gate | Measurement | Fails when |
| --- | --- | --- |
| security | `npm audit --omit=dev --json` plus 7 HTTP checks | Any high/critical advisory is not allowlisted; an allowlist entry is expired; any HTTP check fails |
| load-smoke | 300 health requests (concurrency 16) and 24 lab-00 runs (concurrency 8, `MAX_CONCURRENT_RUNS=4`) | Health p95 > 100 ms; any 5xx; any accepted run not `succeeded`; any rejection that is not 429; run p95 > 5000 ms |
| eval-regression | L57 golden fixtures and the L58 offline experiment | Any golden fixture not ok; the experiment pass rate is below the baseline minus tolerance (0); a baseline-passing item now fails |
| tracing | L56 offline example run | The signature differs from the baseline; there isn't exactly one root; there is more than one traceId; a span carries a stack or an absolute path |
| workflow-recovery | `vitest run` on `lab32.restart.test.ts` and `lab71.restart.test.ts` with the JSON reporter | Any test failed or skipped |
| accessibility | The axe sweep (desktop) | serious > 0 or critical > 0 |

## Injection (`--inject`)

Each regression is applied to the measured metrics just before evaluation; the label `injected` is recorded in the evidence:

| Gate | Injected regression |
| --- | --- |
| security | an unlisted high advisory |
| load-smoke | +400 ms on every health sample |
| eval-regression | one golden fixture flipped to not ok |
| tracing | a span renamed |
| workflow-recovery | one failed test |
| accessibility | one serious violation |

## Evidence

`regression/evidence/latest.json` holds `{ commit, at, node, gates: [{ gate, status, metrics, thresholds, findings, durationMs, injected? }], passed }`. `regression/REPORT.md` is a table generated from it. Both are committed after a local run; the CI uploads its own copy as an artifact.

## Lab 74

- **Inputs:**
  - `healthP95Ms` (10–1000), `runP95Ms` (500–20000) and `maxSerious` (0–5);
  - `inject` (none | each gate);
  - `measureFresh` (boolean: run the eval and tracing gates in-process now);
  - `liveAnswerThreshold` (0–1, live only).
- **Run:** loads the lab's evidence snapshot (`evidence-sample.json`, a copy of the real latest evidence), optionally re-measures the eval and tracing gates in-process, applies the learner's thresholds and the injection, then evaluates the gates. It emits one `workflow-step` per gate.
- **Live:** asks a live model for an answer to one L57 rubric question, scores it with the L57 rubric scorer, and gates it on the threshold.
- **Checks:**
  - the gates reflect the injected regression: exactly the injected gate fails;
  - the thresholds came from the input;
  - the evidence is present and recent;
  - live: the answer gate was measured with a real model.
