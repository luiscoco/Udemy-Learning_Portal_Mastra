import { describe, expect, it } from 'vitest';
import { tasksOf, workspaceTurnOf } from './AgentWorkspace';

describe('AgentWorkspace helpers', () => {
  it('builds the live task list from task:<n> steps, ignoring other steps', () => {
    const tasks = tasksOf([
      { stepId: 'task:2', status: 'waiting', input: { title: 'Read' } },
      { stepId: 'other', status: 'success' },
      { stepId: 'task:1', status: 'success', input: { title: 'Search' } },
    ]);
    expect(tasks).toEqual([
      { n: 1, title: 'Search', status: 'done' },
      { n: 2, title: 'Read', status: 'waiting' },
    ]);
  });

  it('falls back to the final task list when no steps streamed', () => {
    expect(tasksOf([], [{ n: 1, title: 'Search', status: 'done' }])).toEqual([{ n: 1, title: 'Search', status: 'done' }]);
  });

  it('parses only contract-valid workspace output', () => {
    expect(workspaceTurnOf({ workspace: { threadId: 't', documents: [], messages: [], tasks: [] } })?.threadId).toBe('t');
    expect(workspaceTurnOf({ workspace: { threadId: 1 } })).toBeNull();
    expect(workspaceTurnOf(null)).toBeNull();
  });
});
