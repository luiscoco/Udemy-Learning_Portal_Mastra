import { Agent } from '@mastra/core/agent';

export const assistantAgent = new Agent({
  id: 'assistant-agent',
  name: 'Assistant',
  instructions: 'You are a helpful assistant. Answer clearly and concisely.',
  // "provider/model" string resolved by Mastra's model router; the key comes from .env.
  model: 'openai/gpt-5-mini',
});
