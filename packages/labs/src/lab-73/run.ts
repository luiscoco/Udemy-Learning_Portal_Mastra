import { z } from 'zod';
import { summarizeChecks, type LabDefinition } from '@mlp/contracts';
import { LabError, type LabImplementation, type RunContext } from '@mlp/lab-engine';
import type { LabServices } from '../services.js';
import { simulateRelease, type ReleaseResult } from './release.js';
import { lab73Definition } from './definition.js';

export const Lab73InputSchema = z.object({
  scenario: z.enum(['healthy', 'missing-secret', 'readiness-fails', 'slow-start', 'sse-buffered']),
  strategy: z.enum(['single', 'blue-green']),
  readinessGate: z.boolean().default(true),
  readinessTimeoutS: z.coerce.number().int().min(5).max(300),
  autoRollback: z.boolean().default(true),
  tag: z.string().regex(/^[a-f0-9]{7,12}$/, 'Use a short commit hash (7–12 hex characters)'),
});
export type Lab73Input = z.infer<typeof Lab73InputSchema>;

export interface StagingProbe {
  url: string;
  health: { status: number; ms: number };
  ready: { status: number; ms: number; checks: string[] };
  tls: { valid: boolean; httpRedirectsToHttps: boolean };
  /** The SSE route without a session: it must refuse (401) quickly. Full streaming is checked by npm run smoke:staging. */
  eventsRoute: { status: number; firstByteMs: number };
}

export interface Lab73Output {
  release: ReleaseResult;
  staging: StagingProbe | { skipped: string };
}

const timed = async <T>(fn: () => Promise<T>) => {
  const t = performance.now();
  const value = await fn();
  return { value, ms: Math.round(performance.now() - t) };
};

/** Probes the server-configured staging origin: public endpoints only, no sign-in, every request time-limited. */
async function probeStaging(ctx: RunContext<LabServices>, origin: string): Promise<StagingProbe> {
  const signal = () => AbortSignal.any([ctx.signal, AbortSignal.timeout(30_000)]);
  const health = await timed(() => fetch(`${origin}/api/health`, { signal: signal() }));
  const ready = await timed(() => fetch(`${origin}/api/ready`, { signal: signal() }));
  const readyBody = (await ready.value.json().catch(() => ({ checks: [] }))) as { checks?: { name: string; status: string }[] };
  const plain = await fetch(`${origin.replace(/^https:/, 'http:')}/api/health`, { redirect: 'manual', signal: signal() }).catch(
    () => null,
  );
  // Without a session the event stream must be refused: a public probe never signs in.
  const sse = await timed(async () => {
    const res = await fetch(`${origin}/api/runs/probe/events`, { headers: { accept: 'text/event-stream' }, signal: signal() });
    await res.body?.cancel();
    return res;
  });
  return {
    url: origin,
    health: { status: health.value.status, ms: health.ms },
    ready: { status: ready.value.status, ms: ready.ms, checks: (readyBody.checks ?? []).map((c) => `${c.name}=${c.status}`) },
    tls: {
      valid: true, // fetch over https verified the certificate chain, or it would have thrown
      httpRedirectsToHttps:
        !!plain && [301, 302, 307, 308].includes(plain.status) && (plain.headers.get('location') ?? '').startsWith('https://'),
    },
    eventsRoute: { status: sse.value.status, firstByteMs: sse.ms },
  };
}

export const lab73: LabImplementation<Lab73Input, Lab73Output, LabServices> = {
  definition: lab73Definition as LabDefinition,
  inputSchema: Lab73InputSchema,

  async run(ctx, input) {
    const release = simulateRelease(input);
    for (const s of release.steps) {
      ctx.throwIfAborted();
      ctx.emit({ type: 'workflow-step', stepId: s.stepId, status: 'running' });
      await new Promise((r) => setTimeout(r, 15)); // let the timeline animate; the simulated clock is in atS
      ctx.emit({
        type: 'workflow-step',
        stepId: s.stepId,
        status: s.status === 'skipped' ? 'skipped' : s.status === 'failed' ? 'failed' : 'success',
        output: { atS: s.atS, detail: s.detail },
      });
      if (s.status === 'failed') ctx.log('warn', `${s.stepId}: ${s.detail}`);
    }

    let staging: Lab73Output['staging'] = { skipped: 'offline mode: the staging app is not contacted' };
    if (ctx.mode === 'live') {
      const origin = ctx.services.stagingUrl;
      if (!origin)
        throw new LabError(
          'NOT_CONFIGURED',
          'Set STAGING_URL (https) in the server environment to probe the staging deployment.',
        );
      ctx.emit({ type: 'workflow-step', stepId: 'probe-staging', status: 'running' });
      try {
        staging = await probeStaging(ctx, origin);
      } catch (e) {
        if (ctx.signal.aborted) throw e;
        throw new LabError('PROVIDER_ERROR', 'The staging app did not answer (it may be starting from zero; try again).', {
          retryable: true,
          cause: e,
        });
      }
      ctx.emit({
        type: 'workflow-step',
        stepId: 'probe-staging',
        status: staging.ready.status === 200 ? 'success' : 'failed',
        output: staging,
      });
    }
    ctx.setResultExtras({ effective: { mode: ctx.mode, simulated: ctx.mode !== 'live' } });
    return { release, staging };
  },

  validate(out, input) {
    const r = out.release;
    const failing = input.scenario !== 'healthy' && !(input.scenario === 'slow-start' && input.readinessTimeoutS >= 75);
    const staging = out.staging;
    return summarizeChecks([
      {
        id: 'no-unready-traffic',
        label: 'No traffic reached a revision that was not ready',
        passed: r.downtimeS === 0,
        message:
          r.downtimeS === 0 ? 'the readiness gate held' : `${r.downtimeS} s of requests went to a revision that was not ready`,
      },
      {
        id: 'failed-release-rolled-back',
        label: 'A failed release was rolled back automatically',
        passed: !failing || r.rolledBack,
        message: failing
          ? r.rolledBack
            ? `rolled back; ${r.activeImage} serves`
            : 'not rolled back: the failed release is still active or beside the old one'
          : 'the release did not fail',
      },
      {
        id: 'healthy-release-smoke',
        label: 'A healthy release passed the post-deploy smoke test',
        passed: failing || (r.released && r.smoke !== null && Object.values(r.smoke).every(Boolean)),
        message: r.smoke
          ? Object.entries(r.smoke)
              .map(([k, v]) => `${k}=${v ? 'ok' : 'FAIL'}`)
              .join(', ')
          : 'no smoke test (the revision never became ready)',
      },
      {
        id: 'plan-has-rollback',
        label: 'The deployment plan includes a rollback command',
        passed: r.commands.some((c) => /rollback/.test(c)),
        message: r.commands.find((c) => /rollback/.test(c)) ?? 'missing',
      },
      {
        id: 'staging-probe',
        label: 'Live: the staging app answers health and readiness over valid HTTPS',
        passed:
          'skipped' in staging ||
          (staging.health.status === 200 &&
            staging.ready.status === 200 &&
            staging.tls.httpRedirectsToHttps &&
            staging.eventsRoute.status === 401),
        message:
          'skipped' in staging
            ? staging.skipped
            : `health ${staging.health.status} (${staging.health.ms} ms), ready ${staging.ready.status}, http→https ${staging.tls.httpRedirectsToHttps}`,
      },
    ]);
  },
};
