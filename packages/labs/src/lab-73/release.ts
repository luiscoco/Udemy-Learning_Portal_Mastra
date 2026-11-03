/**
 * A deterministic model of a container-platform release (revisions, readiness gate, traffic, rollback), the
 * way Azure Container Apps, Cloud Run or Kubernetes do it. No time passes for real: a simulated clock advances.
 */
export type Scenario = 'healthy' | 'missing-secret' | 'readiness-fails' | 'slow-start' | 'sse-buffered';
export type Strategy = 'single' | 'blue-green';

export interface Revision {
  name: string;
  image: string;
  state: 'provisioning' | 'ready' | 'failed' | 'retired';
  traffic: number;
  reason?: string;
}

export interface ReleaseStep {
  stepId: 'build' | 'push' | 'create-revision' | 'readiness-gate' | 'shift-traffic' | 'smoke' | 'rollback' | 'summary';
  status: 'success' | 'failed' | 'skipped';
  atS: number;
  detail: string;
}

export interface ReleaseOptions {
  scenario: Scenario;
  strategy: Strategy;
  readinessTimeoutS: number;
  autoRollback: boolean;
  /** Wait for /api/ready before sending traffic. Off = traffic moves as soon as the revision exists. */
  readinessGate: boolean;
  tag: string;
}

export interface ReleaseResult {
  steps: ReleaseStep[];
  revisions: Revision[];
  active: string;
  activeImage: string;
  /** Seconds during which some traffic went to a revision that was not ready. */
  downtimeS: number;
  rolledBack: boolean;
  released: boolean;
  smoke: { health: boolean; ready: boolean; streaming: boolean; persistence: boolean } | null;
  commands: string[];
}

/** When the new revision would answer ready, if ever (simulated seconds after start). */
function readyAfter(s: Scenario): { readyAtS: number | null; reason?: string } {
  switch (s) {
    case 'healthy':
    case 'sse-buffered':
      return { readyAtS: 12 };
    case 'slow-start':
      return { readyAtS: 75 };
    case 'missing-secret':
      return { readyAtS: null, reason: 'the container exited with code 78: AUTH_SESSION_SECRET is required in production' };
    case 'readiness-fails':
      return { readyAtS: null, reason: '/api/ready answers 503: data-dir is not writable' };
  }
}

export function commandsFor(strategy: Strategy, tag: string): string[] {
  const app = '-g mlp-staging-rg -n mlp-staging';
  const image = `mlpstagingXXXXXX.azurecr.io/mastra-learning-platform:${tag}`;
  return strategy === 'single'
    ? [
        `az acr build -r mlpstagingXXXXXX -t mastra-learning-platform:${tag} .`,
        `az containerapp update ${app} --image ${image}`,
        'npm run smoke:staging',
        '# rollback: npm run deploy:azure -- --rollback   (re-deploys the previous image from releases.json)',
      ]
    : [
        `az acr build -r mlpstagingXXXXXX -t mastra-learning-platform:${tag} .`,
        `az containerapp revision set-mode ${app} --mode multiple`,
        `az containerapp update ${app} --image ${image} --revision-suffix ${tag.slice(0, 8)}`,
        `az containerapp ingress traffic set ${app} --revision-weight <new>=100   # only after the new revision is ready`,
        'npm run smoke:staging',
        `# rollback: az containerapp ingress traffic set ${app} --revision-weight <old>=100`,
      ];
}

export function simulateRelease(o: ReleaseOptions): ReleaseResult {
  const steps: ReleaseStep[] = [];
  let t = 0;
  const step = (stepId: ReleaseStep['stepId'], status: ReleaseStep['status'], detail: string, dt = 0) => {
    t += dt;
    steps.push({ stepId, status, atS: t, detail });
  };
  const old: Revision = { name: 'mlp-staging--r1', image: 'mastra-learning-platform:previous', state: 'ready', traffic: 100 };
  const next: Revision = {
    name: `mlp-staging--${o.tag.slice(0, 8)}`,
    image: `mastra-learning-platform:${o.tag}`,
    state: 'provisioning',
    traffic: 0,
  };
  const revisions = [old, next];
  let downtimeS = 0;

  step('build', 'success', `image mastra-learning-platform:${o.tag} built in the registry (cloud build)`, 90);
  step('push', 'success', 'pushed; the image is immutable and tagged with the commit', 5);
  step('create-revision', 'success', `revision ${next.name} created with 0% traffic`, 3);

  const { readyAtS, reason } = readyAfter(o.scenario);
  if (!o.readinessGate) {
    // No gate: learners hit a revision that is still starting (or never starts).
    next.traffic = 100;
    old.traffic = 0;
    old.state = o.strategy === 'single' ? 'retired' : 'ready';
    step('shift-traffic', 'success', `traffic 100% → ${next.name} immediately (no readiness gate)`, 0);
    downtimeS = readyAtS !== null && readyAtS <= o.readinessTimeoutS ? readyAtS : o.readinessTimeoutS;
  }
  if (readyAtS !== null && readyAtS <= o.readinessTimeoutS) {
    next.state = 'ready';
    step('readiness-gate', 'success', `/api/ready answered 200 after ${readyAtS} s (timeout ${o.readinessTimeoutS} s)`, readyAtS);
  } else {
    next.state = 'failed';
    next.reason = reason ?? `not ready within ${o.readinessTimeoutS} s (it needs about ${readyAtS} s)`;
    step('readiness-gate', 'failed', next.reason, o.readinessTimeoutS);
  }

  let rolledBack = false;
  let released = false;
  let smoke: ReleaseResult['smoke'] = null;
  if (next.state === 'ready') {
    // Single-revision mode replaces the old revision once the new one is ready; blue-green shifts the weight.
    next.traffic = 100;
    old.traffic = 0;
    old.state = o.strategy === 'single' ? 'retired' : 'ready';
    if (o.readinessGate)
      step(
        'shift-traffic',
        'success',
        o.strategy === 'single'
          ? `${next.name} replaced ${old.name}`
          : `traffic 100% → ${next.name}; ${old.name} kept warm for rollback`,
        2,
      );
    smoke = { health: true, ready: true, streaming: o.scenario !== 'sse-buffered', persistence: true };
    const smokeOk = Object.values(smoke).every(Boolean);
    step(
      'smoke',
      smokeOk ? 'success' : 'failed',
      smokeOk
        ? 'health, readiness, SSE streaming and persistence verified'
        : 'SSE arrived in one burst at the end: a proxy is buffering the stream',
      20,
    );
    if (!smokeOk && o.autoRollback) {
      if (o.strategy === 'blue-green') {
        next.traffic = 0;
        old.traffic = 100;
        step('rollback', 'success', `traffic 100% → ${old.name} again (instant: it never stopped)`, 2);
      } else {
        // Single mode: the previous image must be deployed again, so the bad revision serves until the old one is ready.
        old.state = 'ready';
        old.traffic = 100;
        next.traffic = 0;
        next.state = 'retired';
        step('rollback', 'success', `previous image redeployed as a new revision; ready after 12 s`, 12);
      }
      rolledBack = true;
    } else released = smokeOk;
    if (!smokeOk && !o.autoRollback)
      step('rollback', 'skipped', 'automatic rollback is off: the broken release keeps serving', 0);
  } else {
    if (o.readinessGate) step('shift-traffic', 'skipped', `the gate held: traffic stays 100% on ${old.name}`, 0);
    if (o.autoRollback) {
      next.state = 'retired';
      next.traffic = 0;
      old.state = 'ready';
      old.traffic = 100;
      const extra = !o.readinessGate && o.strategy === 'single' ? 12 : 1;
      if (!o.readinessGate) downtimeS += extra;
      step(
        'rollback',
        'success',
        o.readinessGate
          ? `failed revision ${next.name} deactivated; ${old.name} keeps serving`
          : `traffic back on the previous image after ${extra} s more`,
        extra,
      );
      rolledBack = true;
    } else step('rollback', 'skipped', `automatic rollback is off: ${next.name} stays failed beside ${old.name}`, 0);
  }
  const active = [...revisions].sort((a, b) => b.traffic - a.traffic)[0]!;
  step(
    'summary',
    released ? 'success' : 'failed',
    released ? `released ${next.image}` : `${active.name} serves (${active.image})`,
    0,
  );
  return {
    steps,
    revisions,
    active: active.name,
    activeImage: active.image,
    downtimeS,
    rolledBack,
    released,
    smoke,
    commands: commandsFor(o.strategy, o.tag),
  };
}
