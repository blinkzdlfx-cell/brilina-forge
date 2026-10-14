# Brilina Forge — Agent Handoff

Read [README](../README.md), [Roadmap](ROADMAP.md), [Current State](CURRENT_STATE_AND_CONTINUATION.md), [Architecture](ARCHITECTURE.md), [Requirements](REQUIREMENTS.md), [AI Collaboration](AI_COLLABORATION.md), and [Next Kilo Prompt](NEXT_KILO_PROMPT.md) before implementation.

## Product and boundaries

Brilina Forge is a private GitHub-centered AI coding workspace. GitHub is canonical for source code. Neon Postgres stores Forge application state. The production API and React static site are hosted by a native Cloudflare Worker.

- Keep the native Worker runtime; do not add new product behavior to legacy Fastify `src/server.ts`.
- Keep Neon; do not migrate to D1 in this work.
- Use a provider-neutral Agent Controller and typed, authorized, audited tools.
- Do not send the whole repository to the model by default.
- No shell execution on the Worker and no browser terminal.
- The local Node.js companion is Phase 3 and is not required for Phase 1.
- Do not create a new branch unless the owner explicitly asks. Preserve local changes.
- Never claim a feature is verified unless the relevant test or live action actually ran.

## Current priority: Phase 1

Make the existing web UI capable of a real AI coding task through GitHub:
1. Verify GitHub sign-in, repository and branch selection, conversation persistence, and one real provider.
2. Add controlled GitHub file create/update tools using current blob SHAs.
3. Scope writes to the conversation's repository and selected work branch.
4. Handle stale SHA conflicts, validate paths and bound inputs/outputs.
5. Read back changed files, produce a diff, and expose branch/commit details in the UI.
6. Audit tool requests/results and report failures honestly.
7. Verify one real end-to-end change before moving to Phase 2.

The currently inspected tool registry includes GitHub read tools, but a complete registered write/commit coding workflow was not found in the inspected set. Confirm this against the latest source before implementation.

## Known risks to keep visible

- The current-state ledger identifies run execution tied to an open SSE request; recovery and reconnect behavior require testing.
- Device identity includes isolate-local state and must not be relied on for durable companion identity.
- Approval-required tools currently do not implement a full persisted pause/resume flow.
- Companion Worker/database code is partial scaffolding, not a complete local executable.
- Run ID and conversation ID must remain distinct.
- Live OAuth, provider access, deployed run behavior, and browser acceptance must be verified explicitly.

## Required increment report

Before coding, report one goal, files to inspect/change, expected behavior, acceptance criteria, tests, risks, and owner decisions. After coding, report branch/SHA, exact diff summary, commands/tests and results, live checks performed, and remaining gaps. Stop after one reviewable increment.

Use `docs/ROADMAP.md` as the phase order and `docs/CURRENT_STATE_AND_CONTINUATION.md` as the evidence-based status ledger.