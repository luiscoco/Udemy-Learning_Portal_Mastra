import type { Client } from '@libsql/client';

/** What is kept and for how long. Documented for operators in docs/RETENTION.md. */
export interface RetentionPolicy {
  /** Runs finished longer ago than this are deleted. */
  runDays: number;
  /** At most this many runs per lab and owner are kept (the newest). */
  runsPerLab: number;
  /** Snapshots kept by backup rotation. */
  backupsKeep: number;
}

export const DEFAULT_RETENTION: RetentionPolicy = { runDays: 30, runsPerLab: 20, backupsKeep: 7 };

/** Data kinds that are never swept: they belong to the learner until they delete them. */
export const KEPT_UNTIL_DELETED = ['progress', 'threads', 'documents'] as const;

export interface SweepReport {
  cutoff: string;
  expiredByAge: number;
  expiredByCap: number;
  remaining: number;
}

/** Deletes expired runs in one transaction: by age first, then everything beyond the per-lab cap. */
export async function sweep(client: Client, policy: RetentionPolicy, now = new Date()): Promise<SweepReport> {
  const cutoff = new Date(now.getTime() - policy.runDays * 86_400_000).toISOString();
  const tx = await client.transaction('write');
  try {
    const byAge = await tx.execute({
      sql: 'DELETE FROM app_runs WHERE finished_at IS NOT NULL AND finished_at < ?',
      args: [cutoff],
    });
    const byCap = await tx.execute({
      sql: `DELETE FROM app_runs WHERE run_id IN (
              SELECT run_id FROM (
                SELECT run_id, ROW_NUMBER() OVER (PARTITION BY owner, lab_id ORDER BY started_at DESC, run_id DESC) AS rn
                FROM app_runs
              ) WHERE rn > ?
            )`,
      args: [policy.runsPerLab],
    });
    const remaining = Number((await tx.execute('SELECT count(*) AS n FROM app_runs')).rows[0]?.n ?? 0);
    await tx.commit();
    return { cutoff, expiredByAge: byAge.rowsAffected, expiredByCap: byCap.rowsAffected, remaining };
  } catch (e) {
    await tx.rollback();
    throw e;
  } finally {
    tx.close();
  }
}
