import { LabDefinitionSchema, type LabDefinition, type LabDefinitionInput } from '@mlp/contracts';

/** Lesson-specific extensions for practical exercises that do not otherwise need a model. */
export const LIVE_CHECKPOINT_QUESTIONS: Readonly<Record<string, string>> = {
  'lab-00': 'Explain how the echo, word count and streamed events demonstrate the input-to-result execution lifecycle.',
  'lab-01':
    'Identify the generated Mastra entry point and agent registration, explain ESM and the server-only API-key boundary, and suggest one safe next change.',
  'lab-02':
    'Explain the UI/API/runtime boundaries established by the inspected project evidence and identify where provider credentials belong.',
  'lab-05':
    'Explain the agent inspection evidence, distinguish recorded Studio data from an actual local probe, and suggest the next Studio debugging action.',
  'lab-36':
    'Explain which ingestion results succeeded or were rejected and propose one safe improvement to the document preparation procedure.',
  'lab-37':
    'Compare the demonstrated chunk boundaries and overlap, and recommend a retrieval-oriented improvement based only on the measured chunks.',
  'lab-46':
    'Explain the observed MCP connection and cleanup lifecycle, including what the local fixture proves and what it cannot prove about a remote deployment.',
  'lab-47':
    'Choose a useful tool-discovery strategy from the observed catalog and explain how input schemas should constrain a later agent call.',
  'lab-48':
    'Explain how the observed MCP resources and prompts can supply context for an agent, distinguishing resources from executable tools.',
  'lab-49':
    'Explain the exposed agent/tool boundary and the observed rejection of unpublished operations; identify one security check for production.',
  'lab-61':
    'Explain which authentication and run-access decisions the recorded HTTP evidence demonstrates and why browser code must not receive provider keys.',
  'lab-62':
    'Explain the cross-learner isolation evidence and why a guessed resource ID must not authorize access to another learner’s records.',
  'lab-66':
    'Explain the SDK request/event and reconnect evidence and identify how contract validation protects the client when an API response drifts.',
};

export function liveCheckpointDefinition<T extends LabDefinitionInput>(
  definition: T,
): Omit<T, 'execution' | 'inputs' | 'guide' | 'sourceFiles' | 'checks'> & LabDefinition {
  if (!LIVE_CHECKPOINT_QUESTIONS[definition.id]) throw new Error(`No live checkpoint question for ${definition.id}`);
  return LabDefinitionSchema.parse({
    ...definition,
    inputs: [
      ...definition.inputs,
      {
        name: 'liveModelId',
        kind: 'text',
        label: 'Live checkpoint model',
        required: false,
        default: 'auto',
        help: 'Only used in Live mode. Use auto for a configured provider, or an enabled provider/model ID. Offline ignores this field.',
        maxLength: 80,
      },
    ],
    expectedOutput: {
      ...definition.expectedOutput,
      description: `${definition.expectedOutput.description} Live also returns liveCheckpoint with the real model’s lesson-specific explanation.`,
    },
    guide: {
      ...definition.guide,
      procedure: [
        ...definition.guide.procedure,
        'Optional: select Live to add a real-provider checkpoint about this exercise’s result. Read the cost/data notice, then inspect liveCheckpoint and the live-checkpoint step.',
      ],
      commonMistakes: [
        ...definition.guide.commonMistakes,
        {
          mistake: 'Assuming the live checkpoint turns recorded examples or a local fixture into a real remote deployment.',
          fix: 'The original exercise keeps its own source labels. Only the extra checkpoint answer comes from the selected real provider.',
        },
      ],
    },
    sourceFiles: [
      ...definition.sourceFiles,
      { path: 'shared/live-checkpoint.ts', title: 'Optional live checkpoint adapter' },
      { path: 'shared/live-checkpoint-definition.ts', title: 'Checkpoint question, input and limits' },
      { path: 'shared/live-checkpoint.md', title: 'Live checkpoint: scope, cost and data' },
    ],
    checks: [
      ...definition.checks,
      { id: 'live-checkpoint', label: 'Live mode completes a real-provider checkpoint (not required Offline)' },
    ],
    execution: {
      ...definition.execution,
      modes: ['offline', 'live'],
      defaultTimeoutMs: Math.max(definition.execution.defaultTimeoutMs, 90_000),
      maxTimeoutMs: Math.min(300_000, Math.max(definition.execution.maxTimeoutMs, 150_000)),
      budget: { ...definition.execution.budget, maxSteps: (definition.execution.budget?.maxSteps ?? 5) + 1, maxTokens: 2048 },
      costNotice: `Offline: ${definition.execution.costNotice} Live additionally sends a bounded, redacted excerpt of this exercise’s result to your configured AI provider for a lesson-specific checkpoint. One model call, up to 2,048 output tokens; provider charges apply. Local/recorded exercise data is not relabeled as external activity.`,
    },
  }) as Omit<T, 'execution' | 'inputs' | 'guide' | 'sourceFiles' | 'checks'> & LabDefinition;
}
