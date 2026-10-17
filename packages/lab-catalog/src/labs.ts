import type { CatalogLab } from '@mlp/contracts';

export const LABS_PER_MODULE = 5;
export const COURSE_LAB_COUNT = 75;

/**
 * Course lab titles from the course outline. Labs not listed here have a pending title.
 * Never reorder: lab numbers are stable public routes (/labs/lab-XX).
 */
const OUTLINE_TITLES: Record<number, string> = {
  1: 'Create a Mastra project',
  2: 'Explore project architecture',
  3: 'Create and register a first agent',
  4: 'Model and instructions',
  5: 'Inspect agent in Studio',
  6: 'Basic text generation',
  7: 'Behavior and instruction variants',
  8: 'Token streaming',
  9: 'Structured JSON generation',
  10: 'Failures, retries and limits',
  11: 'First custom tool',
  12: 'Tool validation with Zod',
  13: 'Multiple tools',
  14: 'External API tool',
  15: 'Safe tool execution',
  16: 'Dynamic instructions',
  17: 'Request context',
  18: 'Context-aware tools',
  19: 'Execution options',
  20: 'Input and output processing',
  21: 'Persistent message history',
  22: 'Threads and user boundaries',
  23: 'Working memory',
  24: 'Semantic recall',
  25: 'Observational memory',
  26: 'First typed workflow',
  27: 'Sequential steps',
  28: 'Parallel branches',
  29: 'Conditional branching',
  30: 'Foreach processing',
  31: 'Nested workflows',
  32: 'Suspend and resume',
  33: 'Human approval',
  34: 'Long-running reliability',
  35: 'Business process capstone',
  36: 'Document ingestion',
  37: 'Chunking strategies',
  38: 'Embeddings and store',
  39: 'Vector retrieval',
  40: 'RAG question-answering agent',
  41: 'Metadata filters',
  42: 'Hybrid search',
  43: 'Reranking',
  44: 'Citation-aware generation',
  45: 'RAG quality evaluation',
  46: 'Connect MCP server',
  47: 'Discover MCP tools',
  48: 'MCP resources and prompts',
  49: 'Expose Mastra over MCP',
  50: 'Multi-server MCP agent',
  51: 'Two collaborating agents',
  52: 'Agent handoffs',
  53: 'Supervisor pattern',
};

/**
 * Labs whose implementation is registered on the server. Flip a lab here when its
 * OpenSpec change lands (the API test keeps this list and the registry in sync).
 */
export const AVAILABLE_LAB_NUMBERS: ReadonlySet<number> = new Set([
  0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23,
]);

export const labId = (n: number) => `lab-${String(n).padStart(2, '0')}`;
export const moduleIdForLab = (n: number) =>
  n === 0 ? 'module-00' : `module-${String(Math.ceil(n / LABS_PER_MODULE)).padStart(2, '0')}`;

function courseLab(n: number): CatalogLab {
  const title = OUTLINE_TITLES[n];
  return {
    id: labId(n),
    number: n,
    title: title ?? `Lab ${String(n).padStart(2, '0')} — title pending`,
    titleConfirmed: title !== undefined,
    moduleId: moduleIdForLab(n),
    status: AVAILABLE_LAB_NUMBERS.has(n) ? 'available' : 'locked',
    zeroCost: true,
    offline: true,
    prerequisites: [labId(n - 1)],
  };
}

export const LABS: CatalogLab[] = [
  {
    id: 'lab-00',
    number: 0,
    title: 'Dummy Lab 00',
    titleConfirmed: true,
    moduleId: 'module-00',
    status: 'available',
    zeroCost: true,
    offline: true,
    prerequisites: [],
  },
  ...Array.from({ length: COURSE_LAB_COUNT }, (_, i) => courseLab(i + 1)),
];
