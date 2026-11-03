# L07a — Outgoing secret check

**Module:** 02 Agent Generation and Streaming · **Step 15 of 91** · **OpenSpec change:** `chore-outgoing-secret-check`

Follow-up prompt added from the reference build: a change the platform needed that the original prompts did not ask for. Run it in this position. Paste the copy-ready prompt below as one request to your coding assistant.

Previous: [L07](L07-behavior-and-instruction-variants.md) · Next: [L08](L08-token-streaming.md)

## Copy-ready prompt

Implement platform follow-up L07a — "Outgoing secret check".

Why: from L06 on, live mode uses real provider keys in a gitignored .env file. A key pasted into a test, a log or an example file must never reach the remote repository.

Requirements: add scripts/check-outgoing-secrets.mjs, run before every push (and from npm run verify for the working tree). It compares the diff of unpushed commits with the values in .env, skipping comment lines and very short values, and with common key patterns. It fails without ever printing a matched value. Add a check that .env.example and other example env files contain no real-looking keys. Document in the README: real keys live only in .env; rotate any key that was ever committed.

Definition of done: a test commit containing a fake key value from a temporary .env is refused; normal pushes pass; no key value appears in any output.

First create an OpenSpec change named chore-outgoing-secret-check with proposal, delta specifications, technical design and tasks. Review the current codebase and the installed Mastra version, implement the change, run lint, typecheck, unit/integration and e2e tests, and summarize actual proof of completion and known limitations. Do not change previously completed labs except where this prompt says so.
