# Solution: schema working memory with validated updates

```ts
const Preferences = z
  .object({
    homeAirport: z.string().regex(/^[A-Z]{3}$/).optional(),
    seat: z.enum(['window', 'aisle']).optional(),
    dietary: z.array(z.enum(['vegetarian', 'vegan', 'gluten-free'])).max(3).optional(),
  })
  .strict();

export const memory = new Memory({
  storage: new LibSQLStore({ id: 'app', url: 'file:./memory.db' }),
  options: { workingMemory: { enabled: true, scope: 'resource', schema: Preferences } },
});
// The agent now has an updateWorkingMemory tool whose input is validated against Preferences.
```

The settings endpoint validates, merges and validates again, because `updateWorkingMemory` stores any string:

```ts
app.patch('/me/preferences', async (req, res) => {
  const ids = { threadId: 'settings', resourceId: req.session.userId };
  const patch = Preferences.partial().strict().safeParse(req.body);
  if (!patch.success) return res.status(422).json({ errors: patch.error.issues });
  const current = Preferences.safeParse(JSON.parse((await memory.getWorkingMemory(ids)) ?? '{}'));
  const merged = Preferences.safeParse({ ...(current.success ? current.data : {}), ...patch.data });
  if (!merged.success) return res.status(422).json({ errors: merged.error.issues });
  await memory.updateWorkingMemory({ ...ids, workingMemory: JSON.stringify(merged.data) });
  res.json(merged.data);
});
```

Test: set the seat in thread A, start thread B for the same resource, and assert the agent's system prompt or answer uses the seat. Then PATCH `{ seat: 'roof' }` and assert a 422 with the stored seat unchanged.

**Challenge:** to forget a field, write the profile without it. Through the API, accept `{ dietary: null }` in the patch, delete the key from the merged object and validate. Through the agent, the tool's instructions ask it to send the full record, so it can omit `dietary`. Assert that the other fields are unchanged and the result still validates.
