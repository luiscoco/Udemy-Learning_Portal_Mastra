import type { Mastra } from '@mastra/core';
import type { Dataset } from '@mastra/core/datasets';
import { DATASET_ID, DATASET_NAME, SEED_REVISIONS, type SeedOp } from './scenarios.js';

export interface DatasetMeta {
  seedRevision: number;
  /** Seed revision → the dataset version it produced. */
  revisionVersions: Record<string, number>;
}

export interface SeedResult {
  dataset: Dataset;
  created: boolean;
  /** Seed operations applied by this call (0 when the dataset was already up to date). */
  applied: { revision: number; op: SeedOp['op']; externalId: string; version: number }[];
  meta: DatasetMeta;
  version: number;
}

type Item = Extract<Awaited<ReturnType<Dataset['listItems']>>, unknown[]>[number];
/** listItems returns an array (with a version) or a page { items, pagination }: normalised to the items. */
export async function itemsOf(dataset: Dataset, version?: number): Promise<Item[]> {
  const r = await dataset.listItems({ perPage: 200, ...(version ? { version } : {}) });
  return Array.isArray(r) ? r : r.items;
}

const isNotFound = (e: unknown) => /not found/i.test(e instanceof Error ? e.message : String(e));

/**
 * Gets the dataset (creating it once) and applies the seed revisions it has not seen yet, in order.
 * Adds use the scenario's externalId (re-adding an identical payload is a no-op in Mastra); changes to an
 * existing scenario go through updateItem, because a different payload under the same externalId is refused.
 * Callers serialise this per database file.
 */
export async function ensureDataset(mastra: Mastra): Promise<SeedResult> {
  let dataset: Dataset;
  let created = false;
  try {
    dataset = await mastra.datasets.get({ id: DATASET_ID });
  } catch (e) {
    if (!isNotFound(e)) throw e;
    // create() with an existing id logs a UNIQUE error instead of throwing, so it is only called after get() failed.
    dataset = await mastra.datasets.create({
      id: DATASET_ID,
      name: DATASET_NAME,
      description: 'Versioned scenarios for the course FAQ agent (lab 58).',
      targetType: 'agent',
      targetIds: ['faq-agent'],
      metadata: { seedRevision: 0, revisionVersions: {} } satisfies DatasetMeta,
    });
    created = true;
  }
  const details = await dataset.getDetails();
  const meta: DatasetMeta = {
    seedRevision: Number((details.metadata as Partial<DatasetMeta> | null)?.seedRevision ?? 0),
    revisionVersions: { ...((details.metadata as Partial<DatasetMeta> | null)?.revisionVersions ?? {}) },
  };
  const applied: SeedResult['applied'] = [];
  for (const rev of SEED_REVISIONS.filter((r) => r.revision > meta.seedRevision)) {
    for (const op of rev.ops) {
      const { externalId, input, groundTruth, metadata } = op.item;
      if (op.op === 'add') await dataset.addItem({ externalId, input, groundTruth, metadata });
      else {
        const existing = (await itemsOf(dataset)).find((i) => i.externalId === externalId);
        if (!existing) throw new Error(`Seed revision ${rev.revision}: no item ${externalId} to update`);
        await dataset.updateItem({ itemId: existing.id, input, groundTruth, metadata } as never);
      }
      applied.push({ revision: rev.revision, op: op.op, externalId, version: (await dataset.getDetails()).version });
    }
    meta.seedRevision = rev.revision;
    meta.revisionVersions[String(rev.revision)] = (await dataset.getDetails()).version;
    await dataset.update({ metadata: { ...meta } } as never);
  }
  return { dataset, created, applied, meta, version: (await dataset.getDetails()).version };
}
