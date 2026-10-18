# Solution: hybrid search with explained Reciprocal Rank Fusion

```ts
const keyword = rank(bm25(passages, question)); // exact terms; identifiers like E-5003 kept whole
const vector = rank(await cosineScores(embedder, passages, question), 0.25); // paraphrases; minimum cosine

const fused = ids
  .map((id) => {
    const a = keyword.get(id)?.rank ? 1 / (60 + keyword.get(id)!.rank!) : 0;
    const b = vector.get(id)?.rank ? 1 / (60 + vector.get(id)!.rank!) : 0;
    return { id, fused: a + b, explanation: `rrf = ${a ? `1/(60+${keyword.get(id)!.rank})` : 0} + ${b ? `1/(60+${vector.get(id)!.rank})` : 0}` };
  })
  .filter((h) => h.fused > 0)
  .sort((x, y) => y.fused - x.fused || x.id.localeCompare(y.id)); // deterministic ties
```

Tests to write:
- pin `fused` for fixed rankings, and check that a tie is broken by id;
- a paraphrase that BM25 misses and fusion fixes;
- an exact code that vector-only misranks and fusion fixes;
- the explanation's arithmetic recomputes to the shown score.

**Challenge:** weighted RRF is `w_kw/(k + r_kw) + w_v/(k + r_v)`. Choose the weights on a held-out question set, maximising top-1 accuracy, rather than by hand, and report them with the accuracy they achieved.
