# Solution: two agents behind one workflow

```ts
import { z } from 'zod';
import { Agent } from '@mastra/core/agent';
import { createStep, createWorkflow } from '@mastra/core/workflows';

const researcher = new Agent({ id: 'researcher', name: 'Researcher', model: 'openai/gpt-5-mini', instructions: '…', tools: { search_sources, record_finding } });
const editor = new Agent({ id: 'editor', name: 'Editor', model: 'openai/gpt-5-mini', instructions: 'Use only the notes; cite every sentence [n].' });

const Review = z.object({ approved: z.boolean(), issues: z.array(z.object({ sentence: z.string(), problem: z.string() })) });
const State = z.object({ notes: z.string(), draft: z.string(), revisions: z.number(), approved: z.boolean(), exhausted: z.boolean() });
const MAX_REVISIONS = 2;

const research = createStep({
  id: 'research', inputSchema: z.object({ request: z.string() }), outputSchema: z.object({ notes: z.string() }),
  execute: async ({ inputData }) => {
    await researcher.generate(`Research request: ${inputData.request}`, { maxSteps: 6 });
    return { notes: notebook.format() }; // filled by record_finding, which rejects non-verbatim quotes
  },
});
const draft = createStep({
  id: 'draft', inputSchema: z.object({ notes: z.string() }), outputSchema: State,
  execute: async ({ inputData }) => ({
    notes: inputData.notes,
    draft: (await editor.generate(`NOTES:\n${inputData.notes}`)).text,
    revisions: 0, approved: false, exhausted: false,
  }),
});
const reviewAndRevise = createStep({
  id: 'review-and-revise', inputSchema: State, outputSchema: State,
  execute: async ({ inputData: s }) => {
    const r = await researcher.generate(`NOTES:\n${s.notes}\n\nDRAFT:\n${s.draft}`, { structuredOutput: { schema: Review }, toolChoice: 'none' });
    const issues = [...r.object.issues, ...structuralIssues(s.draft, s.notes)]; // code checks what code can verify
    if (issues.length === 0) return { ...s, approved: true };
    if (s.revisions >= MAX_REVISIONS) return { ...s, exhausted: true };
    const revised = await editor.generate(`Revise. NOTES:\n${s.notes}\n\nDRAFT:\n${s.draft}\n\nISSUES:\n${JSON.stringify(issues)}`);
    return { ...s, draft: revised.text, revisions: s.revisions + 1 };
  },
});

export const workflow = createWorkflow({ id: 'research-editor', inputSchema: z.object({ request: z.string() }), outputSchema: State })
  .then(research)
  .then(draft)
  .dountil(reviewAndRevise, async ({ inputData }) => inputData.approved || inputData.exhausted) // the app's bound
  .commit();
// Publish only when approved; otherwise escalate the remaining issues to a human.
```
