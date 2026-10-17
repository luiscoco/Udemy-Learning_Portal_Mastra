import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export const KEEP_COMPARISONS = 20;

export interface SavedComparisonSummary {
  id: string;
  savedAt: string;
  labels: [string, string];
  modelId: string;
}

/** Saves a comparison record as JSON under `<dir>/<id>.json`, then prunes to the newest KEEP_COMPARISONS. */
export async function saveComparison(dir: string, id: string, record: object): Promise<string> {
  if (!/^[\w-]{8,64}$/.test(id)) throw new Error('Invalid comparison id');
  await mkdir(dir, { recursive: true });
  const path = join(dir, `${id}.json`);
  await writeFile(path, JSON.stringify(record, null, 2), 'utf8');
  await prune(dir);
  return path;
}

async function prune(dir: string) {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  if (files.length <= KEEP_COMPARISONS) return;
  const withTimes = await Promise.all(files.map(async (f) => ({ f, t: (await stat(join(dir, f))).mtimeMs })));
  withTimes.sort((a, b) => b.t - a.t);
  await Promise.all(withTimes.slice(KEEP_COMPARISONS).map(({ f }) => rm(join(dir, f), { force: true })));
}

/** Newest-first summaries of saved comparisons (corrupt files are skipped). */
export async function listComparisons(dir: string, limit = 5): Promise<SavedComparisonSummary[]> {
  let files: string[];
  try {
    files = (await readdir(dir)).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  const out: SavedComparisonSummary[] = [];
  for (const f of files) {
    try {
      const r = JSON.parse(await readFile(join(dir, f), 'utf8')) as {
        id: string;
        savedAt: string;
        settings: { modelId: string };
        variants: { label: string }[];
      };
      out.push({
        id: r.id,
        savedAt: r.savedAt,
        modelId: r.settings.modelId,
        labels: [r.variants[0]!.label, r.variants[1]!.label],
      });
    } catch {
      // ignore unreadable records
    }
  }
  return out.sort((a, b) => b.savedAt.localeCompare(a.savedAt)).slice(0, limit);
}
