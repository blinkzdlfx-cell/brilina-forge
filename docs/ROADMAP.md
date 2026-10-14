# Brilina Forge Roadmap

The evidence-based current status and continuation plan lives in [Current State and Continuation Plan](CURRENT_STATE_AND_CONTINUATION.md). This roadmap is ordered by dependency and risk. Historic phase completion notes must not be treated as live verification.

## Stage A — Baseline and documentation

**Status: documentation reconciliation in progress; current runtime checks not independently rerun in this checkpoint.**

- [x] Native Cloudflare Worker identified as the production runtime.
- [x] Neon retained as the database; D1 migration excluded.
- [x] Reusable Kilo inspection prompt added.
- [x] Known gaps recorded in the current-state document.
- [ ] Pull the current branch on the development machine and preserve `git status`.
- [ ] Run the exact build and test scripts in `package.json`; record commands and results.
- [ ] Fix only reproducible build/type/test failures in isolated commits.

## Stage B — Reliable Worker run lifecycle

**Status: partial implementation; recovery guarantees not yet established.**

Current code creates a queued run and uses the SSE GET request to claim/execute it. Neon stores run records, but request-bound execution is not sufficient proof of recovery or replay.

Acceptance criteria:
- queued run is created exactly once for the accepted request;
- atomic claim prevents duplicate execution under concurrent stream connections;
- reconnect does not start duplicate work;
- disconnect behavior is explicitly defined and tested;
- cancellation, timeouts, failures and cleanup produce consistent terminal state;
- result messages and tool audit are durable;
- event replay/reconnect behavior is documented and tested;
- abandoned claimed runs have a recovery strategy.

Do not make a large lifecycle redesign without presenting the smallest safe proposal and any schema changes for owner approval.

## Stage C — Persistence and isolate correctness

**Status: partial; requires focused verification.**

- [ ] Verify Neon query result contracts, especially stale-work timeout counts.
- [ ] Replace in-memory device assignment with durable, ownership-checked assignment before relying on device IDs.
- [ ] Test session and OAuth state behavior under multiple Worker isolates where applicable.
- [ ] Ensure any data needed after a request is stored durably or held in a deliberately selected durable coordination primitive.

## Stage D — Interactive approval

**Status: not implemented end to end.**

- [ ] Persist a pending tool call and its arguments safely.
- [ ] Expose authenticated approve/reject actions scoped to the owning user and run.
- [ ] Record who approved/rejected what and when.
- [ ] Resume the same pending tool call after approval, exactly once; do not ask the model to recreate it.
- [ ] On rejection, return a structured tool result and continue/stop according to the defined controller contract.
- [ ] Test concurrent decisions, duplicate submissions, expiry and run cancellation.

## Stage E — Local Node.js companion

**Status: partial Worker/database scaffolding; no complete companion verified.**

- [ ] Specify and approve the device identity, work-delivery, result-submission and revocation contract.
- [ ] Build a separate Node.js companion application that runs only when needed.
- [ ] Authenticate each device and scope work to its user/workspace/run.
- [ ] Implement safe process spawning, command classification, timeout, output limits, cancellation and cleanup.
- [ ] Block prohibited commands; require fresh explicit consent for risky commands.
- [ ] Ensure device unavailability never silently changes execution location.
- [ ] Correct the tool execution context so run ID and conversation ID cannot be confused.
- [ ] Add unit/integration tests for dispatch, result persistence, failures and duplicate delivery.

## Stage F — End-to-end verification

**Status: not verified.**

In order:
1. Local Worker startup and production build.
2. `/health` and React static shell.
3. Real GitHub App OAuth and Neon-backed session.
4. Repository selection and conversation creation.
5. Deterministic run through SSE.
6. Run reconnect, cancellation, duplicate subscriber and recovery cases.
7. Real AI provider request and streaming/tool-call behavior.
8. Companion device registration, work delivery, consent, result and failure handling.
9. Browser acceptance of the user-facing flow.
10. Security review and legacy source removal only after route parity is proven.

## Stage G — Cleanup and enhancements

After the reliability gates pass:
- remove obsolete Fastify/terminal code and dependencies;
- add UI acceptance automation;
- add pagination for conversation/message history;
- improve provider/model capability reporting and streaming;
- estimate cost only when pricing data is well-defined;
- consider additional providers without coupling the controller to a vendor.

## Checkpoint rule

Each increment has one goal, explicit files, acceptance criteria and tests. Run tests before committing where possible. Push the small checkpoint, report branch/SHA/exact test output/known gaps, and pause for review. Never label a feature verified based only on source inspection or an old test count.
