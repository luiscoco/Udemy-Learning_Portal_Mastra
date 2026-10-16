import { CatalogSchema, type Catalog, type CatalogLab, type CatalogModule } from '@mlp/contracts';
import { MODULES } from './modules.js';
import { LABS } from './labs.js';

export { MODULES } from './modules.js';
export { LABS } from './labs.js';

/** Validates structural invariants beyond the Zod shape. Throws on violation. */
export function validateCatalog(catalog: Catalog): Catalog {
  const parsed = CatalogSchema.parse(catalog);
  const ids = new Set<string>();
  for (const lab of parsed.labs) {
    if (ids.has(lab.id)) throw new Error(`Duplicate lab id ${lab.id}`);
    ids.add(lab.id);
    if (lab.id !== `lab-${String(lab.number).padStart(2, '0')}`) {
      throw new Error(`Lab ${lab.id} number mismatch (${lab.number})`);
    }
  }
  const moduleIds = new Set(parsed.modules.map((m) => m.id));
  for (const lab of parsed.labs) {
    if (!moduleIds.has(lab.moduleId)) throw new Error(`Lab ${lab.id} references unknown module ${lab.moduleId}`);
    for (const pre of lab.prerequisites) {
      if (!ids.has(pre)) throw new Error(`Lab ${lab.id} has unknown prerequisite ${pre}`);
    }
  }
  for (const mod of parsed.modules) {
    for (const id of mod.labIds) {
      const lab = parsed.labs.find((l) => l.id === id);
      if (!lab) throw new Error(`Module ${mod.id} lists unknown lab ${id}`);
      if (lab.moduleId !== mod.id) throw new Error(`Lab ${id} listed in ${mod.id} but belongs to ${lab.moduleId}`);
    }
  }
  return parsed;
}

export const catalog: Catalog = validateCatalog({ modules: MODULES, labs: LABS });

export function getLab(id: string): CatalogLab | undefined {
  return catalog.labs.find((l) => l.id === id);
}

export function getModule(id: string): CatalogModule | undefined {
  return catalog.modules.find((m) => m.id === id);
}

export function labsInModule(moduleId: string): CatalogLab[] {
  const mod = getModule(moduleId);
  if (!mod) return [];
  return mod.labIds.map((id) => getLab(id)).filter((l): l is CatalogLab => Boolean(l));
}
