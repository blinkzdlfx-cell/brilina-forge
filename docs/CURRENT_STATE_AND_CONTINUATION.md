# Current State and Continuation Plan

**Last documentation reconciliation:** 2026-10-14. This file is the evidence-based status ledger. It records source/document inspection, not proof of a live deployment. Update it with exact commit SHA and test results after each implementation checkpoint.

## Product in plain English

Brilina Forge is a private browser-based AI coding workspace. The user connects GitHub, selects a repository and branch, chats with an AI, and should be able to ask it to inspect and modify source files, verify changes, and report the result.

- **GitHub:** canonical source code, branches, commits, diffs, and pull requests.
- **Cloudflare Worker + Workers Static Assets:** production API and hosted React web app.
- **Neon Postgres:** durable Forge application state such as sessions, conversations, messages, runs, tool audit, usage, companion work, and approvals.
- **AI provider:** reasoning and tool selection through a provider-neutral adapter.
- **Optional local Node.js companion:** future execution of approved commands on the user's computer. It is not required for Phase 1.
- **GitHub Actions:** remote test/build execution and log retrieval for Phase 2.

## Current inspected state

| Area | Evidence from source inspection | Status |
|---|---|---|
| React/Vite UI | `web/` and Worker static asset configuration exist | Implemented in code; browser acceptance not live-verified |
| Native Worker API | `worker/index.ts`, `worker/api.ts` | Implemented in code; production route behavior not independently verified |
| GitHub authentication/service | GitHub OAuth/session modules and `GithubService` exist | Implemented in code; live OAuth not verified |
| Neon persistence | Session, conversation, run, audit, usage and companion repositories exist | Implemented in code; end-to-end database flow not verified |
| Agent Controller | Typed tool registry, authorization, policy and audit code exist | Implemented in code; complete user workflow not verified |
| AI provider | Deterministic model and OpenAI-compatible adapter exist | Adapter code exists; live provider call and tool-calling behavior not verified |
| GitHub read tools | Repository metadata/context, branches, tree, file read, diff | Implemented in code |
| GitHub write tools | No complete registered create/update/commit coding workflow was found in the inspected tool set | **Phase 1 blocker; implement and test** |
| UI-to-agent code change | No verified end-to-end change from chat to GitHub commit | **Not verified; primary Phase 1 target** |
| GitHub Actions repair loop | APIs/workflows may provide a foundation; complete AI-driven diagnose/fix/retest loop not verified | Phase 2 |
| Local companion | Partial Worker/database dispatch scaffolding exists; no complete executable companion verified | Phase 3 |
| Approval/resume | Controller currently rejects approval-required tools rather than persisting and resuming the same pending call | Incomplete; required before risky companion execution |
| Device identity | `worker/api.ts` contains isolate-local device assignment state | Not durable across Worker isolates; fix before relying on device identity |
| Run lifecycle/SSE | A run can be claimed/executed while its SSE response is open | Recovery, disconnect, duplicate subscriber, cancellation and replay guarantees not established |
| Cloudflare diagnostics | No verified end-to-end log-to-source-fix flow | Phase 4 |
| Teams/multiple providers | Architecture can accommodate them; complete team workflow not verified | Phase 5 |

## Immediate priority

**Phase 1: enable real AI coding through GitHub.** Do not continue expanding the companion until a real model can read relevant files, make controlled edits through GitHub, return a reviewable diff/commit, and persist the result.

## Phase 1 implementation checklist

- [ ] Inspect actual working tree and current `main` SHA in Kilo's checkout; preserve local changes.
- [ ] Run available build and test commands; record exact output.
- [ ] Verify GitHub OAuth, repository selection, branch selection, conversation binding, and Neon persistence.
- [ ] Configure one real AI provider and verify a real request with tool calls.
- [ ] Add typed GitHub create/update file tools using current blob SHAs.
- [ ] Add scoped authorization so tools only modify the conversation's selected repository and an explicitly selected work branch.
- [ ] Ensure writes are sequential for each path and handle conflicts safely.
- [ ] Add branch/commit workflow, diff/read-back, audit events, output bounds, and clear error results.
- [ ] Add UI activity and diff/result presentation.
- [ ] Test a small real repository change end to end.
- [ ] Record exact branch, SHA, commands, test results, live verification, and known gaps.

## Known engineering risks to preserve in later phases

1. **Run lifecycle:** current execution is coupled to an open SSE request. Design and test idempotent claims, reconnects, disconnect behavior, cancellation, timeouts, recovery, durable result state, and event replay.
2. **Device identity:** isolate-local maps are not durable identity stores.
3. **Approval:** an approval notification is not an approval/resume implementation. Persist the exact pending tool call, authenticate the decision, audit it, and resume it at most once.
4. **Companion context:** inspect the run ID/conversation ID contract before wiring command execution.
5. **Neon query contracts:** verify driver return shapes, including stale-work timeout counts, with focused tests.
6. **Security:** model output is untrusted input. Validate tool arguments, scope repository writes, protect tokens, redact logs, limit retries and output, and require consent for consequential operations.
7. **Build/test status:** no current local build or test run was performed as part of this documentation update. Historic counts are not current verification.

## Architectural decisions

- Keep the native Cloudflare Worker as production runtime. Do not add new product behavior to legacy Fastify routes.
- Keep Neon Postgres; no D1 migration in this roadmap.
- GitHub remains the source of truth for code.
- Use the existing React UI and backend foundation where possible; do not rebuild them without evidence.
- The Worker does not run shell commands. Local execution belongs in a separate companion.
- Start with one real AI provider. Add other providers only after Phase 1 works.
- Never automatically merge code or deploy production changes as part of the first coding loop.
- No mock data to simulate a working AI coding flow.
- Never claim tests, OAuth, provider access, deployment, or browser acceptance were verified unless actually exercised.

## Continuation protocol

Read [Roadmap](ROADMAP.md), [Architecture](ARCHITECTURE.md), [Agent Handoff](AGENT_HANDOFF.md), and [Next Kilo Prompt](NEXT_KILO_PROMPT.md). Work on one increment at a time. After each checkpoint, update this file with evidence and the exact commit SHA.