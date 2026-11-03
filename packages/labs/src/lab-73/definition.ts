import type { LabDefinitionInput } from '@mlp/contracts';

export const lab73Definition = {
  id: 'lab-73',
  number: 73,
  title: 'Deploy application',
  moduleId: 'module-15',
  summary:
    'Release a container like a production platform does: build an immutable image, start a new revision, wait for readiness, shift traffic, smoke-test streaming and persistence, and roll back when anything fails.',
  concept:
    'Deploying is not copying files to a server: it is replacing a running version with a new one without learners noticing. ' +
    'Container platforms such as Azure Container Apps run each release as a revision built from an immutable image tagged with its commit, so the same bytes that passed CI are what runs. ' +
    'A new revision receives traffic only after its readiness check (/api/ready from Lab 72) answers 200; a revision that crashes on a missing secret or never becomes ready never sees a request. ' +
    'After traffic moves, a smoke test checks what users rely on: health over valid HTTPS, a run that streams over SSE through the platform’s proxy, and data that survives a restart. ' +
    'If the smoke test fails, a rollback puts the previous image back; with blue-green revisions this is just moving the traffic weight back, with a single revision it means deploying the previous image again. ' +
    'This platform’s real staging environment is deployed exactly this way (npm run deploy:azure, then npm run smoke:staging), with the web app and API on one HTTPS origin so session cookies stay SameSite=Strict. ' +
    'In this lab you run releases through a deterministic simulator and, in live mode, probe the real staging deployment from the server.',
  objectives: [
    'Explain revisions, immutable image tags and readiness-gated traffic',
    'Predict what happens to traffic when a release fails in different ways',
    'Choose between single-revision and blue-green rollout, including rollback',
    'Verify a staging deployment: HTTPS, health, streaming and persistence',
  ],
  prerequisites: ['lab-72'],
  inputs: [
    {
      kind: 'select',
      name: 'scenario',
      label: 'The new release',
      default: 'healthy',
      options: [
        { value: 'healthy', label: 'Healthy' },
        { value: 'missing-secret', label: 'Missing secret (exits with code 78)' },
        { value: 'readiness-fails', label: 'Starts, but readiness fails (read-only data volume)' },
        { value: 'slow-start', label: 'Slow start (ready after ~75 s)' },
        { value: 'sse-buffered', label: 'Ready, but a proxy buffers the SSE stream' },
      ],
    },
    {
      kind: 'select',
      name: 'strategy',
      label: 'Rollout strategy',
      default: 'single',
      options: [
        { value: 'single', label: 'Single revision (replace when ready)' },
        { value: 'blue-green', label: 'Blue-green (keep the old revision, move traffic)' },
      ],
    },
    { kind: 'boolean', name: 'readinessGate', label: 'Wait for readiness before sending traffic', default: true },
    {
      kind: 'number',
      name: 'readinessTimeoutS',
      label: 'Readiness timeout (seconds)',
      min: 5,
      max: 300,
      step: 5,
      default: 60,
      required: true,
    },
    { kind: 'boolean', name: 'autoRollback', label: 'Roll back automatically on failure', default: true },
    { kind: 'text', name: 'tag', label: 'Image tag (commit)', minLength: 7, maxLength: 12, default: '5987a11', required: true },
  ],
  exampleInput: {
    scenario: 'healthy',
    strategy: 'single',
    readinessGate: true,
    readinessTimeoutS: 60,
    autoRollback: true,
    tag: '5987a11',
  },
  expectedOutput: {
    description:
      'Build, push and a new revision; the readiness gate passes after 12 s; traffic moves; the smoke test verifies health, readiness, streaming and persistence; the release is active with zero downtime.',
    example: { release: { released: true, downtimeS: 0, rolledBack: false } },
  },
  guide: {
    procedure: [
      'Run the healthy release and follow build → push → create-revision → readiness-gate → shift-traffic → smoke in the timeline.',
      'Choose “Missing secret”: the gate fails, traffic never moves, and the failed revision is retired.',
      'Turn the readiness gate off and repeat: count the seconds of downtime in the output.',
      'Choose “Slow start” with a 60 s timeout, then with 90 s: what changed?',
      'Choose “SSE buffered” with each strategy: compare how long the rollback takes.',
      'Read docs/DEPLOY.md and scripts/deploy-azure.ts: find the readiness probe and the rollback in the real deployment.',
      'In live mode (when the server has STAGING_URL), probe the real staging app.',
    ],
    prediction: 'A release crashes on start because a secret is missing. How many learners notice?',
    hints: [
      { level: 1, text: 'Traffic should follow readiness, not the deployment command.' },
      { level: 2, text: 'Health checks catch crashes; only a smoke test catches “ready but broken” (like a buffering proxy).' },
      {
        level: 3,
        text: 'Blue-green keeps the old revision running, so rollback is a traffic change; single-revision must start the old image again.',
      },
    ],
    commonMistakes: [
      { mistake: 'Tagging images as latest.', fix: 'Tag with the commit hash so a rollback can name the exact previous image.' },
      { mistake: 'Sending traffic as soon as the container starts.', fix: 'Gate traffic on /api/ready.' },
      {
        mistake: 'Testing only /api/health after a deploy.',
        fix: 'Smoke-test streaming and persistence too: they break in ways health checks miss.',
      },
      {
        mistake: 'Serving the web app from another origin without planning cookies and CORS.',
        fix: 'Serve both on one HTTPS origin, or design cross-site auth explicitly.',
      },
      { mistake: 'Never practising rollback.', fix: 'Run the rollback in staging so it works when you need it.' },
    ],
    challenge: {
      prompt: 'Add a canary strategy: 10% of traffic for 5 minutes with an error-rate gate, then 100%.',
      successCriteria: [
        'The canary never takes more than 10% before the gate passes',
        'A failing canary rolls back with at most 10% affected',
        'The plan prints the matching az containerapp ingress traffic commands',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'A new revision exits with code 78 (missing secret). With a readiness gate, what do learners see?',
      choices: [
        'Errors until someone notices',
        'Nothing: traffic stays on the previous revision',
        'A maintenance page',
        'The site goes down for a minute',
      ],
      correctIndex: 1,
      explanation: 'The revision never becomes ready, so traffic never moves to it.',
    },
    {
      id: 'q2',
      prompt: 'Why tag images with the commit hash?',
      choices: [
        'It is shorter',
        'A rollback can name the exact previous image, and what passed CI is what runs',
        'Registries require it',
        'It makes builds faster',
      ],
      correctIndex: 1,
      explanation: 'Mutable tags like latest make rollbacks guesswork.',
    },
    {
      id: 'q3',
      prompt: 'Which problem does only the post-deploy smoke test catch?',
      choices: [
        'The container crashes',
        'A proxy buffers SSE so tokens arrive all at once',
        'The image is missing',
        'The port is wrong',
      ],
      correctIndex: 1,
      explanation: 'The app is healthy and ready; only an end-to-end stream shows the buffering.',
    },
    {
      id: 'q4',
      prompt: 'How does blue-green make rollback faster?',
      choices: [
        'It deletes the new revision',
        'The old revision is still running: only the traffic weight moves back',
        'It skips readiness',
        'It uses a CDN',
      ],
      correctIndex: 1,
      explanation: 'No new container has to start.',
    },
  ],
  sourceFiles: [
    { path: 'release.ts', title: 'Release simulator', description: 'Revisions, readiness gate, traffic and rollback.' },
    { path: 'run.ts', title: 'Lab run and live staging probe', description: 'Step events, checks and the HTTPS probe.' },
  ],
  exercise: {
    instructions: 'Predict, then run, each failing scenario with both strategies; then design the canary challenge.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'no-unready-traffic', label: 'No traffic reached a revision that was not ready' },
    { id: 'failed-release-rolled-back', label: 'A failed release was rolled back automatically' },
    { id: 'healthy-release-smoke', label: 'A healthy release passed the post-deploy smoke test' },
    { id: 'plan-has-rollback', label: 'The deployment plan includes a rollback command' },
    { id: 'staging-probe', label: 'Live: the staging app answers health and readiness over valid HTTPS' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      { title: 'Revisions and images', minutes: 1, talkingPoints: ['Immutable tags', 'One origin for web and API'] },
      {
        title: 'Readiness gates',
        minutes: 2,
        talkingPoints: ['Missing secret', 'Gate off = downtime', 'Slow start and timeouts'],
      },
      { title: 'Smoke and rollback', minutes: 2, talkingPoints: ['Buffered SSE', 'Single vs blue-green rollback'] },
      {
        title: 'The real staging app',
        minutes: 1,
        talkingPoints: ['npm run deploy:azure', 'npm run smoke:staging', 'Restart and persistence'],
      },
      { title: 'Try it', minutes: 1, talkingPoints: ['Break a release', 'Probe staging live'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 1, maxToolCalls: 1 },
    costNotice: 'Free: offline is a simulation; live mode sends four small HTTPS requests to the platform’s own staging app.',
  },
  tags: ['deployment', 'azure-container-apps', 'rollback', 'readiness', 'sse', 'tls'],
} satisfies LabDefinitionInput;
