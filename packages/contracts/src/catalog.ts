import { z } from 'zod';

export const LabIdSchema = z.string().regex(/^lab-\d{2}$/, 'Lab ids look like lab-07');
export type LabId = z.infer<typeof LabIdSchema>;

export const ModuleIdSchema = z.string().regex(/^module-\d{2}$/, 'Module ids look like module-03');
export type ModuleId = z.infer<typeof ModuleIdSchema>;

/**
 * - available: implemented and runnable
 * - locked: title known, implementation not yet delivered (preview only)
 */
export const LabStatusSchema = z.enum(['available', 'locked']);
export type LabStatus = z.infer<typeof LabStatusSchema>;

export const CatalogLabSchema = z.object({
  id: LabIdSchema,
  number: z.number().int().min(0).max(99),
  title: z.string().min(1),
  moduleId: ModuleIdSchema,
  status: LabStatusSchema,
  /** true when the lab can run with zero provider cost (offline mock mode). */
  zeroCost: z.boolean(),
  /** true when the lab supports deterministic offline execution. */
  offline: z.boolean(),
  prerequisites: z.array(LabIdSchema),
});
export type CatalogLab = z.infer<typeof CatalogLabSchema>;

export const CatalogModuleSchema = z.object({
  id: ModuleIdSchema,
  number: z.number().int().min(0).max(99),
  title: z.string().min(1),
  /** false while the module title has not yet been confirmed by the course outline. */
  titleConfirmed: z.boolean(),
  labIds: z.array(LabIdSchema),
});
export type CatalogModule = z.infer<typeof CatalogModuleSchema>;

export const CatalogSchema = z.object({
  modules: z.array(CatalogModuleSchema),
  labs: z.array(CatalogLabSchema),
});
export type Catalog = z.infer<typeof CatalogSchema>;
