# Design

## Decisions

- **Titles are taken verbatim** from the owner's outline (source kept in `.data/prompts/L53-L75.md`).
- **The pending fallback stays.** The "title pending" code path remains for robustness, but no lab or module uses it any more. The catalog test now asserts that every title is confirmed.
- **Two places rely on a locked lab with a confirmed title** (the shell test and the e2e shell spec). They keep working, because later labs remain locked.
