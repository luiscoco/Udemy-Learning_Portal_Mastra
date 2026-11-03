import type { WorkflowGraph, WorkflowGraphNode } from '@mlp/contracts';

/**
 * Structural view of Mastra's `workflow.serializedStepGraph` entries (verified with @mastra/core 1.78.0):
 * step, parallel, conditional, foreach, loop, workflow (nested, with serializedStepFlow), sleep, sleepUntil.
 * Only ids and descriptions are read; serialized closures (`fn`) are never used.
 */
type Single = { type: 'step'; step: { id: string; description?: string } } | { type: 'agent'; id: string; description?: string };
type Entry =
  | Single
  | { type: 'parallel'; steps: Single[] }
  | { type: 'conditional'; steps: Single[]; serializedConditions?: { id: string }[] }
  | { type: 'foreach'; step: Single }
  | { type: 'loop'; step: Single; loopType?: string }
  | { type: 'workflow'; id: string; workflowId?: string; description?: string; serializedStepFlow?: Entry[] }
  | { type: 'sleep' | 'sleepUntil'; id: string; description?: string }
  | { type: string; [key: string]: unknown };

const idOf = (s: Single) => (s.type === 'step' ? s.step.id : s.id);
const descOf = (s: Single) => (s.type === 'step' ? s.step.description : s.description);

/** Converts a committed Mastra workflow's serialized step graph into a layered, read-only DAG. */
export function toWorkflowGraph(workflow: { id: string; serializedStepGraph: unknown[] }, title = workflow.id): WorkflowGraph {
  const nodes: WorkflowGraphNode[] = [];
  const edges: WorkflowGraph['edges'] = [];
  const add = (n: WorkflowGraphNode) => {
    if (!nodes.some((x) => x.id === n.id))
      nodes.push({ ...n, ...(n.description ? { description: n.description.slice(0, 500) } : {}) });
  };
  const link = (from: string[], to: string, kind: 'next' | 'branch' = 'next', label?: string) => {
    for (const f of from) edges.push({ from: f, to, kind, ...(label ? { label } : {}) });
  };

  /** Walks entries from `layer`; returns [next free layer, frontier node ids]. */
  function walk(
    entries: Entry[],
    prefix: string,
    group: string | undefined,
    layer: number,
    frontier: string[],
  ): [number, string[]] {
    for (const entry of entries) {
      const base = { ...(group ? { group } : {}) };
      switch (entry.type) {
        case 'step':
        case 'agent': {
          const s = entry as Single;
          const id = prefix + idOf(s);
          add({ id, label: idOf(s), kind: 'step', layer, lane: 0, ...base, description: descOf(s) });
          link(frontier, id);
          frontier = [id];
          layer += 1;
          break;
        }
        case 'parallel':
        case 'conditional': {
          const e = entry as { type: 'parallel' | 'conditional'; steps: Single[]; serializedConditions?: { id: string }[] };
          const ids = e.steps.map((s, lane) => {
            const id = prefix + idOf(s);
            add({
              id,
              label: idOf(s),
              kind: e.type === 'parallel' ? 'parallel' : 'branch',
              layer,
              lane,
              ...base,
              description: descOf(s),
            });
            if (e.type === 'conditional')
              link(frontier, id, 'branch', e.serializedConditions?.[lane]?.id.replace(/-condition$/, ''));
            else link(frontier, id);
            return id;
          });
          frontier = ids;
          layer += 1;
          break;
        }
        case 'foreach':
        case 'loop': {
          const e = entry as { type: 'foreach' | 'loop'; step: Single; loopType?: string };
          const id = prefix + idOf(e.step);
          add({
            id,
            label: e.type === 'loop' ? `${idOf(e.step)} (${e.loopType ?? 'loop'})` : `${idOf(e.step)} (for each)`,
            kind: e.type,
            layer,
            lane: 0,
            ...base,
            description: descOf(e.step),
          });
          link(frontier, id);
          frontier = [id];
          layer += 1;
          break;
        }
        case 'workflow': {
          const e = entry as { id: string; workflowId?: string; description?: string; serializedStepFlow?: Entry[] };
          const id = prefix + e.id;
          add({ id, label: e.workflowId ?? e.id, kind: 'workflow', layer, lane: 0, ...base, description: e.description });
          link(frontier, id);
          [layer, frontier] = walk(e.serializedStepFlow ?? [], `${id}.`, id, layer + 1, [id]);
          break;
        }
        case 'sleep':
        case 'sleepUntil': {
          const e = entry as { id: string; description?: string };
          const id = prefix + e.id;
          add({ id, label: e.id, kind: 'sleep', layer, lane: 0, ...base, description: e.description });
          link(frontier, id);
          frontier = [id];
          layer += 1;
          break;
        }
        default:
          break; // an entry type this version does not know: left out rather than guessed
      }
    }
    return [layer, frontier];
  }

  walk(workflow.serializedStepGraph as Entry[], '', undefined, 0, []);
  return { workflowId: workflow.id, title: title.slice(0, 200), nodes, edges };
}
