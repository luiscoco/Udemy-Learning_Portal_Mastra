# Configuration and packaging

The lab runs the same code the API runs at start-up and on `/api/ready` (`@mlp/deploy`):

```ts
const { env, sources } = resolveSecretFiles(process.env); // X or X_FILE, never both
const config = parseConfig(env);                          // Zod schema, value-free errors
const { problems, warnings } = deploymentProblems(config); // production rules
if (problems.length) exit(78, problems);                  // "AUTH_SESSION_SECRET is required in production (…_FILE)"
const ready = await new ReadinessProbe({ config, dataDir }).check(); // data-dir, storage, web-bundle, providers, runner
```

## Three ways to break it

These are the expected messages:

| What you change | Message |
| --- | --- |
| Untick the session secret mount | `AUTH_SESSION_SECRET_FILE points to a file that cannot be read` |
| Remove both session secret lines | `AUTH_SESSION_SECRET is required in production (set AUTH_SESSION_SECRET or AUTH_SESSION_SECRET_FILE)` |
| Set `AUTH_PROVIDER=dev` in production | `the development login is refused in production: set AUTH_PROVIDER=password and AUTH_USERS` |

## Packaging in the repository

| File | What it does |
| --- | --- |
| `Dockerfile` | Multi-stage build on Node 24 bookworm-slim. Runs as the non-root `node` user, with a `/data` volume and a `HEALTHCHECK` on `/api/health`. The API serves the web app. |
| `compose.yaml` | Mounts the secrets as files from `./secrets`, which you create with `npm run make-secrets`. |
| `scripts/container-smoke.ts` | CI job `container`. Checks that a missing secret exits with code 78, that the container starts healthy and ready, that a password login and a streamed run work, and that a read-only volume makes readiness return 503. |

## Challenge outline: Redis

1. Add `REDIS_URL: z.string().url().optional()` to `ConfigSchema`.
2. Add a production rule: if `MAX_CONCURRENT_RUNS > 4 && !REDIS_URL`, report the problem `REDIS_URL is required …`.
3. Add a `redis` readiness check that sends `PING` with a timeout, and `skip` it when `REDIS_URL` is unset.
