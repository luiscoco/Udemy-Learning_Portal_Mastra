import { describe, expect, it } from 'vitest';
import { catalog, getLab, labsInModule, validateCatalog } from './index.js';

describe('lab catalog', () => {
  it('has the orientation module plus 15 course modules in order', () => {
    expect(catalog.modules.map((m) => m.number)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it('puts five labs in every course module, in order', () => {
    for (const mod of catalog.modules.filter((m) => m.number > 0)) {
      const first = (mod.number - 1) * 5 + 1;
      expect(labsInModule(mod.id).map((l) => l.number)).toEqual([first, first + 1, first + 2, first + 3, first + 4]);
    }
  });

  it('registers 76 labs: Dummy Lab 00 plus lab-01..lab-75', () => {
    expect(catalog.labs).toHaveLength(76);
    expect(catalog.labs.at(-1)?.id).toBe('lab-75');
  });

  it('exposes Dummy Lab 00 as an available zero-cost offline lab', () => {
    const lab = getLab('lab-00');
    expect(lab).toMatchObject({ title: 'Dummy Lab 00', status: 'available', zeroCost: true, offline: true });
  });

  it('uses confirmed outline titles for every lab', () => {
    expect(getLab('lab-01')).toMatchObject({ title: 'Create a Mastra project', titleConfirmed: true, moduleId: 'module-01' });
    expect(getLab('lab-26')).toMatchObject({ title: 'First typed workflow', titleConfirmed: true, moduleId: 'module-06' });
    expect(getLab('lab-75')).toMatchObject({
      title: 'Enterprise AI Assistant capstone',
      titleConfirmed: true,
      moduleId: 'module-15',
    });
    expect(catalog.labs.filter((l) => !l.titleConfirmed)).toEqual([]);
  });

  it('chains prerequisites to the previous lab', () => {
    expect(getLab('lab-01')?.prerequisites).toEqual(['lab-00']);
    expect(getLab('lab-42')?.prerequisites).toEqual(['lab-41']);
  });

  it('has unique ids matching lab-NN', () => {
    const ids = catalog.labs.map((l) => l.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^lab-\d{2}$/);
  });

  it('rejects duplicate ids', () => {
    const lab = catalog.labs[0]!;
    expect(() => validateCatalog({ modules: [], labs: [lab, lab] })).toThrow(/Duplicate/);
  });

  it('rejects unknown prerequisites', () => {
    const lab = { ...catalog.labs[0]!, prerequisites: ['lab-99'] };
    expect(() =>
      validateCatalog({
        modules: catalog.modules.filter((m) => m.id === 'module-00').map((m) => ({ ...m, labIds: ['lab-00'] })),
        labs: [lab],
      }),
    ).toThrow(/prerequisite/);
  });
});

describe('module outline titles', () => {
  it('confirms every module title', async () => {
    const { MODULES } = await import('./modules.js');
    const byNumber = (n: number) => MODULES.find((m) => m.number === n)!;
    expect(byNumber(6)).toMatchObject({ title: 'Workflow Foundations', titleConfirmed: true });
    expect(byNumber(15)).toMatchObject({ title: 'Production and Capstone', titleConfirmed: true });
    expect(MODULES.filter((m) => !m.titleConfirmed)).toEqual([]);
    expect(MODULES).toHaveLength(16);
  });
});
