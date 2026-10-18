# Solution: per-claim citations you can open

```ts
const reply = await agent.generate(
  `Question: ${q}\n\nSources:\n${sources.map((s) => `[${s.id}] ${s.text}`).join('\n')}`,
); // instructions demand {"claims":[{"text","citations":[{"id","quote"}]}]}

const { claims } = JSON.parse(reply.text);
const shown = [];
const blocked = [];
for (const c of claims) {
  const reasons = [];
  const cits = c.citations.flatMap((cit) => {
    const src = sources.find((s) => s.id === cit.id);
    if (!src) return reasons.push('UNKNOWN_SOURCE'), [];
    const span = locateQuote(src.text, cit.quote); // exact span in the ORIGINAL text
    if (!span) return reasons.push('QUOTE_NOT_FOUND'), [];
    return [{ sourceId: src.id, quote: src.text.slice(span.start, span.end), quoteStart: span.start, quoteEnd: span.end }];
  });
  if (!c.citations.length) reasons.push('UNCITED_CLAIM');
  if (numbersIn(c.text).some((n) => !numbersIn(cits.map((x) => x.quote).join(' ')).includes(n))) reasons.push('UNGROUNDED_NUMBER');
  (reasons.length ? blocked : shown).push(reasons.length ? { text: c.text, reasons } : { text: c.text, citations: cits });
}
```

In the UI, render each citation as a button that opens a dialog with the source text. Wrap `text.slice(quoteStart, quoteEnd)` in a `<mark>` element, render everything as text (never as HTML), and return focus to the button when the dialog closes.

**Challenge:** add an entailment judge (a second agent: "does QUOTE support CLAIM? yes/no"). Run it per claim, and use a scripted judge with fixed verdicts in tests. A "no" blocks the claim as `UNSUPPORTED_CLAIM`.
