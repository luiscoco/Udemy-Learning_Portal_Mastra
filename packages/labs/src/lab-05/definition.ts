import { liveCheckpointDefinition } from '../shared/live-checkpoint-definition.js';
import type { LabDefinitionInput } from '@mlp/contracts';

export const lab05Definition = liveCheckpointDefinition({
  id: 'lab-05',
  number: 5,
  title: 'Inspect agent in Studio',
  moduleId: 'module-01',
  summary: 'Start Mastra Studio for a real project, open it in its own tab, and let the server confirm Studio sees your agent.',
  concept:
    'Mastra Studio is the developer inspector that ships with the mastra CLI: running `mastra dev` in a project starts a local server, usually on http://localhost:4111, with Studio in the browser and an HTTP API under /api. ' +
    'Studio loads the Mastra instance from src/mastra/index.ts, so every agent, tool and workflow you registered appears there automatically. ' +
    'You can chat with an agent, see its instructions and model, and inspect traces of each step, which is the fastest way to debug while you build. ' +
    'Studio has full access to your project and the API keys in your .env, so it is a private tool for your machine, not something to embed in another website. ' +
    'This learning platform is different: it runs curated lab code on its own server and only shows you selected events, checks and progress. ' +
    "In this lab you start Studio for the course project, open it in a separate browser tab, and ask this platform's server to call Studio's /api/agents endpoint on localhost to confirm your agent is registered. " +
    'If Studio is not running yet, use the recorded response to learn the shape of the data, then switch to the live local probe.',
  objectives: [
    'Start Mastra Studio with mastra dev and open it at its local URL',
    'Find an agent, its instructions and its model in Studio',
    'Explain how Studio differs from this learning platform and why it is never embedded',
    'Read the /api/agents response the Studio server exposes',
  ],
  prerequisites: ['lab-04'],
  inputs: [
    {
      kind: 'select',
      name: 'target',
      label: 'What to inspect',
      options: [
        { value: 'recorded', label: 'Recorded Studio response (no setup needed)' },
        { value: 'local', label: 'My local Studio (run npm run studio first)' },
      ],
      default: 'recorded',
      required: true,
    },
    {
      kind: 'text',
      name: 'studioUrl',
      label: 'Studio URL',
      help: 'Only localhost / 127.0.0.1 is allowed. Studio defaults to port 4111.',
      maxLength: 100,
      default: 'http://localhost:4111',
      required: true,
    },
    {
      kind: 'text',
      name: 'agentId',
      label: 'Agent id to look for',
      minLength: 2,
      maxLength: 40,
      default: 'assistant-agent',
      required: true,
    },
  ],
  exampleInput: { target: 'recorded', studioUrl: 'http://localhost:4111', agentId: 'assistant-agent' },
  expectedOutput: {
    description:
      'Two workflow steps (probe-studio, inspect-agent), the agent list from /api/agents, the selected agent’s model and instructions, a launch link and a Studio vs LMS comparison.',
    example: {
      target: 'recorded',
      studioUrl: 'http://localhost:4111',
      launchLink: 'http://localhost:4111/agents/assistant-agent',
      reachable: true,
      agent: { id: 'assistant-agent', name: 'Assistant', provider: 'openai', modelId: 'gpt-5-mini', tools: [] },
    },
  },
  guide: {
    procedure: [
      "Run the lab with the recorded target to see what Studio's /api/agents returns.",
      'In a terminal at the repository root run: npm run studio  (it runs mastra dev in examples/course-project).',
      'Wait for "Studio: http://localhost:4111", then open that address in a NEW browser tab.',
      'In Studio, open Agents → Assistant. Find its instructions and model, and send it a message (live chat needs OPENAI_API_KEY in examples/course-project/.env).',
      'Back here, switch the target to "My local Studio" and run again: the server now calls your Studio on localhost.',
      'Change the agent id to "missing-agent" and run once more to see the not-found check.',
      'Stop Studio with Ctrl+C when you are done.',
    ],
    prediction: 'If Studio is not running, will the lab crash, fail, or finish with a failed check?',
    hints: [
      { level: 1, text: 'The lab treats "nothing listening" as information, not as a crash.' },
      { level: 2, text: 'Connection refused becomes a failed "Studio API answered" check with instructions to start Studio.' },
      { level: 3, text: 'The run completes; the checks fail with a hint to run "npm run studio" and try again.' },
    ],
    commonMistakes: [
      {
        mistake: 'Embedding Studio in an iframe inside another app.',
        fix: 'Open Studio in its own tab; it is a privileged local developer tool.',
      },
      {
        mistake: 'Starting mastra dev in a folder without src/mastra/index.ts.',
        fix: 'Run it in the project root that contains src/mastra/index.ts (or use npm run studio).',
      },
      {
        mistake: 'Expecting chat to work without a provider key.',
        fix: 'Studio calls the real model: put the key in the project .env.',
      },
      { mistake: 'Exposing port 4111 to the network.', fix: 'Keep Studio on localhost; it has full access to your project.' },
    ],
    challenge: {
      prompt:
        'Add a second agent to examples/course-project, keep Studio running, and confirm with this lab (target local) that Studio picked it up without a restart.',
      successCriteria: ['The new agent appears in the agents list', 'agent-found passes for its id'],
    },
    diagram: {
      kind: 'ascii',
      caption: 'Studio runs next to your project; this platform only probes it on localhost',
      source:
        'your terminal:  npm run studio  →  mastra dev  →  http://localhost:4111   (Studio UI + /api)\nyour browser:   new tab → http://localhost:4111   (never inside this site)\nthis platform:  API server → GET http://localhost:4111/api/agents → checks',
    },
  },
  quiz: [
    {
      id: 'q1',
      prompt: 'Which command starts Mastra Studio for a project?',
      choices: ['mastra build', 'mastra dev', 'npm start', 'mastra studio --embed'],
      correctIndex: 1,
      explanation: 'mastra dev starts the local dev server with Studio on port 4111 by default.',
    },
    {
      id: 'q2',
      prompt: 'Why should Studio not be embedded in another web app?',
      choices: [
        'It is too slow',
        'It has privileged access to your project and keys',
        'It only works on Linux',
        'Studio has no UI',
      ],
      correctIndex: 1,
      explanation: 'Studio is a local developer tool with full access; keep it in its own tab on localhost.',
    },
    {
      id: 'q3',
      prompt: 'How does Studio know about your agents?',
      choices: [
        'You upload them',
        'It reads the Mastra instance exported from src/mastra/index.ts',
        'It scans node_modules',
        'From .env',
      ],
      correctIndex: 1,
      explanation: 'mastra dev loads your Mastra instance; registered agents appear automatically.',
    },
  ],
  sourceFiles: [
    { path: 'run.ts', title: 'Lab run', description: 'Loopback-only probe of the Studio API.' },
    { path: 'recorded-agents.json', title: 'Recorded /api/agents response' },
  ],
  exercise: {
    instructions:
      'Write a tiny Node script that calls http://localhost:4111/api/agents with a 3-second timeout and prints each agent id with its provider/model. Handle the "Studio not running" case with a friendly message.',
    solutionFile: 'solution.md',
  },
  checks: [
    { id: 'studio-reachable', label: 'Studio API answered' },
    { id: 'agent-found', label: 'Agent is registered in the Studio project' },
    { id: 'agent-config-read', label: 'Studio reports the agent’s model and instructions' },
  ],
  instructorOutline: {
    durationMinutes: 6,
    segments: [
      { title: 'What Studio is', minutes: 1, talkingPoints: ['mastra dev, port 4111', 'Loads src/mastra/index.ts'] },
      {
        title: 'Start and open Studio',
        minutes: 2,
        talkingPoints: ['npm run studio', 'Open in a new tab', 'Agents → Assistant: instructions, model, chat, traces'],
      },
      {
        title: 'Probe from the platform',
        minutes: 1.5,
        talkingPoints: ['Recorded vs local target', 'Loopback-only server probe'],
      },
      { title: 'Studio vs LMS', minutes: 1, talkingPoints: ['Privileged inspector vs curated labs', 'Never embed Studio'] },
      { title: 'Wrap-up module 01', minutes: 0.5, talkingPoints: ['Next module: generation and streaming'] },
    ],
  },
  execution: {
    modes: ['offline'],
    defaultTimeoutMs: 15_000,
    maxTimeoutMs: 30_000,
    budget: { maxToolCalls: 2 },
    costNotice: 'Free: the lab only reads your local Studio API. Chatting in Studio itself uses your provider key.',
  },
  tags: ['studio', 'tooling', 'debugging'],
} satisfies LabDefinitionInput);
