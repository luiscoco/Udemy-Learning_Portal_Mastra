import { describe, expect, it } from 'vitest';
import { LABS } from './labs.js';
import { MILESTONE_PROJECTS, PROJECT_TOPICS, questionShortcuts, stagePrompt } from './projects.js';
describe('milestone learning paths', () => {
  it('keeps 22 ordered evidence-based stages linked to real labs', () => {
    const stages = MILESTONE_PROJECTS.flatMap((p) => p.stages);
    expect(stages.map((s) => s.id)).toEqual(Array.from({ length: 22 }, (_, i) => `M${String(i + 1).padStart(2, '0')}`));
    for (const project of MILESTONE_PROJECTS)
      for (const s of project.stages) {
        expect(s.evidence.length).toBeGreaterThanOrEqual(3);
        expect(s.labs.every((id) => LABS.some((l) => l.id === id))).toBe(true);
        expect(stagePrompt(project, s)).toContain('Never execute submitted arbitrary code');
      }
  });
  it('covers every course lab and foundations without inventing feature counts', () => {
    expect(new Set(PROJECT_TOPICS.map((t) => t.id)).size).toBe(PROJECT_TOPICS.length);
    expect(PROJECT_TOPICS.filter((t) => !t.introduction).map((t) => t.labId)).toEqual(LABS.map((l) => l.id));
    expect(new Set(PROJECT_TOPICS.map((t) => t.section)).size).toBe(17);
    expect(questionShortcuts('Agents')).toHaveLength(10);
  });
});
