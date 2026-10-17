# Solution: exclusive branch predicates with a derived fallback

```ts
const ROUTES = [
  { id: 'page-oncall', min: 4, max: 4 },
  { id: 'priority-queue', min: 3, max: 3 },
  { id: 'standard-queue', min: 1, max: 2 },
];
const matches = (r, s) => s >= r.min && s <= r.max;
const unmatched = (s) => !ROUTES.some((r) => matches(r, s)); // the fallback can never overlap

createWorkflow({ id: 'routing', inputSchema: Ticket, outputSchema: Routing })
  .then(assess)
  .branch([
    ...ROUTES.map((r) => [async ({ inputData }) => matches(r, inputData.severity), routeStep(r)]),
    [async ({ inputData }) => unmatched(inputData.severity), manualReview],
  ])
  .then(finalize) // receives { <stepId>: output } for every branch that ran, or {}
  .commit();
```

`finalize` counts the keys: one is a routing record; zero is `UNROUTED`; more than one is `AMBIGUOUS_ROUTE`.

Prove exclusivity over the whole domain:

```ts
for (let s = 0; s <= 4; s++) {
  const n = ROUTES.filter((r) => matches(r, s)).length + (unmatched(s) ? 1 : 0);
  expect(n).toBe(1);
}
```

**Challenge:** a security route that ignores severity overlaps with every severity route. One fix is to make it the first step of the decision: add `isBreach` to the assessment and AND every severity predicate with `!isBreach`. Extend the test so it loops over both `isBreach` values.
