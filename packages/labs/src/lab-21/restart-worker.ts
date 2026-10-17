/**
 * Real-restart check, run as its own Node process (see lab21.restart.test.ts):
 *   node --import tsx restart-worker.ts <dbFile> write   → sends two messages into thread t1, exits
 *   node --import tsx restart-worker.ts <dbFile> read    → a NEW process recalls t1 and answers from it
 * Prints one JSON line on stdout. Offline: uses a scripted model, so no provider is called.
 */
import { Agent } from '@mastra/core/agent';
import { openMemory, ScriptedLanguageModel } from '@mlp/mastra-runtime';

const [file, phase] = process.argv.slice(2);
if (!file || (phase !== 'write' && phase !== 'read')) {
  console.error('usage: restart-worker.ts <dbFile> write|read');
  process.exit(2);
}

const thread = { thread: 't1', resource: 'learner' };
const opened = await openMemory(file, { lastMessages: 20 });
let seenUserMessages: string[] = [];
const model = new ScriptedLanguageModel({
  script: (v) => {
    seenUserMessages = v.userMessages;
    return { text: `I can see ${v.userMessages.length} message(s) from you.` };
  },
});
const agent = new Agent({
  id: 'restart-agent',
  name: 'Restart Agent',
  instructions: 'Answer briefly.',
  model,
  memory: opened.memory,
});

try {
  if (phase === 'write') {
    for (const text of ['My name is Ana.', 'I prefer trains.']) await agent.generate(text, { memory: thread });
    console.log(JSON.stringify({ pid: process.pid, phase, wrote: 2 }));
  } else {
    const before = await opened.memory.recall({ threadId: 't1', resourceId: 'learner' });
    const answer = await agent.generate('What do you remember?', { memory: thread });
    console.log(
      JSON.stringify({
        pid: process.pid,
        phase,
        recalled: before.messages.map((m) => ({ role: m.role, createdAt: m.createdAt })),
        recalledUserTexts: before.messages
          .filter((m) => m.role === 'user')
          .map((m) => m.content.parts.map((p) => (p.type === 'text' ? p.text : '')).join('')),
        modelSaw: seenUserMessages,
        answer: answer.text,
      }),
    );
  }
} finally {
  await opened.close();
}
