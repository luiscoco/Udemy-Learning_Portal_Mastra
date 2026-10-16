import { describe, expect, it } from 'vitest';
import { catalog, getLab, validateCatalog } from './index.js';

describe('lab catalog', () => {
  it('has the orientation module plus 15 course modules in order', () => {
    expect(catalog.modules.map((m) => m.number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('exposes Dummy Lab 00 as an available zero-cost offline lab', () => {
    const lab = getLab('lab-00');
    expect(lab).toMatchObject({ title: 'Dummy Lab 00', status: 'available', zeroCost: true, offline: true });
  });

  it('has unique ids matching lab-NN', () => {
    const ids = catalog.labs.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^lab-\d{2}$/);
  });

  it('rejects duplicate ids', () => {
    const lab = catalog.labs[0]!;
    expect(() => validateCatalog({ modules: catalog.modules, labs: [lab, lab] })).toThrow(/Duplicate/);
  });

  it('rejects unknown prerequisites', () => {
    const lab = { ...catalog.labs[0]!, prerequisites: ['lab-99'] };
    expect(() => validateCatalog({ modules: catalog.modules, labs: [lab] })).toThrow(/prerequisite/);
  });
});
