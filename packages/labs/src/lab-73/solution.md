# Deploy application

## What each scenario does

| Scenario | With gate, single | With gate, blue-green | Without gate |
| --- | --- | --- | --- |
| healthy | released, 0 s downtime | released, old kept warm | released, ~12 s of requests hit a starting revision |
| missing-secret | gate fails, rolled back, 0 s | same | downtime until the rollback finishes |
| readiness-fails | gate fails, rolled back, 0 s | same | downtime until the rollback finishes |
| slow-start | fails with 60 s, released with ≥ 75 s | same | ~75 s of downtime |
| sse-buffered | ready, smoke test fails, redeploying the old image takes 12 s | ready, smoke test fails, traffic moves back at once | as with the gate, plus 12 s of start-up |

## The real deployment (Azure Container Apps)

- **`npm run deploy:azure`** does the full release:
  1. `az acr build` tags the image with the commit.
  2. The Container App update creates a new revision.
  3. The platform holds traffic until the readiness probe on `/api/ready` passes.
  4. The script waits for `https://<app>/api/ready` itself and records the release in `secrets/staging/releases.json`.
- **`npm run smoke:staging -- --restart`** checks the deployed app:
  - TLS and the HTTP to HTTPS redirect;
  - health and readiness;
  - the cookie flags;
  - SSE tokens arriving spread over time;
  - a durable lab-71 note that survives a revision restart.
- **`npm run deploy:azure -- --rollback`** deploys the previous image again and waits for readiness.

## Challenge outline: canary

- **Mode:** switch the app to `--mode multiple`, then send traffic with `az containerapp ingress traffic set --revision-weight old=90 new=10`.
- **Gate:** watch the error rate in the access logs (the `status` field) for 5 minutes, then go to 100%. On failure, go back to `old=100`.
- **In the simulator:** add `canary` to the `Strategy` type and a `canary-gate` step. Downtime counts only 10% of the failing seconds.
