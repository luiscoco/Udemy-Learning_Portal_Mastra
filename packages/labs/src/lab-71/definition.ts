import type { LabDefinitionInput } from '@mlp/contracts';
import { DEFAULT_LIVE_MODELS } from '@mlp/mastra-runtime';

export const lab71Definition = {
  id: 'lab-71',
  number: 71,
  title: 'Durable production persistence',
  moduleId: 'module-15',
  summary:
    'Keep progress, documents, runs and agent threads in one durable database with versioned migrations, verified backups, restore drills and a documented retention policy.',
  concept:
    'A production assistant must not forget everything when its server restarts or a deploy changes the schema. ' +
    'In this lab one SQLite file (through libSQL) holds four kinds of data: learner progress, knowledge documents, run records, and the Mastra memory threads of an agent, so one snapshot backs all of them up together. ' +
    'Mastra creates and upgrades its own memory tables; your app tables need their own migrations: numbered, forward-only steps, each run inside one transaction with a recorded checksum. ' +
    'If a migration fails part-way, the transaction rolls back and the schema version stays where it was; if someone edits an applied migration, or the database is newer than the code, the migrator refuses instead of guessing. ' +
    'A backup is only useful if it restores, so every snapshot gets a manifest with its hash and row counts, and a restore drill proves the snapshot reproduces the data, without touching the live database. ' +
    'A corrupted snapshot must be caught before it replaces anything. ' +
    'Finally, not everything should live forever: run records expire after a number of days, while progress, threads and documents belong to the learner until they delete them. ' +
    'Mastra supplies the storage adapter; the migrations, backups and retention here are an explicitly app-level layer on top of it.',
  objectives: [
    'Apply versioned, transactional migrations and prove a failed one rolls back',
    'Show that progress, documents, runs and threads survive a restart',
    'Create a verified backup and restore it in a drill without touching live data',
    'Apply and explain a retention policy for each kind of data',
  ],
  prerequisites: ['lab-70'],
  inputs: [
    {
      kind: 'select',
      name: 'store',
      label: 'Database',
      default: 'fresh',
      options: [
        { value: 'fresh', label: 'Start from an empty database (watch every migration)' },
        { value: 'durable', label: 'My durable database (kept between runs)' },
      ],
    },
    {
      kind: 'number',
      name: 'targetVersion',
      label: 'Target schema version',
      min: 1,
      max: 3,
      step: 1,
      default: 3,
      required: true,
    },
    {
      kind: 'boolean',
      name: 'failMigration',
      label: 'Fail migration 3 part-way',
      default: false,
      help: 'Injects an error after the first statement of migration 3; the migrator rolls it back, then retries without the fault.',
    },
    {
      kind: 'textarea',
      name: 'note',
      label: 'Note for the durable thread',
      maxLength: 500,
      rows: 2,
      default: 'Remember that our backup window is 02:00 UTC.',
      required: true,
    },
    {
      kind: 'number',
      name: 'retentionDays',
      label: 'Keep runs for (days)',
      min: 1,
      max: 365,
      step: 1,
      default: 30,
      required: true,
    },
    { kind: 'number', name: 'backupsKeep', label: 'Backups to keep', min: 1, max: 30, step: 1, default: 7, required: true },
    {
      kind: 'select',
      name: 'modelId',
      label: 'Model',
      default: 'openai/gpt-5-mini',
      options: DEFAULT_LIVE_MODELS.map((id) => ({ value: id, label: id })),
    },
  ],
  exampleInput: {
    store: 'fresh',
    targetVersion: 3,
    failMigration: false,
    note: 'Remember that our backup window is 02:00 UTC.',
    retentionDays: 30,
    backupsKeep: 7,
    modelId: 'openai/gpt-5-mini',
  },
  expectedOutput: {
    description:
      'Migrations 1–3 are applied; the counts before and after the restart match and the note is recalled; the backup verifies, the restore drill matches it, a corrupted copy is refused, and the three expired demo runs are swept.',
    example: { store: 'fresh', migration: { from: 0, versionAfter: 3 }, corruption: { detected: true } },
  },
  guide: {
    procedure: [
      'Run the example: follow migrate → write → restart → backup → restore-drill → retention in the timeline.',
      'Open the output: compare restart.before with restart.after, and read the backup manifest.',
      'Turn on “Fail migration 3” and run again: find the rollback record (version 2, no quiz_best column) and the retry.',
      'Set the target version to 1: the document write is skipped, because v1 has no documents table.',
      'Switch to “My durable database” and run twice: the second run applies no migrations and the thread holds both notes.',
      'With the durable database at v3, set the target to 2: the migrator refuses to go backwards.',
      'Read docs/RETENTION.md and explain why runs expire but threads do not.',
    ],
    prediction: 'If migration 3 fails after its first statement, which schema version does the database end at?',
    hints: [
      { level: 1, text: 'Each migration is all-or-nothing: look for the transaction around its statements.' },
      {
        level: 2,
        text: 'The schema version lives in PRAGMA user_version and the app_schema_migrations table; both change only on commit.',
      },
      {
        level: 3,
        text: 'migrate() opens client.transaction("write"), runs the statements, inserts the history row and sets user_version, then commits; any error calls rollback().',
      },
    ],
    commonMistakes: [
      {
        mistake: 'Editing a migration that already ran in production.',
        fix: 'Add a new migration; the checksum check refuses edited ones.',
      },
      {
        mistake: 'Copying the .db file while the server writes to it.',
        fix: 'Use VACUUM INTO (or the SQLite backup API) for a consistent snapshot of a WAL database.',
      },
      { mistake: 'Never testing a restore.', fix: 'Run a restore drill into a separate file and compare it with the manifest.' },
      {
        mistake: 'Restoring over a database that is still open.',
        fix: 'Close every client, remove stale -wal/-shm files, then swap the file in atomically.',
      },
      {
        mistake: 'Keeping run logs forever.',
        fix: 'Expire runs by age and count; keep learner-owned data until the learner deletes it.',
      },
    ],
    challenge: {
      prompt:
        'Add migration 4 that adds a `tags` column to app_documents with a backfill, and a test that migrates a v3 backup to v4.',
      successCriteria: [
        'Migrations 1–3 are unchanged (their checksums still match)',
        'The v3 backup restores and migrates to v4',
        'A failure in migration 4 leaves the database at v3',
      ],
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Migration 3 fails after its first statement. What happens?',
      choices: [
        'The database stays half-migrated at v3',
        'The transaction rolls back and the version stays at 2',
        'The database is deleted',
        'Mastra repairs it',
      ],
      correctIndex: 1,
      explanation: 'Statements, the history row and user_version commit together or not at all.',
    },
    {
      id: 'q2',
      prompt: 'Why does the restore drill restore into a separate file?',
      choices: [
        'It is faster',
        'To prove the backup works without risking the live data',
        'SQLite requires it',
        'To save disk space',
      ],
      correctIndex: 1,
      explanation: 'A drill is a test: compare the restored file with the manifest, keep the live database untouched.',
    },
    {
      id: 'q3',
      prompt: 'Which data does the retention sweep delete?',
      choices: [
        'Threads older than 30 days',
        'Expired run records only',
        'Everything older than the policy',
        'Documents nobody opened',
      ],
      correctIndex: 1,
      explanation: 'Progress, threads and documents belong to the learner until they delete them.',
    },
    {
      id: 'q4',
      prompt: 'Who migrates the mastra_* tables?',
      choices: ['Your app migrations', 'LibSQLStore.init() from @mastra/libsql', 'Nobody', 'The browser'],
      correctIndex: 1,
      explanation: 'Mastra manages its own tables; the app migrates only app_* tables.',
    },
  ],
  sourceFiles: [
    {
      path: 'migrations.ts',
      title: 'Versioned migrations',
      description: 'Checksums, transactions, drift and downgrade refusal.',
    },
    { path: 'store.ts', title: 'Durable store', description: 'One file for app tables and Mastra memory.' },
    { path: 'backup.ts', title: 'Backups and restore', description: 'VACUUM INTO, manifest, verify, atomic restore.' },
    { path: 'retention.ts', title: 'Retention policy', description: 'Transactional sweep of expired runs.' },
    { path: 'run.ts', title: 'Lab phases and checks', description: 'Migrate, write, restart, backup, drill, retention.' },
  ],
  exercise: {
    instructions: 'Explain each phase’s proof, then implement the migration 4 challenge locally.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'migrations-applied', label: 'The schema reached the target version through recorded migrations' },
    { id: 'rollback-proven', label: 'A failing migration rolled back completely' },
    {
      id: 'data-survives-restart',
      label: 'Progress, documents, runs and the thread survived closing and reopening the database',
    },
    { id: 'backup-verified', label: 'The backup snapshot matches its manifest' },
    { id: 'restore-drill', label: 'The restore drill reproduced the backup without touching the live database' },
    { id: 'corruption-refused', label: 'A corrupted backup is detected and refused' },
    { id: 'retention-swept', label: 'Expired runs were deleted; the current run and learner data were kept' },
  ],
  instructorOutline: {
    durationMinutes: 7,
    segments: [
      {
        title: 'What must survive',
        minutes: 1,
        talkingPoints: ['Progress, documents, runs, threads', 'One file, one backup unit'],
      },
      {
        title: 'Migrations',
        minutes: 2,
        talkingPoints: ['Forward-only and checksummed', 'Transactions and rollback', 'Drift and downgrade refusal'],
      },
      {
        title: 'Restart and backups',
        minutes: 2,
        talkingPoints: ['Close and reopen', 'VACUUM INTO and the manifest', 'Restore drill and corruption'],
      },
      { title: 'Retention', minutes: 1, talkingPoints: ['Runs expire', 'Learner data stays until deleted'] },
      { title: 'Try it', minutes: 1, talkingPoints: ['Fail migration 3', 'Durable database twice'] },
    ],
  },
  execution: {
    modes: ['offline', 'live'],
    defaultTimeoutMs: 60_000,
    maxTimeoutMs: 120_000,
    budget: { maxSteps: 1, maxToolCalls: 1 },
    costNotice: 'Offline is free. Live mode makes one short model call to write the thread turn, usually well under a cent.',
  },
  tags: ['persistence', 'migrations', 'backups', 'retention', 'production'],
} satisfies LabDefinitionInput;
