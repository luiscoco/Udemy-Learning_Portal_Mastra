import { Mastra } from '@mastra/core/mastra';
import { assistantAgent } from './agents/assistant-agent';

// The Mastra instance is the project's entry point: `mastra dev` and `mastra build` look for it here.
export const mastra = new Mastra({
  agents: { assistantAgent },
});
