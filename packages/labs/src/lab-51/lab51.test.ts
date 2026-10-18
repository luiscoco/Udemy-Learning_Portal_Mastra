import { afterAll, describe, expect, it } from 'vitest';
import { AgentConversationSchema } from '@mlp/contracts';
import { LabRegistry, LabRunner } from '@mlp/lab-engine';
import { createLabServices } from '../services.js';
import { Notebook } from './agents.js';
import {
  citationsOf,
  formatNotes,
  parseNotes,
  sentencesOf,
  structuralIssues,
  supportIssues,
  withoutSentences,
  type Note,
} from './grounding.js';
import { lab51Definition } from './definition.js';
import { lab51, type Lab51Output } from './run.js';
import { searchSources } from './sources.js';
import { SLIPS } from './workflow.js';

const runner = new LabRunner({
  registry: new LabRegistry([lab51]),
  services: createLabServices({ serverMode: 'offline', env: {} }),
  liveEnabled: false,
});
afterAll(() => runner.dispose());

type Result = { output: Lab51Output; validation: { passed: boolean; checks: { id: string; passed: boolean }[] } };
async function run(input: Record<string, unknown> = {}) {
  const r = runner.start('lab-51', { input: { ...lab51.definition.exampleInput, ...input } });
  await runner.waitFor(r.runId);
  const events = runner.events(r.runId);
  const result = events.find((e) => e.type === 'result') as Result | undefined;
  if (!result) throw new Error(JSON.stringify(events.filter((e) => e.type === 'error' || e.type === 'complete')));
  return { ...result, events };
}

const notes: Note[] = [
  { n: 1, claim: 'Steps run in a fixed order', sourceId: 'S1', quote: 'runs in a fixed, explicit order' },
  { n: 2, claim: 'Then passes output to the next step', sourceId: 'S2', quote: 'the output of one step becomes the input of the next step' },
];

describe('lab-51 grounding helpers (unit)', () => {
  it('splits sentences and reads citations', () => {
    expect(sentencesOf('# Title\nSteps run in order [1]. Output flows on [1, 2]. Done. [2]')).toEqual([
      'Steps run in order [1].',
      'Output flows on [1, 2].',
      'Done. [2]',
    ]);
    expect(citationsOf('a [1][3] b [2, 4].')).toEqual([1, 3, 2, 4]);
  });
  it('finds uncited sentences, unknown citations and weak support', () => {
    const draft = `Steps run in a fixed order [1]. ${SLIPS['uncited-claim']} ${SLIPS['unknown-citation']} ${SLIPS['unsupported-claim']}`;
    expect(structuralIssues(draft, notes).map((i) => i.kind)).toEqual(['uncited', 'unknown-citation']);
    expect(supportIssues(draft, notes).map((i) => i.sentence)).toEqual([SLIPS['unsupported-claim']]);
    expect(structuralIssues('', notes)[0]!.problem).toBe('The draft is empty.');
    expect(withoutSentences(draft, [SLIPS['uncited-claim']!])).not.toContain('spacecraft');
  });
  it('notes survive the handoff format', () => {
    expect(parseNotes(formatNotes(notes))).toEqual(notes);
  });
  it('record_finding accepts only verbatim quotes, once each, up to the limit', () => {
    const nb = new Notebook();
    expect(nb.record({ claim: 'c', sourceId: 'S1', quote: 'runs in a fixed,   explicit order' })).toEqual({ accepted: true, n: 1 });
    expect(nb.record({ claim: 'c', sourceId: 'S1', quote: 'runs in a fixed, explicit order' }).accepted).toBe(false);
    expect(nb.record({ claim: 'c', sourceId: 'S1', quote: 'runs in any order you like' })).toMatchObject({ accepted: false });
    expect(nb.record({ claim: 'c', sourceId: 'S9', quote: 'whatever text here' })).toMatchObject({ accepted: false });
    expect(nb.rejected).toHaveLength(3);
  });
  it('search ranks the workflow sources first', () => {
    expect(searchSources(lab51.definition.exampleInput.request as string).map((s) => s.sourceId)).toEqual(['S1', 'S2', 'S3']);
  });
});

describe('lab-51 Two collaborating agents (DoD)', () => {
  it('shows messages, intermediate outputs and the final result', async () => {
    const { output, validation, events } = await run();
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.stepPath).toEqual(['research', 'draft', 'review-and-revise', 'publish']);
    expect(AgentConversationSchema.safeParse(output.agentConversation).success).toBe(true);
    expect(output.agentConversation.messages.map((m) => `${m.from}>${m.to}:${m.kind}`)).toEqual([
      'orchestrator>researcher:task',
      'researcher>editor:notes',
      'editor>researcher:draft',
      'researcher>editor:review',
      'editor>orchestrator:final',
    ]);
    expect(events.some((e) => e.type === 'tool-finish' && e.toolName === 'record_finding')).toBe(true);
    expect(output.final).toEqual(lab51Definition.expectedOutput.example.final);
  });

  it('a planted slip is caught, revised and never published', async () => {
    const { output, validation } = await run({ editorSlip: 'uncited-claim' });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.agentConversation.messages.map((m) => m.kind)).toEqual(['task', 'notes', 'draft', 'review', 'revision', 'review', 'final']);
    expect(output.agentConversation.messages[2]!.injected).toBe(true);
    expect(output.reviews[0]!.structuralIssues.map((i) => i.kind)).toEqual(['uncited']);
    expect(output.final!.text).not.toContain('spacecraft');
  });

  it('an exhausted loop escalates to a human', async () => {
    const { output, validation } = await run({ editorSlip: 'unknown-citation', maxRevisions: 0 });
    expect(validation.passed, JSON.stringify(validation.checks)).toBe(true);
    expect(output.agentConversation.outcome.status).toBe('needs-human');
    expect(output.agentConversation.messages.at(-1)).toMatchObject({ from: 'orchestrator', to: 'human', kind: 'escalation' });
  });

  it('fails final-grounded when an unapproved draft is published', async () => {
    const { output } = await run({ editorSlip: 'uncited-claim' });
    const tampered = { ...output, final: { ...output.final!, text: output.drafts[0]!.text } };
    const v = lab51.validate!(tampered, lab51.definition.exampleInput as never, { events: [], mode: 'offline' }) as Result['validation'];
    expect(v.checks.find((c) => c.id === 'final-grounded')?.passed).toBe(false);
  });
});
