import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createLabRegistry } from './index.js';
import { resolveLabSourcePath } from './paths.js';
import type { SourceFile } from '@mlp/contracts';
import {
  CONCEPT_FLOWS,
  guideTranscript,
  teachingExcerpt,
  walkthroughPhases,
} from '../../../apps/web/src/features/visual-guides/content.js';

describe('Mastra visual teaching content', () => {
  const definitions = createLabRegistry().definitions();
  it('covers all 76 stable lesson numbers with distinct four-stage concepts and six complete exercise phases', () => {
    expect(definitions).toHaveLength(76);
    expect(CONCEPT_FLOWS).toHaveLength(76);
    expect(new Set(CONCEPT_FLOWS.map((flow) => flow.join(' / '))).size).toBe(76);
    for (const d of definitions) {
      expect(CONCEPT_FLOWS[d.number], d.id).toHaveLength(4);
      const phases = walkthroughPhases(d);
      expect(phases, d.id).toHaveLength(6);
      expect(phases[0]?.details).toContain(d.concept);
      expect(phases[3]?.summary).toBe(d.expectedOutput.description);
      expect(phases[3]?.details).toEqual(d.checks.map((c) => c.label));
      expect(phases[4]?.summary).toBe(d.guide.challenge.prompt);
      for (const p of phases) {
        expect(p.summary.trim(), d.id).not.toBe('');
        expect(p.details.length, d.id).toBeGreaterThan(0);
      }
    }
  });
  it('selects checked code from actual declared source files and never the hidden solution', () => {
    for (const d of definitions) {
      const files: SourceFile[] = d.sourceFiles.map((ref) => ({
        ...ref,
        language: ref.path.endsWith('.json') ? 'json' : 'typescript',
        code: readFileSync(resolveLabSourcePath(d.id, ref.path), 'utf8'),
      }));
      const excerpt = teachingExcerpt(d, files);
      expect(excerpt, d.id).not.toBeNull();
      expect(excerpt!.path, d.id).not.toBe(d.exercise.solutionFile);
      expect(excerpt!.code.trim().length, d.id).toBeGreaterThan(0);
      const original = files.find((f) => f.path === excerpt!.path)!;
      expect(original.code.replace(/\s/g, ''), d.id).toContain(excerpt!.code.replace(/\s/g, ''));
      expect(excerpt!.line, d.id).toBeGreaterThan(0);
      const text = guideTranscript(d, 'walkthrough', excerpt);
      expect(text, d.id).toContain(d.guide.challenge.prompt);
      expect(text, d.id).toContain(JSON.stringify(d.exampleInput, null, 2));
      expect(text, d.id).toContain(`${excerpt!.path}:${excerpt!.line}`);
    }
  });
  it('does not select undeclared files or hidden solutions, even if the API returns them', () => {
    const d = definitions[3]!;
    expect(
      teachingExcerpt(d, [
        { path: d.exercise.solutionFile!, title: 'Secret solution', language: 'markdown', code: 'hidden' },
        { path: 'private.ts', title: 'Undeclared', language: 'typescript', code: 'private' },
      ]),
    ).toBeNull();
  });
});
