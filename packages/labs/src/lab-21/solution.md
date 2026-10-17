# Solution: durable message history

```ts
import { Agent } from '@mastra/core/agent';
import { Memory } from '@mastra/memory';
import { LibSQLStore } from '@mastra/libsql';

const storage = new LibSQLStore({ id: 'app-memory', url: 'file:./memory.db' });
export const memory = new Memory({ storage, options: { lastMessages: 20 } });

export const assistant = new Agent({
  id: 'travel-assistant',
  name: 'Travel Assistant',
  instructions: 'Use earlier messages to remember the user’s name and preferences.',
  model: 'openai/gpt-5-mini',
  memory,
});

// Every call names the conversation and its owner:
await assistant.generate("Hi, I'm Ana.", { memory: { thread: 'trip-planning', resource: 'user-42' } });

// Inspect it, in order:
const { messages } = await memory.recall({ threadId: 'trip-planning', resourceId: 'user-42' });
```

Prove a real restart with two processes (see `restart-worker.ts` and `lab21.restart.test.ts`):

```ts
await exec(process.execPath, ['--import', 'tsx', 'worker.ts', db, 'write']); // process 1 exits
const { stdout } = await exec(process.execPath, ['--import', 'tsx', 'worker.ts', db, 'read']); // a new process
expect(JSON.parse(stdout).recalledUserTexts).toEqual(['My name is Ana.', 'I prefer trains.']);
```

**Challenge:** export `memory.recall({ threadId, resourceId, perPage: false })`. Keep each message's role, text parts and `createdAt`. You can drop internal ids if the restore creates new ones. To restore, save the messages into a new thread through the memory API, then assert that the role/text/order sequence is identical.
