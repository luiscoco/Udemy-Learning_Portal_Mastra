import { z } from 'zod';
import { createTool } from '@mastra/core/tools';
import type { RunContext } from '@mlp/lab-engine';
import type { SourcePassage } from '../lab-44/claims.js';
import { search } from './knowledge.js';

export interface Task {
  n: number;
  title: string;
  status: 'waiting' | 'running' | 'done';
}

/**
 * The workspace agent's tools. Task progress is reported as workflow-step events (stepId "task:<n>"), so the
 * browser can tick tasks off live; searchDocs records every passage it returns, the citation guard's ground truth.
 */
export function createWorkspaceTools(o: {
  ctx: RunContext<unknown>;
  passages: SourcePassage[];
  retrieved: Map<string, SourcePassage>;
  tasks: Task[];
}) {
  const emit = (t: Task) =>
    o.ctx.emit({
      type: 'workflow-step',
      stepId: `task:${t.n}`,
      status: t.status === 'done' ? 'success' : t.status === 'running' ? 'running' : 'waiting',
      input: { title: t.title },
    });
  return {
    planTasks: createTool({
      id: 'planTasks',
      description: 'Plan the work for this question as 2 to 5 short tasks, before doing it.',
      inputSchema: z.object({ tasks: z.array(z.string().trim().min(2).max(120)).min(1).max(5) }),
      execute: async ({ tasks }) => {
        o.tasks.splice(
          0,
          o.tasks.length,
          ...tasks.map((title, i) => ({ n: i + 1, title, status: (i === 0 ? 'running' : 'waiting') as Task['status'] })),
        );
        o.tasks.forEach(emit);
        return { planned: o.tasks.map((t) => `${t.n}. ${t.title}`) };
      },
    }),
    completeTask: createTool({
      id: 'completeTask',
      description: 'Mark a planned task as done (by its number).',
      inputSchema: z.object({ n: z.number().int().min(1).max(5) }),
      execute: async ({ n }) => {
        const task = o.tasks.find((t) => t.n === n);
        if (!task) return { ok: false, message: `There is no task ${n}.` };
        task.status = 'done';
        emit(task);
        const next = o.tasks.find((t) => t.status === 'waiting');
        if (next && !o.tasks.some((t) => t.status === 'running')) {
          next.status = 'running';
          emit(next);
        }
        return { ok: true, remaining: o.tasks.filter((t) => t.status !== 'done').length };
      },
    }),
    searchDocs: createTool({
      id: 'searchDocs',
      description: 'Search the learner’s knowledge documents. Returns passages with an id and their exact text.',
      inputSchema: z.object({ query: z.string().trim().min(2).max(300) }),
      execute: async ({ query }) => {
        const hits = search(query, o.passages);
        for (const h of hits) o.retrieved.set(h.id, h);
        return { passages: hits.map((h) => ({ id: h.id, source: h.title, text: h.text })) };
      },
    }),
  };
}
