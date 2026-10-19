/** A scoring rubric: the question, its expected output, and how an answer is judged against it. */
export interface Rubric {
  id: string;
  question: string;
  /** The expected output: a reference answer that must score 1 against this rubric. */
  reference: string;
  keyPoints: { id: string; label: string; aliases: string[] }[];
  /** Words that make a sentence on topic (stemmed like the answer). */
  topicTerms: string[];
  /** Known-wrong claims; each one found costs a penalty. */
  forbidden: { id: string; label: string; aliases: string[] }[];
  maxWords: number;
  weights: { completeness: number; relevance: number };
  penalties: { forbidden: number; overLength: number };
  passThreshold: number;
}

const base = {
  weights: { completeness: 0.6, relevance: 0.4 },
  penalties: { forbidden: 0.35, overLength: 0.1 },
  passThreshold: 0.7,
  maxWords: 120,
};

export const RUBRICS: Record<string, Rubric> = {
  'workflow-steps': {
    ...base,
    id: 'workflow-steps',
    question: 'How does a Mastra workflow run its steps?',
    reference:
      'A Mastra workflow runs its steps in a fixed, explicit order that you define in code. Each step declares an input schema, an output schema and an execute function. With then, the output of one step becomes the input of the next step.',
    keyPoints: [
      {
        id: 'order',
        label: 'Steps run in a fixed order defined in code',
        aliases: ['fixed order', 'explicit order', 'in order', 'one after another', 'in sequence', 'sequential'],
      },
      { id: 'schemas', label: 'Each step has input and output schemas', aliases: ['input schema', 'output schema'] },
      {
        id: 'chaining',
        label: 'then passes one step’s output to the next step',
        aliases: ['output of one step', 'becomes the input', 'to the next step', 'of the next step'],
      },
    ],
    topicTerms: [
      'workflow',
      'step',
      'schema',
      'then',
      'run',
      'execute',
      'order',
      'input',
      'output',
      'mastra',
      'createstep',
      'createworkflow',
    ],
    forbidden: [
      { id: 'random-order', label: 'Steps run in a random order', aliases: ['random order', 'any order', 'arbitrary order'] },
      { id: 'gpu', label: 'Steps run on GPUs', aliases: ['gpu'] },
    ],
  },
  'suspend-resume': {
    ...base,
    id: 'suspend-resume',
    question: 'How can a Mastra workflow pause for a human?',
    reference:
      'A step can call suspend to pause the workflow run until a human provides data. The run is resumed with resume, and the suspended step receives the resume data. The workflow is registered on Mastra with storage, so the snapshot can be resumed.',
    keyPoints: [
      { id: 'suspend', label: 'A step calls suspend to pause the run', aliases: ['suspend'] },
      { id: 'resume', label: 'The run continues with resume', aliases: ['resume', 'resumed'] },
      {
        id: 'resume-data',
        label: 'The suspended step receives the human’s data',
        aliases: ['resume data', 'resumedata', 'provides data', 'receives the data'],
      },
      { id: 'storage', label: 'A stored snapshot makes the resume possible', aliases: ['storage', 'snapshot'] },
    ],
    topicTerms: [
      'suspend',
      'resume',
      'pause',
      'human',
      'workflow',
      'step',
      'run',
      'snapshot',
      'storage',
      'approval',
      'data',
      'mastra',
    ],
    forbidden: [
      {
        id: 'busy-wait',
        label: 'Pausing needs a busy wait or polling loop',
        aliases: ['busy wait', 'polling loop', 'while true'],
      },
    ],
  },
  'tool-validation': {
    ...base,
    id: 'tool-validation',
    question: 'How does Mastra validate tool inputs?',
    reference:
      'A tool is created with createTool and has an input schema. Mastra validates the input against the schema before execute runs. Invalid input returns a validation error to the model instead of running execute.',
    keyPoints: [
      { id: 'create-tool', label: 'Tools are created with createTool', aliases: ['createtool', 'create tool'] },
      { id: 'input-schema', label: 'A tool declares an input schema', aliases: ['input schema'] },
      {
        id: 'before-execute',
        label: 'Validation happens before execute runs',
        aliases: ['before execute', 'before the tool runs'],
      },
      {
        id: 'error-to-model',
        label: 'Invalid input becomes a validation error for the model',
        aliases: ['validation error', 'error to the model'],
      },
    ],
    topicTerms: ['tool', 'validate', 'validation', 'schema', 'input', 'execute', 'error', 'zod', 'mastra', 'createtool', 'model'],
    forbidden: [
      { id: 'after-execute', label: 'Validation happens after execute', aliases: ['after execute', 'after the tool runs'] },
    ],
  },
};
export const RUBRIC_IDS = Object.keys(RUBRICS) as [string, ...string[]];
