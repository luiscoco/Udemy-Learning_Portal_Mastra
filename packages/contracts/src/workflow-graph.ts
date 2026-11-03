import { z } from 'zod';

/** A read-only DAG of a Mastra workflow (L68), laid out in layers (columns) and lanes (rows). */
export const WorkflowGraphNodeSchema = z.object({
  /** The step id the run stream reports (nested workflow steps are prefixed, e.g. "shipping.book"). */
  id: z.string().max(200),
  label: z.string().max(200),
  kind: z.enum(['step', 'parallel', 'branch', 'foreach', 'loop', 'workflow', 'sleep']),
  layer: z.number().int().min(0).max(200),
  lane: z.number().int().min(0).max(50),
  /** The nested workflow a node belongs to. */
  group: z.string().max(200).optional(),
  description: z.string().max(500).optional(),
});
export const WorkflowGraphSchema = z.object({
  workflowId: z.string().max(200),
  title: z.string().max(200),
  nodes: z.array(WorkflowGraphNodeSchema).max(300),
  edges: z
    .array(
      z.object({
        from: z.string().max(200),
        to: z.string().max(200),
        kind: z.enum(['next', 'branch']),
        label: z.string().max(200).optional(),
      }),
    )
    .max(600),
});
export type WorkflowGraph = z.infer<typeof WorkflowGraphSchema>;
export type WorkflowGraphNode = z.infer<typeof WorkflowGraphNodeSchema>;
