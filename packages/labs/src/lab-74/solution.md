# Production regression suite

`npm run regression` measures every gate for real, then calls the same evaluators the lab uses:

```ts
const results = evaluateAll(measurements, gatesJson, baselineJson);
// security       npm audit (allowlist with expiry) + HTTP checks on the built server in production mode
// load-smoke     300 health requests, 24 lab-00 runs (429 retried), p95 limits, no 5xx, no lost runs
// eval-regression L57 golden fixtures exact, L58 experiment pass rate and items vs baseline
// tracing        L56 span signature vs baseline, one root, one trace, no stacks or paths
// workflow-recovery  the real two-process restart tests (L32, L71)
// accessibility  axe on every lab's Learn and Run tab (serious = critical = 0)
process.exitCode = results.every((r) => r.status === 'pass') ? 0 : 1;
```

## Evidence

- **Clean run:** `regression/evidence/latest.json` and `regression/REPORT.md`, recorded with the commit.
- **Proof that each gate fails:** `regression/evidence/injected-<gate>.json`, one file per gate.
- **CI:** the `regression` job uploads its own copy as an artifact.

## Challenge outline: bundle size

1. **Measure:** read the sizes of `apps/web/dist/assets/*.js` and record the largest one in `baseline.json` as `bundle.largestBytes`.
2. **Gate:** add `evaluateBundle(m, b, { growth: 0.1 })`. It fails when `m.largestBytes > b.largestBytes * 1.1`, and the finding names the chunk and both sizes.
3. **Injection:** `inject('bundle-size')` multiplies the measured size by 1.2.
