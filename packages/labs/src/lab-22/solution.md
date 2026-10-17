# Solution: an owner-checked thread API

```ts
const NOT_FOUND = { ok: false, code: 'NOT_FOUND', message: 'Thread not found' } as const;

async function ownedThread(memory: Memory, userId: string, threadId: string) {
  const thread = await memory.getThreadById({ threadId }); // returns ANY thread: check the owner yourself
  return thread && thread.resourceId === userId ? thread : null;
}

app.get('/threads/:id/messages', async (req, res) => {
  const userId = req.session.userId; // from auth, never from the body
  if (!(await ownedThread(memory, userId, req.params.id))) return res.status(404).json(NOT_FOUND);
  const { messages } = await memory.recall({ threadId: req.params.id, resourceId: userId });
  res.json({ messages });
});

app.post('/threads', async (req, res) => {
  const thread = await memory.createThread({ resourceId: req.session.userId, title: req.body.title }); // UUID id
  res.status(201).json({ id: thread.id });
});

app.post('/threads/:id/reset', async (req, res) => {
  const userId = req.session.userId;
  if (!(await ownedThread(memory, userId, req.params.id))) return res.status(404).json(NOT_FOUND);
  const { messages } = await memory.recall({ threadId: req.params.id, resourceId: userId, perPage: false });
  await memory.deleteMessages(messages.map((m) => m.id)); // keeps the thread, title and owner
  res.json({ removed: messages.length });
});
```

Test: as user B, call every endpoint on user A's thread and on a random UUID. Assert that the two responses are identical 404s, and that A's history is unchanged.

**Challenge:** store grants as `thread.metadata.readers = ['user-b']`, or better, in a table you control. In `ownedThread`, return `{ thread, access: 'owner' | 'reader' }`. Allow history for readers. Allow send, reset and delete only for the owner. Revoking the grant returns the same 404 as before.
