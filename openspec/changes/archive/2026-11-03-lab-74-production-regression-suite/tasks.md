# Tasks

## 1. Gates
- [x] 1.1 Patch the vulnerable transitive dependencies within their ranges; allowlist the MCP SDK advisories with expiry
- [x] 1.2 `regression/gates.json`, `regression/baseline.json`, `lab-74/gates.ts` evaluators with unit tests (pass and regressed)
- [x] 1.3 `scripts/regression.ts` and `scripts/regression-server.ts`; `e2e/a11y-sweep.spec.ts`

## 2. Evidence and CI
- [x] 2.1 Run the suite locally; commit `regression/evidence/latest.json` and `regression/REPORT.md`
- [x] 2.2 Prove each gate fails with `--inject`
- [x] 2.3 CI `regression` job uploading the evidence; `docs/REGRESSION.md`

## 3. Lab 74
- [x] 3.1 Regression gates lab (offline evidence plus fresh measurement, live model eval); registry and catalog
- [x] 3.2 Tests, verify, e2e, live check
