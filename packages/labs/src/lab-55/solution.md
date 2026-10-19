# Solution: a research team with evidence, flags and approval

```ts
import { Mastra } from '@mastra/core';
import { createStep, createWorkflow } from '@mastra/core/workflows';

const research = createStep({
  id: 'research', inputSchema: Item, outputSchema: Findings,
  execute: async ({ inputData }) => {
    const notebook = new Notebook(); // one per iteration: concurrent researchers never share state
    const researcher = new Agent({ id: `researcher-${inputData.index}`, model, instructions, tools: researcherTools(notebook) });
    await researcher.generate(`Research request: ${inputData.subQuestion}`, { maxSteps: 6 });
    return { ...inputData, notes: notebook.notes }; // record_finding accepted only verbatim quotes
  },
});

const approve = createStep({
  id: 'approve', inputSchema: Checked, outputSchema: Approved,
  suspendSchema: z.object({ supported: z.number(), flagged: z.number() }),
  resumeSchema: z.object({ decision: z.enum(['approve', 'reject']), reviewer: z.string() }),
  execute: async ({ inputData, resumeData, suspend }) =>
    resumeData ? { ...inputData, decision: resumeData } : suspend(countClaims(inputData.claims)),
});

const wf = createWorkflow({ id: 'research-team', inputSchema: Question, outputSchema: Final })
  .then(plan).foreach(research, { concurrency: 2 }).then(pool)
  .then(synthesize).then(factCheck) // flags = fact-checker issues ∪ code checks (uncited, unknown citation)
  .then(approve).then(publish) // publish only supported claims, each with { quote, quoteStart, quoteEnd }
  .commit();

const mastra = new Mastra({ workflows: { wf } }); // resume needs the stored snapshot
const run = await mastra.getWorkflow('wf').createRun();
await run.start({ inputData: { question } }); // → suspended
await run.resume({ step: 'approve', resumeData: { decision: 'approve', reviewer: 'editor' } });
```
