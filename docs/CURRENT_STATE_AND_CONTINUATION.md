## Shared UI foundation (2026-10-15)

- **Decision:** keep the current React/Vite architecture and introduce a small centralized design system before considering a full component-library migration. Shared CSS tokens define surfaces, text, borders, primary color, radii, focus ring, shadows, and motion. Existing controls now share hover, focus, disabled, and reduced-motion behavior; mobile repository/branch controls have improved layout. This is a foundation, not a claim that shadcn/ui components have been installed.
- **Branch selector hardening:** branch picker availability is based on the selected GitHub repository, not only an internal Forge sync ID; branch loading responses are guarded against stale conversation responses.
- **Verification status:** code committed to main. Build/CI and live visual acceptance still need evidence; do not mark Batch 1 complete until the app is tested.

# Current State and Continuation Plan


## Increment: restore branch choices when reopening a conversation (2026-10-15)

- **Code commit:** `58376fe3469def9bdf84ed5e4c747bce4239acae` — `fix: restore branch options when switching conversations`.
- **Change:** `web/src/App.tsx` now fetches branch choices when an existing conversation with a selected GitHub repository becomes active, shows a branch-loading state, disables branch/base selectors while loading, and ignores stale async responses after switching conversations.
- **Review evidence:** inspected the commit diff via GitHub; change is limited to `web/src/App.tsx`.
- **Automated test status:** not confirmed. The available GitHub status endpoint returned no commit statuses, and the available workflow-run connector only exposes PR-triggered runs. No local checkout/build was available in this execution path. Do not mark this increment tested or live-verified until CI/build and browser acceptance are checked.
- **Required acceptance:** reopen a conversation bound to a multi-branch repository; confirm the branch selector populates, the saved branch is selected, selecting a different branch persists, switching conversations loads that conversation's branches, and branch loading/errors are visible and safe.

## Documentation terminology correction (2026-10-15)

The UI reference is **Claude Code**, not “Cloud Code.” Corrected the terminology in the orchestrator/UI plan, roadmap, and current-state document. This is documentation-only; it does not change the product implementation.

> **Owner requirements captured (2026-10-15):** [Orchestrator, Project Memory, and Workspace UI Plan](ORCHESTRATOR_UI_AND_MEMORY_PLAN.md) is the detailed working checklist for the next increments. It captures the Claude Code-style task activity UI, orchestrator evidence/continuity requirements, repo/branch selection defect, stop/continue recovery, proposed repository-scoped memory/compaction (design discussion before coding), and later GitHub session-expiry/reconnect/logout behavior. Requirements documented here are not yet implementation or live-verification evidence.

 > **Phase numbering note (2026-10-15):** The owner-approved working sequence is defined in [ROADMAP.md](ROADMAP.md) and [Product Architecture Plan](PRODUCT_ARCHITECTURE_PLAN.md). Phase 0 is the baseline audit; Phase 1 is core GitHub coding; Phase 2 is runtime reliability/recovery. Historical phase records are retained.


**Latest implementation checkpoint:** 2026-10-15, commit `a1a7ab7a51f12ca4a5bf587a77b8599b27820d1b` on `main`. GitHub Actions run 242 passed: `npm ci`, `npm run build`, `npm run typecheck:phase1`, `npm run test:phase1`, `npm run test:worker`, Wrangler deploy dry-run, and both dependency audits. This increment adds bounded prior-turn conversation context to the agent controller and restores per-run tool activity from existing Neon run/tool-call audit records. It does not yet provide ordered durable event replay, resumable approval, or live end-to-end proof of GitHub writes. Production behavior remains owner-reported, not independently live-verified.



## Latest user-reported behavior and implementation checkpoint (2026-10-15)

The owner tested the deployed interface and reported that the agent behaved like a generic chatbot, did not remember earlier turns in the same conversation, and cleared old run activity when a new message was sent. Source inspection confirmed the causes: `AgentController.run()` started with only the current message, and `web/src/App.tsx` reset transient tool activity on every run. Commit `a1a7ab7a51f12ca4a5bf587a77b8599b27820d1b` addresses these two defects by passing a bounded window of persisted user/assistant turns into the controller and rendering each conversation's run/tool audit history from existing API endpoints. Automated CI run 242 passed: https://github.com/blinkzdlfx-cell/brilina-forge/actions/runs/38740916489. This is not a claim that production has been independently checked after the push. The current audit model preserves tool-call history, but it is not yet an ordered event ledger and does not provide SSE replay/resume.

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
| Neon persistence | Session, conversation, run, audit, usage and companion repositories exist. On 2026-10-14, the Neon management connection listed the existing project/database and a read-only SQL query succeeded; 11 public application tables were present. | Database reachable through management tooling; deployed Worker `DATABASE_URL` and end-to-end app persistence remain unverified |
| Agent Controller | Typed tool registry, authorization, policy and audit code exist. The controller treats `approval-required` as an error/rejection and terminates the run rather than persisting an approval and resuming the exact call. | Implemented in code; durable approval/resume not implemented |
| AI provider | `createProviderRuntime()` selects the OpenAI-compatible adapter only when an API key is configured; otherwise it selects the deterministic development provider. | Adapter code exists; live provider call and tool-calling behavior not verified; deterministic mode must not be mistaken for live AI |
| GitHub read tools | Repository metadata/context, branches, tree, file read, diff | Implemented in code |
| GitHub write tools | The Worker registers `createGithubReadTools()` plus the companion execution tool. The current `createGithubReadTools()` implementation in `src/agent/tools/github-read-context.ts` also spreads in `createGithubWriteTools(service)`, so write tools are in the registry by source inspection. This corrects the earlier stale claim that writes were not registered. The live AI-to-GitHub write/read-back/diff flow remains unverified. | **Phase 1 blocker: tool registration and real end-to-end write path must be reconciled before live acceptance** |
| UI-to-agent code change | No verified end-to-end change from chat to GitHub commit | **Not verified; primary Phase 1 target** |
| GitHub Actions repair loop | APIs/workflows may provide a foundation; complete AI-driven diagnose/fix/retest loop not verified | Proposed active Phase 3 |
| Local companion | Partial Worker/database dispatch scaffolding exists; no complete executable companion verified | Proposed active Phase 4 |
| Approval/resume | Controller currently rejects approval-required tools rather than persisting and resuming the same pending call | Incomplete; required before risky companion execution |
| Device identity | `worker/api.ts` contains isolate-local device assignment state | Not durable across Worker isolates; fix before relying on device identity |
| Run lifecycle/SSE | Worker run execution is coupled to the open request/SSE signal; current `runs` and `tool_calls` records are persisted, but the inspected migrations do not define an ordered durable run-event table. | Recovery, disconnect, replay and duplicate side-effect guarantees not established |
| Cloudflare diagnostics | No verified end-to-end log-to-source-fix flow | Proposed active Phase 5 |
| Teams/multiple providers | Architecture can accommodate them; complete team workflow not verified | Proposed active Phase 6 |

## Automated verification snapshot (2026-10-15)

GitHub Actions run 233 passed on main commit `1a57e347ef88a9aa15affe7b7d48c21def2fbbc5`: `npm ci`, frontend build (`npm run build`), `npm run typecheck:phase1`, `npm run test:phase1`, `npm run test:worker`, Wrangler deploy dry-run, and `npm audit --audit-level=high` (security job ran the audit twice). This is automated CI evidence only, not live browser/provider/GitHub coding verification. The Wrangler command is a dry-run, not a production deployment confirmation. The broad recursive `npm test` suite was also attempted and failed on unrelated legacy issues: `src/server.ts` has an existing parse/type-check problem near line 660, and several local-companion tests ended with unresolved promises. Those failures are not evidence that the new GitHub write tests failed; the focused Phase 1 suite passed.

## Mandatory completion and phase-transition rule

This ledger must be based on implementation evidence, not documentation alone. Whenever checking a feature, inspect the relevant source code and runtime/tool registration, run the focused automated tests and build/type checks, and perform an end-to-end/live check when required and possible. Then update this ledger and the roadmap to match the evidence. A documentation checkbox, prompt, comment, type, mock, successful file read, or AI statement is not proof that an operation works. Record the checked commit SHA, relevant source/test files, exact commands and results, and live verification. Missing or failed evidence means the status stays partial, blocked, not implemented, or unverified.

**Phase 1 is NOT complete and Phase 2 must NOT start** until the real AI-to-GitHub write path succeeds on an authorized non-default work branch: the tool call creates/updates a file, GitHub confirms the change, the file is read back, and the UI presents a reviewable diff plus branch/commit details. File reading or issue reading does not prove file writing works. If writing fails, continue debugging Phase 1 and report the exact blocker.

## Owner-performed verification requests

When a check requires the owner to interact with the deployed/local app, use their GitHub account, test a real permission boundary, or inspect behavior unavailable to the agent, first run all safe automated checks. Then provide a concise manual test card: **reason**, **starting URL/screen and safe test branch**, **numbered steps**, **expected result**, **what to report (PASS/FAIL and exact error)**, and **how to stop safely if it fails**. Ask for sanitized evidence only; never request passwords, tokens, or secrets. Wait for the response before recording the check as owner-reported manual evidence. Do not convert an owner request into a verified result without their response. If it cannot be performed, mark it blocked/unverified and keep any dependent acceptance gate open. Prefer one grouped checklist over repeated interruptions.

## Setup and configuration status (2026-10-14)

The existing Neon project is `Brilina Forge` (`nameless-haze-58360399`), default branch `production` (`br-sparkling-boat-zakcaiqb`), database `neondb`, region `aws-eu-west-2`. A read-only query succeeded through Neon management tooling; no schema changes were made. This does not confirm that Cloudflare's deployed `DATABASE_URL` secret matches the project.

A step-by-step guide covering GitHub App setup, Neon, Cloudflare Workers AI, Worker variables/secrets, local development, and first-time use is available in [Phase 1 Setup and User Guide](PHASE_1_SETUP_AND_USER_GUIDE.md). The Cloudflare Worker secret values themselves were not inspected in this review.

## Immediate priority

**Phase 0 source audit is substantially recorded; live/database deployment verification remains open.** The first Phase 1 code increment now registers the existing scoped GitHub write-tool factory in the Worker runtime, and CI passed. Next, verify the deployed or local runtime exposes the write tools and complete one controlled AI-triggered file write/read-back/diff on a non-default work branch. The durable run-event/recovery design remains a later Phase 2 concern. Do not continue expanding the companion until a real model can read relevant files, make controlled edits through GitHub, return a reviewable diff/commit, and persist the result.

## Phase 1 implementation checklist

- [ ] Inspect actual working tree and current `main` SHA in Kilo's checkout; preserve local changes.
- [ ] Run available build and test commands; record exact output.
- [ ] Verify GitHub OAuth, repository selection, branch selection, conversation binding, and Neon persistence.
- [ ] Configure one real AI provider and verify a real request with tool calls.
- [x] Register `createGithubWriteTools(service)` in the Worker agent registry (commit `3ca281261a4efa4c9fdae8404899d218be2a8ea3`; CI run 237 passed).
- [ ] Live-verify that the deployed/local Worker exposes the branch/create/update/upsert tools; complete a real AI-triggered write, read-back and reviewable diff on a non-default work branch.
- [ ] Add scoped authorization so tools only modify the conversation's selected repository and an explicitly selected work branch.
- [ ] Ensure writes are sequential for each path and handle conflicts safely.
- [ ] Complete and verify the branch/commit workflow, diff/read-back, audit events, output bounds, and clear error results.
- [ ] Add UI activity and diff/result presentation.
- [ ] Test a small real repository change end to end.
- [ ] Record exact branch, SHA, commands, test results, live verification, and known gaps.

## Phase 0 audit findings (2026-10-15)

1. **Current main SHA at the implementation checkpoint:** `3ca281261a4efa4c9fdae8404899d218be2a8ea3`. GitHub Actions run 237 passed the listed focused checks and Worker dry-run; no production deployment or end-to-end browser run was performed.
2. **Write-tool registration increment:** fixed in commit `3ca281261a4efa4c9fdae8404899d218be2a8ea3` by importing and registering `createGithubWriteTools(service)` beside the GitHub read tools in `worker/api.ts`. CI passed. This confirms build/type/focused test coverage, but it does not yet prove the deployed Worker offers the tools or that a real AI-triggered write succeeds end to end.
3. **Approval is not resumable:** the controller emits `approval.required`, then marks the tool call rejected and throws. There is no persisted approval-and-resume path in the inspected controller contract.
4. **Durable event history is missing or not yet identified:** migrations include runs, tool calls, usage, conversation messages and companion work results, but the inspected migration list does not show a dedicated ordered run-events table. SSE observer events should not be assumed replayable after disconnect.
5. **Stale-run PR is not on main:** PR #10 remains open and proposes a guessed 10-minute stale-run cutoff. It is not merged and is not accepted as an implementation decision. Determine heartbeat/lease/timeout behavior before choosing a stale threshold.
6. **Migration documentation discrepancy:** `db/migrations/003_companion_work_results.sql` exists, while `DATABASE_AND_API_REFERENCE.md` incorrectly states there is no migration 003. This is a documentation inconsistency, not a request to apply a migration.

## Known engineering risks to preserve in later phases

1. **Run lifecycle:** current execution is coupled to an open SSE request. Design and test idempotent claims, reconnects, disconnect behavior, cancellation, timeouts, recovery, durable result state, and event replay.
2. **Device identity:** isolate-local maps are not durable identity stores.
3. **Approval:** an approval notification is not an approval/resume implementation. Persist the exact pending tool call, authenticate the decision, audit it, and resume it at most once.
4. **Companion context:** inspect the run ID/conversation ID contract before wiring command execution.
5. **Neon query contracts:** verify driver return shapes, including stale-work timeout counts, with focused tests.
6. **Security:** model output is untrusted input. Validate tool arguments, scope repository writes, protect tokens, redact logs, limit retries and output, and require consent for consequential operations.
7. **Build/test status:** CI run 237 passed focused build/type/test checks for commit `3ca281261a4efa4c9fdae8404899d218be2a8ea3`. The broad recursive `npm test` suite was not run on that SHA, and no live browser/provider/GitHub write verification was performed. Historic counts are not current verification.

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

## Owner-approved working protocol (2026-10-15)

- Primary database: Neon Postgres. D1 migration is not planned.
- Branch workflow: work directly on `main`; do not create a PR by default.
- Delivery discipline: one bounded increment at a time. Run the relevant tests/build and inspect the diff; if anything fails, fix and retest before advancing.
- Record exact commit SHA, files changed, commands run, results, live checks and known gaps after each increment.
- Do not equate a passing unit test with live-provider, GitHub, browser or production verification.
- Do not deploy to production, perform destructive database changes, or migrate the database without explicit authorization.

Read [Roadmap](ROADMAP.md), [Product Architecture Plan](PRODUCT_ARCHITECTURE_PLAN.md), [Architecture](ARCHITECTURE.md), [Agent Handoff](AGENT_HANDOFF.md), and [Next Kilo Prompt](NEXT_KILO_PROMPT.md) before implementation. Phase 0 baseline audit is the next step.

## Deep repository audit and implementation TODO (2026-10-15)

- **Audit baseline:** `main` commit `f9279be0edfad05738498605db915582fc5c6fd7` added `docs/IMPLEMENTATION_TODO.md`, the actionable batch plan and acceptance ledger.
- **Repository paths inspected:** active roadmap, product architecture plan, orchestrator/UI/memory plan, collaboration handoff, current-state, requirements, testing/security docs, package scripts, CI workflow, database migrations, Worker routing/run execution, React workspace/event handling, GitHub REST/GraphQL service, tool registry/policy/controller, GitHub read/write tools, provider adapter/factory/retry, audit repositories and relevant automated tests.
- **Integration decisions retained:** GitHub REST + GraphQL remain the source-code integration; Cloudflare Worker + Workers Static Assets remain the app runtime; Neon Postgres remains durable Forge state; provider-neutral AI adapters remain; optional local command execution stays in the separate Node companion. No D1 migration, Worker shell, automatic merge, or automatic production deploy.
- **Confirmed correction:** GitHub write tools are included through `createGithubReadTools()` → `createGithubWriteTools(service)`; this is registered in `executeRun()`. Tool registration presence is not equivalent to proving a real model-driven write succeeded.
- **Known open issues:** durable ordered run events/replay are absent from the inspected migrations; approval-required calls are rejected instead of durably paused/resumed; run execution is tied to the SSE request lifecycle; in-flight cancellation/reconnect recovery are not established; session-to-device assignment uses an isolate-local Map; live configured-provider and GitHub write/read-back/diff flow are not independently verified; the branch-selector browser acceptance is still pending.
- **Current automated status:** CI for the TODO commit is running at the time of this note; do not claim it passed until the run result is checked. Latest completed CI before the TODO commit passed on `dcbb40ec9d52cc92f0dfb6237de169e1cfedcdf7`, but that does not prove live production behavior.
- **Next work:** Batch 1 in `docs/IMPLEMENTATION_TODO.md` is the priority. The user will receive a consolidated browser test card after automated checks and implementation changes are complete. A batch remains open until the owner reports the manual acceptance outcome; failures are fixed and retested in the same batch.

## Latest implementation checkpoint — 2026-10-15

This section supersedes the older “Current automated status” note above.

- **Implementation code SHA:** `a825640e33c7284ad0cd60ea56a731950c7289ec`. The CI run for this code checkpoint passed build, Phase 1 typecheck/tests, Worker tests, Wrangler deploy dry-run and the security audit: https://github.com/blinkzdlfx-cell/brilina-forge/actions/runs/38765090243.
- **Subsequent documentation SHA:** `622537151092f3c9bea236d614c44b5967e4c5bd` updates `docs/IMPLEMENTATION_TODO.md` with the Batch 1 evidence and remaining acceptance gate. Its CI run must be checked separately.
- **Implemented and automated-tested:** unique GitHub read/write tool registration; per-run work-branch isolation; strict argument validation; duplicate model tool-call ID rejection; eight-step maximum; 32 KB per-result and 64 KB per-run tool-result budgets; current-blob-SHA/default-branch safeguards; write read-back verification; provider/model and verified branch/path/commit activity; and stale-response protection for branch and diff loading.
- **Files changed in this increment:** `src/agent/controller.ts`, `src/agent/controller.test.ts`, `src/agent/tools/github-write-tools.ts`, `src/agent/tools/github-write-tools.test.ts`, `src/agent/tools/companion-exec.ts`, `src/agent/tools/terminal.ts`, `src/agent/tools/github-read-repository.ts`, `worker/api.ts`, `web/src/App.tsx`, `web/src/types.ts`, `web/src/styles.css`, and `docs/IMPLEMENTATION_TODO.md`.
- **Still not live-verified:** production deployment of this code, configured real provider tool calls, an AI-triggered write/read-back/diff on an approved non-default test branch, browser branch-selector acceptance, and reload persistence during a real run. Do not mark Batch 1 complete until those checks pass.
- **Next owner test:** follow the consolidated Batch 1 acceptance card in `docs/IMPLEMENTATION_TODO.md`. Use a repository and non-default test branch explicitly approved for testing; do not write to a production repository or default branch. No production deploy was performed as part of this increment.



## Execution update — 2026-10-17 (migration 006 drafted)

- Added `db/migrations/006_auth_identity_connections.sql` at commit `8c083fa1b2d2b9bbe0a77aca5ce940707b8e5b1d`.
- Added verification queries at `db/manual/verify_006_auth_identity_connections.sql` at commit `49f68b4982a3a5e6306202f6dfcebe9fcbe9f44d`.
- Added `docs/GITHUB_APP_ARCHITECTURE.md` at commit `b178dbdd30b125ce5f9c8740438deedfe0e30901`.
- These are repository artifacts only. Migration 006 has not yet been run on any Neon branch and has not been copied to production.
- Migration 006 is deliberately additive: it creates/backfills `auth_identities`, adds identity ownership to `github_connections`, and records an explicit active connection per session. It leaves the current unique `github_connections(user_id)` constraint and legacy profile columns intact while source code is upgraded.
- Next: validate 006 against a fresh temporary Neon branch, update source/session code and tests, design/validate GitHub App installation tables, then pause with exact SQL and verification instructions before any production schema change.


## Combined authentication + GitHub App progress update (2026-10-17)

- Working integration branch: `feat/auth-github-app-complete`.
- Migration 006–008 test execution completed on temporary Neon branch `br-noisy-rain-zamdr0q8` (`auth-migration-006-validation-20261017`). Counts and ownership checks passed; 50 existing run snapshots and all existing workspace/conversation/repository/run rows were preserved.
- The production branch was not changed. No production SQL was executed.
- Source implementation now covers connection-aware session reads/refresh, safe account linking, account switching API, GitHub App JWT/install tokens, session-bound single-use installation state, installation/access/repository persistence, webhook signature verification and idempotency, authorized installation context, and run context snapshots. UI controls for account/installation selection are in the integration branch.
- This is not yet accepted: CI/build/test evidence and a real browser + GitHub installation test are pending.
- Production rollout must be staged: apply 006 + 007, deploy verified source with `GITHUB_MULTI_ACCOUNT_ENABLED=false`, then apply 008, verify it, and only then enable that flag. Do not apply 008 while the old Worker is active; its old session upsert depends on `UNIQUE(github_connections.user_id)`.
- After the combined auth/App tests pass, return to the original deferred AI-to-GitHub write gate: non-default branch, actual write, read-back, diff/commit, and immutable run context under a mid-run account/repository/branch change.
