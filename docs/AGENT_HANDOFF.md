# Brilina Forge — Agent Handoff

Read [AI Collaboration](AI_COLLABORATION.md), [Current State and Continuation Plan](CURRENT_STATE_AND_CONTINUATION.md), [Architecture](ARCHITECTURE.md), [Decisions](DECISIONS.md), and [Roadmap](ROADMAP.md) before changing code. If this document conflicts with those current references or the checked-out source, inspect and reconcile; do not guess.

## Product and ownership

Brilina Forge is a private AI-assisted development workspace. GitHub is canonical for source code. Neon Postgres stores Forge application state. The production API is a native Cloudflare Worker serving the React app through Workers Static Assets. The browser is the interface, not a shell.

Accepted boundaries:
- Do not add new product behavior to legacy Fastify routes in `src/server.ts`.
- Keep Neon; do not migrate to D1 in this work.
- Keep provider calls behind the provider-neutral AI adapter and tool execution behind the typed controller.
- Do not send the entire repository to the model by default.
- Do not run shell commands on the Worker or add a browser terminal.
- A local Node.js companion is a separate future component. Worker routes and database scaffolding do not mean the companion is complete.
- Never make silent changes to auth, database schema, permissions, command policy or execution architecture.

## Current status

Use [Current State and Continuation Plan](CURRENT_STATE_AND_CONTINUATION.md) as the detailed status ledger. At the time it was reconciled against `main` commit `c9d4c6c1f1fdd4e719f1291c34b4f6a9917c88f4` on 2026-10-14:

- Native Worker routes and React static-asset wiring exist in code.
- GitHub, Neon persistence, controller, deterministic provider and OpenAI-compatible provider code exist.
- Real GitHub OAuth, real provider access, deployed Worker behavior and browser acceptance have not been independently verified in this review.
- The Worker run SSE route claims/executes a run while the stream remains open. Recovery/disconnect guarantees require focused verification.
- Device IDs are assigned using an in-memory map, which is not reliable across Worker isolates.
- Approval-required controller tools are rejected; no complete approve/resume flow exists.
- Companion work routes and persistence are partial scaffolding; no complete local companion application has been verified.
- ChatGPT did not run the project build/tests in this review. Historic test counts are not current verification.

Do not copy old status tables from earlier revisions of this document. Update the current-state ledger when a finding is verified or a checkpoint is pushed.

## Source areas

- `worker/index.ts`: Worker entry point and static assets.
- `worker/api.ts`: Worker API, auth, GitHub, conversations, runs, SSE and companion-related routes.
- `src/agent/`: typed controller, context, policy and tools.
- `src/ai/`: provider adapters and retry logic.
- `src/db/`: Neon persistence repositories.
- `src/github/`: GitHub transport and service abstraction.
- `web/src/`: React UI.
- `db/migrations/`: database schema changes.
- `docs/NEXT_KILO_PROMPT.md`: reusable prompt for the next Kilo session.

Inspect the current tree and the exact relevant source before assuming a file is active or a behavior is complete.

## Required work protocol

1. Inspect the branch, HEAD SHA, and working tree. Preserve local changes.
2. Read the current-state document and relevant source/tests.
3. Before implementation, propose one small increment with goal, affected files, acceptance criteria, tests, risks and any owner decisions.
4. Do not repeat completed work or silently alter architecture.
5. Implement only after approval. Add/adjust tests for behavior changed.
6. Run exact checks and report the actual command/output. If not run, say so.
7. Commit and push a small checkpoint.
8. Report branch, SHA, summary, tests/results, known gaps and next recommendation; pause for review.

Kilo's first action after a context reset is inspection and reporting only. It must not edit code until the owner approves a specific increment.
