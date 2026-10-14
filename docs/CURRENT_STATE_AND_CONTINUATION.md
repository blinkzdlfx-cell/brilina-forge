# Current State and Continuation Plan

**Last reconciled against:** `main` at `c9d4c6c1f1fdd4e719f1291c34b4f6a9917c88f4` (2026-10-14).
**This document is the concise current-state reference.** If an older phase document disagrees with this file, inspect the code and the specific ADR, then correct the older document; do not assume either document proves implementation.

## Product in plain English

Brilina Forge is a private AI-assisted development workspace. A user connects GitHub, chooses a repository and branch, chats with an AI, and the AI can inspect relevant repository information through controlled tools. Forge records conversations, runs, tool activity, and usage in Neon. The AI must not receive the whole repository by default or have unrestricted access to secrets or commands.

GitHub is the source of truth for project code. Neon stores Forge's application state. Cloudflare Workers hosts the production API and React static assets. The browser is the interface, not a shell. If command execution is added, it must happen on the user's own computer through a separate local Node.js companion—not on the Cloudflare Worker or a VPS.

## Current architecture: intended versus observed

| Area | Current evidence | Honest status |
|---|---|---|
| Production API | `worker/index.ts`, `worker/api.ts`; Wrangler configuration | Worker implementation exists in code; deployment and live route parity are not verified here |
| Frontend | React/Vite/TypeScript under `web/`; packaged as Worker static assets | Build path is configured; browser acceptance is not verified here |
| GitHub | GitHub App authorization and repository operations in Worker/source modules | Code exists; real OAuth flow is not verified here |
| Persistence | Neon serverless driver and SQL repositories for sessions, conversations, runs, audit and usage | Code exists; current live end-to-end behavior is not verified here |
| AI | Deterministic development model plus OpenAI-compatible provider adapter | Adapter/tests exist; no live provider request is verified here |
| Run execution and SSE | POST creates a queued run; GET SSE route attempts to claim and execute it while the stream remains open | Implemented pattern, but execution is tied to the request lifetime; disconnect/retry/recovery needs focused tests and design review |
| Run events | Worker emits SSE events; legacy `src/phase4/events.ts` is in-memory | Durable replayable event history across disconnects/restarts is not established |
| Companion backend scaffolding | Worker routes and Neon companion-work repository code exist | Partial scaffolding only; it is not evidence that a usable local companion exists |
| Device identity | Worker currently derives session device IDs from an in-memory `Map` | Not durable across Worker isolates; must be replaced before relying on it |
| Approval | Controller emits approval-required and rejects the tool; Worker approval endpoint currently records a simple response | No end-to-end approve/reject-and-resume flow |
| Local companion | No dedicated, complete companion application has been confirmed in the repository | Not implemented/verified |
| Automated checks | Scripts exist in `package.json`; past docs report test counts | Do not treat historic counts as current. Run the exact commands locally and record actual output |

## Confirmed issues to address

1. **Documentation drift:** older handoff/architecture/roadmap sections describe Fastify as the active API, the local companion as both not started and completed, and phase statuses that conflict with the native Worker migration.
2. **Device assignment is isolate-local:** `sessionDevices` in `worker/api.ts` is a process-memory map. It cannot reliably assign the same device ID across Worker isolates/restarts.
3. **Approval cannot resume a tool:** `src/agent/controller.ts` rejects `approval-required` tools instead of persisting a pending tool call and resuming after a user decision.
4. **No complete local companion is present:** Worker routes and a command-dispatch tool do not constitute a companion process that polls/receives work, safely executes it, and posts results.
5. **Run work is coupled to SSE:** the SSE GET route can claim and execute a run while its response remains open. This requires deliberate handling of disconnects, retries, duplicate dispatch, execution timeout, and recovery.
6. **Run event history is not proven durable/replayable:** the legacy event bus is in memory, and Worker SSE behavior needs tests for reconnect/replay and concurrent subscribers.
7. **Companion tool context requires review:** `src/agent/tools/companion-exec.ts` sets `conversationId` to `context.runId`, although the controller tool context currently exposes only the run ID. Do not wire this tool into working execution until the context contract and test are corrected.
8. **Stale-work timeout count needs verification:** `timeoutStaleCompanionWork` reads a `count` property from the Neon query result using a cast. Verify the actual driver result contract and test the return value before depending on it.
9. **Build/test status is unknown at this checkpoint:** ChatGPT inspected remote source/docs but did not run the repository's build or tests in a local checkout.

These findings are code/document observations, not claims that the production deployment is broken. Validate each in a local checkout and with focused tests.

## Decisions that remain in force

- Cloudflare Worker is the production API runtime; do not add new product behavior to legacy Fastify routes.
- Neon Postgres remains the database. Do not migrate to D1 as part of this work.
- GitHub is canonical for source code; GitHub APIs remain the initial repository interface.
- The controller is provider-neutral and tools are typed, registered, authorized and audited.
- No shell on the Worker/server and no browser terminal.
- Local execution, if built, is through a separate Node.js companion running as the user. The first version has no sandbox, so command policy and explicit consent are critical; this risk must be made clear.
- No silent architecture changes. The project owner approves significant decisions.
- Never report tests, deployment, OAuth, provider access, or browser acceptance as verified unless actually exercised.

## Reconciled implementation order

### Stage A — establish a trusted baseline (now)
1. Reconcile documentation and establish this status document.
2. Pull the branch, inspect the working tree, install dependencies, run the existing build/tests, and record actual results.
3. Fix only confirmed baseline/type/test failures in small commits.
4. Review current Worker route behavior and persistence assumptions before adding features.

### Stage B — make the existing Worker path reliable
1. Test queued-run creation, atomic claim, duplicate SSE connections, disconnect, cancellation, timeout, and terminal run states.
2. Decide and document the minimum reliable run lifecycle: durable state, idempotent claim/dispatch, recovery after disconnect/restart, and event replay. Present any schema/architecture decision for approval before implementation.
3. Test Neon query contracts and remove isolate-local state from any behavior that must survive requests.
4. Run local Worker + browser acceptance using the deterministic provider first.

### Stage C — finish approval and companion boundaries
1. Specify the complete request/result contract and threat model for the companion.
2. Design durable device identity and work assignment; no in-memory Map as authority.
3. Implement a persisted approval/resume state machine and audit trail.
4. Build the companion as a separate application, with bounded output, timeouts, cancellation/process cleanup, authenticated work retrieval/result submission, and explicit handling of unavailable devices.
5. Add focused unit and integration tests before wiring the command tool into ordinary runs.

### Stage D — live verification and hardening
1. Verify GitHub App OAuth and Neon-backed sessions in a real local/deployed environment.
2. Verify deterministic runs end-to-end, then a real provider request.
3. Verify SSE reconnect/replay, cancellation, failure/recovery, and companion approval/execution.
4. Remove legacy Fastify/terminal code only after route parity and acceptance are demonstrated.
5. Update status/roadmap with exact commands, results, commit SHA, and remaining gaps.

## Small-change checkpoint rule

Every implementation increment must include: goal; affected files; expected behavior; tests to add/run; actual results; known gaps. Make one small change, test it, commit and push it, then stop for review. Never combine a broad refactor with a bug fix. If tests cannot be run, say so and do not mark the change verified.

## How to resume after ChatGPT limits or a context reset

1. Open `docs/AI_COLLABORATION.md` and this file first.
2. Pull the latest shared branch and inspect `git status`; do not overwrite uncommitted work.
3. Read `docs/NEXT_KILO_PROMPT.md`. It contains the current instruction to give Kilo.
4. Kilo must first report findings without changing code. After review, update this document and the roadmap before the next implementation increment.
5. After any push, record the exact branch and SHA here and in the collaboration handoff.
