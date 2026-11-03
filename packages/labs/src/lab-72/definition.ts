import type { LabDefinitionInput } from '@mlp/contracts';

export const EXAMPLE_ENV = [
  '# Production container settings. Secrets are mounted files, never inline values.',
  'HOST=0.0.0.0',
  'PORT=8787',
  'MASTRA_MODE=offline',
  'MLP_DATA_DIR=/data',
  'TRUST_PROXY=1',
  'LOG_REQUESTS=true',
  'AUTH_PROVIDER=password',
  'AUTH_USERS_FILE=/run/secrets/auth_users',
  'AUTH_SESSION_SECRET_FILE=/run/secrets/auth_session_secret',
  'AUDIT_HMAC_KEY_FILE=/run/secrets/audit_hmac_key',
].join('\n');

export const lab72Definition = {
  id: 'lab-72',
  number: 72,
  title: 'Configuration and packaging',
  moduleId: 'module-15',
  summary:
    'Validate a deployment configuration with the platform’s own rules, load secrets from mounted files, and see readiness checks report exactly which dependency is down, the way the container does.',
  concept:
    'A container image should be the same in every environment; what changes is its configuration, so the configuration must be validated before the server accepts traffic. ' +
    'This platform checks every setting with a Zod schema at start-up and then applies profile rules: in production it refuses to start without a real identity provider, a session secret, an audit key and a persistent data directory, and it exits with a message that names the missing key without ever printing a secret. ' +
    'Secrets do not belong in images or in plain environment variables you might log by accident: each one can come from a file mounted by Docker or Kubernetes, through a <KEY>_FILE variable. ' +
    'Two endpoints tell an orchestrator how the instance is doing: /api/health (liveness: the process is up) and /api/ready (readiness: the data directory, storage, the web bundle, provider keys and the runner all work). ' +
    'A load balancer sends traffic only to ready instances, and while shutting down the instance turns not-ready first. ' +
    'Observability starts with structured logs: one JSON line per request with its request id, never a query string or a secret. ' +
    'In this lab you edit a real deployment configuration and run the exact validator, secret loader and readiness probe the API uses, with placeholder secrets generated on the server.',
  objectives: [
    'Validate deployment configuration and read value-free error messages',
    'Supply secrets through mounted files instead of inline variables',
    'Distinguish liveness from readiness and simulate a failing dependency',
    'Explain how the Dockerfile, compose secrets and CI smoke test fit together',
  ],
  prerequisites: ['lab-71'],
  inputs: [
    {
      kind: 'select',
      name: 'profile',
      label: 'Profile',
      default: 'production',
      options: [
        { value: 'production', label: 'production (strict rules)' },
        { value: 'development', label: 'development (warnings only)' },
      ],
    },
    {
      kind: 'textarea',
      name: 'envText',
      label: 'Environment (KEY=VALUE lines)',
      maxLength: 8_000,
      rows: 12,
      default: EXAMPLE_ENV,
      required: true,
      help: 'Placeholders only. Values that look like real provider keys are refused.',
    },
    { kind: 'boolean', name: 'mountUsers', label: 'Secret file mounted: /run/secrets/auth_users', default: true },
    {
      kind: 'boolean',
      name: 'mountSessionSecret',
      label: 'Secret file mounted: /run/secrets/auth_session_secret',
      default: true,
    },
    { kind: 'boolean', name: 'mountAuditKey', label: 'Secret file mounted: /run/secrets/audit_hmac_key', default: true },
    {
      kind: 'select',
      name: 'simulate',
      label: 'Simulate a failing dependency',
      default: 'none',
      options: [
        { value: 'none', label: 'Nothing fails' },
        { value: 'storage-down', label: 'Storage does not answer' },
        { value: 'data-dir-read-only', label: 'Data directory is read-only' },
        { value: 'runner-draining', label: 'Instance is shutting down (draining)' },
      ],
    },
    {
      kind: 'select',
      name: 'probeProvider',
      label: 'Live: provider to probe',
      default: 'openai',
      options: [
        { value: 'openai', label: 'OpenAI (GET /v1/models, free)' },
        { value: 'anthropic', label: 'Anthropic (GET /v1/models, free)' },
      ],
    },
  ],
  exampleInput: {
    profile: 'production',
    envText: EXAMPLE_ENV,
    mountUsers: true,
    mountSessionSecret: true,
    mountAuditKey: true,
    simulate: 'none',
    probeProvider: 'openai',
  },
  expectedOutput: {
    description:
      'The production configuration is accepted; every secret source is "file"; readiness is ready with config, data-dir, storage and runner ok and web-bundle/providers skipped; a docker run command is suggested.',
    example: { profile: 'production', accepted: true, problems: [], readiness: { status: 'ready' } },
  },
  guide: {
    procedure: [
      'Run the example and read secretSources: every secret comes from a file.',
      'Untick “auth_session_secret mounted” and run: find the refusal that names AUTH_SESSION_SECRET and its _FILE form.',
      'Add AUTH_SESSION_SECRET=… inline as well as the _FILE line: the loader refuses both forms at once.',
      'Change AUTH_PROVIDER to dev with the production profile: read why the development login is refused.',
      'Pick “Data directory is read-only”: readiness turns not-ready and names data-dir, while the process would stay live.',
      'Switch to the development profile with an empty environment: everything starts, with warnings.',
      'Read the Dockerfile and compose.yaml in the repository and match each setting to the output.',
    ],
    prediction: 'If storage is down, should /api/health fail too?',
    hints: [
      { level: 1, text: 'Liveness answers “is the process up?”; readiness answers “can it serve learners now?”.' },
      {
        level: 2,
        text: 'Every secret X can be X or X_FILE, never both; production requires AUTH_SESSION_SECRET, AUDIT_HMAC_KEY and AUTH_USERS.',
      },
      {
        level: 3,
        text: 'loadDeployConfig() = resolveSecretFiles() → parseConfig() → deploymentProblems(); the server prints the ConfigError and exits with code 78.',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Baking secrets into the image or a committed .env.',
        fix: 'Mount them at run time as files and point <KEY>_FILE at them.',
      },
      {
        mistake: 'Using one endpoint for liveness and readiness.',
        fix: 'A failing dependency should stop traffic (readiness), not restart the process (liveness).',
      },
      {
        mistake: 'Falling back to a random session secret in production.',
        fix: 'Refuse to start: a random key logs everyone out on each restart and breaks several instances.',
      },
      { mistake: 'Error messages that print the bad value.', fix: 'Name the key and the fix; never echo values.' },
      {
        mistake: 'Restart loops on bad configuration.',
        fix: 'Exit with a distinct code (78) and fix the configuration instead of restarting.',
      },
    ],
    challenge: {
      prompt:
        'Add a REDIS_URL setting with a readiness check that pings it, and a production rule that requires it when MAX_CONCURRENT_RUNS > 4.',
      successCriteria: [
        'The rule names the key without its value',
        'Readiness fails only the new check when Redis is down',
        'Development keeps working without Redis',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'The data directory becomes read-only. What should happen?',
      choices: [
        '/api/health fails and the process restarts',
        '/api/ready answers 503 naming data-dir; /api/health stays 200',
        'Nothing until a learner complains',
        'The server deletes the data',
      ],
      correctIndex: 1,
      explanation: 'Readiness stops traffic; restarting would not fix a read-only volume.',
    },
    {
      id: 'q2',
      prompt: 'Where should AUTH_SESSION_SECRET come from in a container?',
      choices: [
        'A line in the Dockerfile',
        'A mounted secret file via AUTH_SESSION_SECRET_FILE',
        'The browser',
        'It should be generated randomly at each start',
      ],
      correctIndex: 1,
      explanation: 'Files keep secrets out of the image and out of process listings and logs.',
    },
    {
      id: 'q3',
      prompt: 'Why does the API exit with code 78 on a bad configuration?',
      choices: [
        'It is random',
        'EX_CONFIG tells operators it is a configuration problem, not a crash to restart',
        'Docker requires it',
        'To hide the error',
      ],
      correctIndex: 1,
      explanation: 'A distinct code makes the cause obvious and avoids blind restart loops.',
    },
    {
      id: 'q4',
      prompt: 'What does the access log contain for each request?',
      choices: [
        'The full URL with query string',
        'Request id, method, path, status and duration',
        'The request body',
        'The session cookie',
      ],
      correctIndex: 1,
      explanation: 'Query strings and cookies can carry tokens, so they are never logged.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Configuration doctor', description: 'Parse, secrets, validate, readiness, provider probe.' },
    {
      path: 'definition.ts',
      title: 'Example deployment environment',
      description: 'The production settings the container uses.',
    },
  ],
  exercise: {
    instructions: 'Break the configuration in three different ways and explain each message, then try the Redis challenge.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'config-accepted', label: 'The configuration passes the deployment rules for its profile' },
    { id: 'secrets-from-files', label: 'In production, every secret comes from a mounted file' },
    { id: 'no-secret-echo', label: 'No secret value appears in the output or events' },
    { id: 'readiness-reflects', label: 'Readiness reports exactly the dependency that is down' },
    { id: 'provider-probe', label: 'Live mode: the provider accepts the server’s key' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'One image, many configs', minutes: 1, talkingPoints: ['Validate before serving', 'Profiles'] },
      { title: 'Secrets as files', minutes: 1, talkingPoints: ['<KEY>_FILE', 'Value-free errors', 'Exit 78'] },
      {
        title: 'Liveness vs readiness',
        minutes: 2,
        talkingPoints: ['/api/health and /api/ready', 'Simulate a failure', 'Draining on shutdown'],
      },
      { title: 'Packaging', minutes: 1, talkingPoints: ['Dockerfile and compose secrets', 'CI container smoke test'] },
      { title: 'Try it', minutes: 1, talkingPoints: ['Remove a secret', 'Make the data directory read-only'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 30_000,
    maxTimeoutMs: 60_000,
    budget: { maxSteps: 1, maxToolCalls: 1 },
    costNotice: 'Free in both modes: live mode only lists the provider’s models (no tokens are generated).',
  },
  tags: ['deployment', 'configuration', 'secrets', 'docker', 'health-checks', 'observability'],
} satisfies LabDefinitionInput;
