# Solution — vowelCounter

Add after the `wordCounter` tool-finish event in `run.ts`:

```ts
const vowels = (input.message.match(/[aeiou]/gi) ?? []).length;
ctx.emit({ type: 'tool-start', toolCallId: 'call-2', toolName: 'vowelCounter', args: { text: input.message } });
ctx.emit({ type: 'tool-finish', toolCallId: 'call-2', toolName: 'vowelCounter', status: 'success', result: { vowels }, durationMs: 0 });
```

Add to `validate`:

```ts
{
  id: 'vowels-counted',
  label: 'vowelCounter reported the vowel count',
  passed: events.some((e) => e.type === 'tool-finish' && e.toolName === 'vowelCounter'),
}
```

Then add `{ id: 'vowels-counted', label: '…' }` to `checks` in `definition.ts` and raise `budget.maxToolCalls` to 2.
