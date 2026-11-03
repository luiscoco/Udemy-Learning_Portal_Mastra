# Durable production persistence

Each phase has a proof you can read in the output:

| Phase | Proof |
| --- | --- |
| migrate | `migration.applied` lists the versions. After an injected failure, `migration.rollback` shows version 2 and no `quiz_best` column. |
| write, then restart | `restart.before` equals `restart.after`, and `restart.recalled` contains your note. |
| backup | The manifest records the hash, bytes, schema version and row counts. |
| restore-drill | The drill file's counts equal the manifest's, the live counts are unchanged, and a corrupted copy is refused. |
| retention | The three expired demo runs are swept, and the current run is kept. |

```ts
const tx = await client.transaction('write');
try {
  for (const sql of migration.statements) await tx.execute(sql);
  await tx.execute({ sql: 'INSERT INTO app_schema_migrations VALUES (?, ?, ?, ?)', args: [v, name, checksum, now] });
  await tx.execute(`PRAGMA user_version = ${v}`);
  await tx.commit();
} catch (e) {
  await tx.rollback(); // the version stays where it was
}
```

## Challenge outline: migration 4

1. **Append the migration.** Add `{ version: 4, name: 'documents-tags', statements: ['ALTER TABLE app_documents ADD COLUMN tags TEXT', "UPDATE app_documents SET tags = '[]' WHERE tags IS NULL"] }` to the end of `MIGRATIONS`.
2. **Add a test** that does the following:
   - back up a v3 database;
   - `restore()` it into a temp file;
   - `migrate()` it, and expect `applied` to be `[4]`;
   - then call `migrate(..., { failAfterFirstStatementOf: 4 })` on another v3 copy, and expect `user_version` to stay 3.

Example input: `{ "store": "fresh", "targetVersion": 3, "failMigration": false, "retentionDays": 30, "backupsKeep": 7 }`.
