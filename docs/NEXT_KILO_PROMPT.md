# Next Kilo Prompt — Brilina Forge

Copy this prompt into Kilo Code when ready. It is deliberately an inspection/reconciliation prompt first; it does not authorize implementation yet.

---

You are continuing work on Brilina Forge. The project owner is the final decision-maker. Do not start coding, change architecture, or repeat completed work until the owner reviews your report and explicitly approves the next increment.

## Read first

1. `docs/AI_COLLABORATION.md`
2. `docs/CURRENT_STATE_AND_CONTINUATION.md`
3. `docs/AGENT_HANDOFF.md`
4. `docs/ARCHITECTURE.md`
5. `docs/DECISIONS.md`
6. `docs/ROADMAP.md`
7. `docs/NATIVE_WORKER_MIGRATION.md`
8. Relevant tests and source files referenced by those documents.

## First task: inspection only

Inspect the current checked-out branch and report, without modifying files:

1. Current branch, HEAD SHA, and working-tree status. Preserve any uncommitted work.
2. The latest commits and what they actually changed.
3. Which behavior is implemented in code, which is covered by automated tests, and which has been verified live. Do not treat documentation claims or historic test counts as proof.
4. Conflicts between documentation and code.
5. Build/type/test commands available in `package.json`; run them if dependencies/environment permit and report exact commands and output. Do not claim a command passed unless it ran.
6. Review the known issues in `docs/CURRENT_STATE_AND_CONTINUATION.md`, confirming, rejecting, or qualifying each with file paths and evidence.
7. Identify the single safest next implementation increment, its scope, acceptance criteria, tests, risks, and any decisions that need owner approval.

## Required constraints

- Production API is the native Cloudflare Worker in `worker/index.ts` and `worker/api.ts`. Do not add new application behavior to legacy Fastify files.
- Keep Neon Postgres. Do not migrate to D1.
- GitHub remains canonical for source code.
- No shell execution on the Worker/server and no browser terminal. A local Node.js companion is a separate component and is not considered complete merely because Worker routes exist.
- Do not silently change auth, database schema, permissions, command policy, execution boundaries, or run lifecycle architecture.
- Do not add mock data to make a flow look complete.
- Do not rewrite/recreate features already implemented. Verify first.
- Do not edit documentation or code during this first inspection task. Return the report and wait.

## Report format

- **Repository checkpoint:** branch, SHA, working tree
- **Latest changes:** commit-by-commit summary
- **Implemented and tested:** evidence and exact tests
- **Implemented but unverified:** what is missing
- **Not implemented / partial**
- **Confirmed documentation conflicts**
- **Known issue review:** confirmed / rejected / needs local verification
- **Recommended next small increment:** files, behavior, tests, acceptance criteria
- **Owner decisions required**
- **Exact commands run and results**

Stop after the report. Wait for the owner to share the report with ChatGPT and approve the next action.
