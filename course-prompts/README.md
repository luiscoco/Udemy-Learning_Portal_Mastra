# Course prompt pack: build the learning platform from zero

This folder holds every prompt needed to rebuild **mastra-learning-platform**, the platform and all 75 labs, from an empty folder with an AI coding assistant. The platform in this repository is the reference build produced from these prompts.

| File | What it is |
| --- | --- |
| [00-master-rules.md](00-master-rules.md) | The original preamble: stack, how to run, **MASTER RULES** (save as `AGENTS.md`) and the common lab delivery contract. |
| [build-order.md](build-order.md) | All 91 steps in the order to run them. |
| [prompts/](prompts/) | One file per step, each with a copy-ready prompt and links to the previous and next step. |

## What is in the pack

- **79 original prompts**, unchanged: foundation milestones F01–F04 and labs L01–L75.
- **12 follow-up prompts** (`F03a`, `L06a`, `L06b`, `L07a`, `L15a`, `L15b`, `L18a`, `L24a`, `L38a`, `L62a`, `L63a`, `L64a`). These are changes the reference build needed and the original prompts did not ask for. Some are platform capabilities that later labs depend on, such as interactive approvals and run tokens. The others fix defects that only showed up under real use: concurrent vector writes, approximate-search drift, tenant and audit gaps found in review. Each follow-up sits right after the step that needs it. Run it there so later labs build on the corrected platform.

## How to build from zero

1. **Set up an empty folder.** Install Node.js 22.13 or later (CI uses Node 24 LTS) and git.
2. **Save the rules.** Copy the MASTER RULES and Common lab delivery contract sections of [00-master-rules.md](00-master-rules.md) into `AGENTS.md`. If you use Claude Code, also add a `CLAUDE.md` that says "Follow AGENTS.md". If you want the assistant to work without stopping for plan review, add one line saying so (automated approval).
3. **Run each prompt as one request.** Go through [build-order.md](build-order.md) one step at a time, starting with F01. Never paste several prompts at once.
4. **Check each change before you commit it.**
   - Make sure the assistant validated its OpenSpec change before writing code (`npx openspec validate <change> --strict`).
   - Run the checks: `npm run verify` and `npm run test:e2e`. From L06 on, add the optional live tests if you configured provider keys.
   - Archive the change (`npx openspec archive <change> -y`), then commit.
   - If any check failed, do not archive or commit. Fix it first.
5. **Compare with the reference.** Every step has a commit in this repository named after the step, for example `L62: Tenant isolation`. Follow-ups are named `Platform: …`, `Fix: …` or after their change name. Use `git log --oneline` to compare your build with the reference.

## Notes from the reference build

- **Mastra APIs change between versions.** The MASTER RULES require checking the installed `.d.ts` files and version-matched docs before using any API. `docs/COMPATIBILITY.md` in this repository lists every behaviour the reference build verified with Mastra 1.78.0 (`@mastra/core`). Your installed version may differ.
- **Live mode costs money.** Real provider calls need your own API keys in a gitignored `.env`. A ChatGPT or Claude subscription does not include API access. Offline mode is free and deterministic, and every unit and e2e test runs without keys.
- **Keep secrets out of git.** Never commit `.env`. Follow-up L07a adds a check that runs before every push and refuses to push key values.
- **Windows.** If another local project already uses the e2e port, set `E2E_PORT` to a free port. Under heavy test traffic, Windows can run out of ephemeral ports; `docs/COMPATIBILITY.md` lists known issues and how to mitigate them.
- **Release gates.** Follow-up L18a creates `docs/RELEASE-GATES.md`. The platform is a local, single-machine course until those gates are closed, including authentication (L61), tenant isolation (L62/L62a) and durable production persistence (L71–L73). Do not expose it publicly before then.
