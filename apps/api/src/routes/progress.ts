import { Router } from 'express';
import type { z } from 'zod';
import {
  PROGRESS_SUBJECT_HEADER,
  ProgressImportRequestSchema,
  ProgressResetRequestSchema,
  ProgressWriteRequestSchema,
} from '@mlp/contracts';
import { LabError, zodDetails, type LabRegistry } from '@mlp/lab-engine';
import type { LabServices } from '@mlp/labs';
import { requireAuth } from '../auth.js';
import type { ProgressRepository } from '../progress-store.js';

function parse<S extends z.ZodType>(schema: S, value: unknown): z.infer<S> {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new LabError('VALIDATION_FAILED', 'Invalid progress request.', { details: zodDetails(parsed.error) });
  return parsed.data;
}

export function progressRouter(repository: ProgressRepository, registry: LabRegistry<LabServices>): Router {
  const router = Router();
  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  router.use(requireAuth);
  router.use((req, _res, next) => {
    let expected: string | undefined;
    try {
      expected = decodeURIComponent(req.header(PROGRESS_SUBJECT_HEADER) ?? '');
    } catch {
      /* mismatch */
    }
    if (expected !== req.principal!.sub) throw new LabError('NOT_FOUND', 'Progress account does not match this session.');
    next();
  });
  router.get('/', async (req, res) => {
    res.json(await repository.get(req.principal!.sub));
  });
  router.post('/import', async (req, res) => {
    const { records } = parse(ProgressImportRequestSchema, req.body);
    records.forEach((record) => registry.require(record.labId));
    res.json(await repository.import(req.principal!.sub, records));
  });
  router.post('/:labId', async (req, res) => {
    const labId = String(req.params.labId);
    registry.require(labId);
    const { baseRevision, record } = parse(ProgressWriteRequestSchema, req.body);
    if (record.labId !== labId) throw new LabError('VALIDATION_FAILED', 'Progress record must match the requested lab.');
    res.json(await repository.write(req.principal!.sub, labId, baseRevision, record));
  });
  router.post('/:labId/reset', async (req, res) => {
    const labId = String(req.params.labId);
    registry.require(labId);
    const { baseRevision } = parse(ProgressResetRequestSchema, req.body);
    res.json(await repository.write(req.principal!.sub, labId, baseRevision, null));
  });
  return router;
}
