# Brilina Forge — Audited TODO and Acceptance Ledger

**Audit baseline:** `main` at `dcbb40ec9d52cc92f0dfb6237de169e1cfedcdf7` (2026-10-15).
**Working agreement:** implement changes directly on `main`; retain GitHub REST + GraphQL, Cloudflare Workers + Workers Static Assets, Neon Postgres, and the provider-neutral AI adapter. No D1 migration, no Worker shell, no automatic merge/deploy. Batch related work, run automated checks first, then ask the owner to perform only the live/browser checks that require their access. Do not start the next batch until the current acceptance gate is passed.
**Status vocabulary:** not started · in progress · automated-tested · owner-reported live-verified · blocked.

This ledger is based on source and documentation inspection. A listed capability is not considered complete merely because code exists.

## Audit findings

- `src/github/service.ts` uses **GitHub GraphQL** for repository identity/default-branch metadata and **GitHub REST** for repository details, branch listing, tree/file reads, comparisons, commits, work-branch creation, and file writes. Preserve this division; do not replace it with a second GitHub client.
- `worker/index.ts` is the native Cloudflare Worker entry point and delegates API traffic to `worker/api.ts`; the web app is React/Vite in `web/` and is packaged for Worker Static Assets. Legacy Fastify code must not receive new product routes.
- `src/agent/controller.ts`, `src/agent/registry.ts`, `src/agent/policy.ts`, and `src/agent/run-state.ts` implement the basic model/tool loop, typed registry, simple tool policy, and in-memory transition validation.
- `src/agent/tools/github-read-context.ts` currently returns read tools **and** spreads in `createGithubWriteTools(service)`. Therefore the older statement in `docs/CURRENT_STATE_AND_CONTINUATION.md` that the Worker path does not visibly register write tools is stale/inaccurate. The live AI-to-GitHub write flow is still not proven and must be tested end-to-end.
- The current controller treats `approval-required` as a rejection/failure; there is no durable approval request/decision and exact-call resume.
- `runs` and `tool_calls` are persisted in Neon, but the inspected migrations have no ordered durable run-event table. SSE events are emitted during the request; reconnect replay and durable background execution are not established.
- `worker/api.ts` claims runs with a conditional `queued → running` update, but run execution is coupled to the SSE request lifecycle. Cancellation currently only updates queued runs. Disconnect, in-flight cancellation, reconnect and recovery need targeted verification/design.
- `web/src/App.tsx` reconstructs run history from run/tool audit rows. This helps reload history but is not an ordered event timeline and cannot restore every event detail.
- `worker/api.ts` keeps session-to-device assignments in an isolate-local `Map`; this is not durable across Worker isolates. Companion endpoints are scaffolding, not proof of a complete safe local companion.
- `src/ai/factory.ts` chooses the OpenAI-compatible provider only when a provider key is configured; otherwise the deterministic development provider is used. The UI and acceptance test must make development mode unmistakable; deterministic responses are not live AI proof.
- Existing automated coverage includes controller, provider adapter/retry, GitHub service/write tools, Worker/OAuth, security, and companion tests. The root `npm test` suite has historically had unrelated legacy server/type and unresolved companion-test issues; record fresh results rather than assuming it is green.
- The current branch-selector fix at `58376fe3469def9bdf84ed5e4c747bce4239acae` restores branch options when reopening a conversation, but its required browser acceptance is still open. Recent CI for the latest documentation commits succeeded; this does not replace live acceptance.
- Preserve existing Neon schema and migration history. Any schema addition must be a new versioned migration, tested against the repository's supported PostgreSQL/Neon setup; never make undocumented production-only changes.

## Batch 0 — Baseline and audit

- [x] Read active roadmap, architecture plan, requirements, collaboration handoff, current-state ledger, testing/security docs, package scripts, CI workflow, schema migrations, and the principal agent/GitHub/AI/Worker/UI paths.
- [x] Establish existing integration boundaries and known gaps above.
- [ ] Run and record the current CI/build/test evidence for this exact baseline; separate focused suite results from the full legacy suite.
- [ ] Reconcile inaccurate/stale current-state documentation with the inspected source.
- [ ] Verify branch-selector code in CI and provide the owner a consolidated browser acceptance card.

**Gate:** factual baseline and current source/documentation agree; branch selector remains explicitly unverified until owner browser testing.

## Batch 1 — Reliable GitHub coding workflow (priority)

- [ ] Confirm the actual runtime tool registry includes GitHub read/write tools exactly once and that branch-creation state is scoped to the run (not accidentally shared across concurrent runs).
- [ ] Verify selected repository + selected branch reach the controller and every tool call; reject missing/wrong repository, wrong branch, and default-branch writes.
- [ ] Audit write-path validation, current blob SHA/conflict behavior, GitHub REST response handling, output bounds, and secret redaction.
- [ ] Make the model's tool-call loop robust: schema validation (including types and additional properties), tool result correlation, bounded steps/output/context, normalized failure reporting, and no false success.
- [ ] Ensure a successful file create/update is read back from GitHub and the user can review the actual branch, commit, changed file, and diff. Keep GitHub the source of truth.
- [ ] Add/adjust automated tests for tool registration, selected repository/ref scope, concurrent run isolation, write success/read-back, conflicts, GitHub errors, and failure-state reporting.
- [ ] Verify the existing conversation branch selector and comparison selector have reliable loading, persistence, stale-request handling, and visible errors.
- [ ] Update run activity/UI where needed so planned, requested, completed, rejected, and failed work are not conflated; retain prior activity per conversation.
- [ ] Update roadmap/current-state docs with exact SHA, tests and unresolved live checks.

**Owner acceptance gate:** in the deployed app, on a repository and non-default work branch explicitly approved for testing, ask Forge to make a small, safe edit to a test file. Confirm a real configured AI provider was used; GitHub contains the changed content and commit on the intended branch; the UI shows the correct branch/file/diff/commit; the conversation and run history survive reload; and an unauthorized branch/repository attempt is rejected. Do not use production files or the default branch for the write test.

## Batch 2 — Durable run lifecycle, events, approval and recovery

- [ ] Design and add versioned Neon migration(s) for ordered run events and durable approval records only after matching them to actual repository needs.
- [ ] Define valid state transitions, event IDs/order, idempotent run claims, tool-call lifecycle, correlation and terminal-state semantics.
- [ ] Persist events before/with publication; implement authenticated event replay/reconnect without duplicate side effects.
- [ ] Separate browser disconnect from user cancellation; make cancellation behavior accurate for queued and in-flight work.
- [ ] Implement durable approval/deny for the exact pending tool call and resume it at most once; until then, risky tools must fail closed.
- [ ] Add bounded timeouts/retries, stale-run handling based on evidence/leases, output limits and provider usage/error visibility.
- [ ] Add automated interruption, duplicate-submit, duplicate-subscriber, reconnect/replay, approval, cancel, and no-repeat-side-effect tests.
- [ ] Evaluate Cloudflare Workflows only through a bounded proof of concept; do not adopt it or add paid infrastructure without evidence and a decision.

**Gate:** controlled disconnect/failure/reconnect and approval tests prove accurate state and no duplicate completed side effects.

## Batch 3 — Claude Code-style task/activity and review experience

- [ ] Deliver an expandable/collapsible activity timeline sourced from real persisted events, not simulated steps.
- [ ] Clearly distinguish plan, tool request, tool execution, approval wait, result, verification and final report.
- [ ] Show bounded useful tool outputs/errors, timestamps, changed files, branch and commit links.
- [ ] Provide functional stop/cancel/continue controls matching the actual backend state machine.
- [ ] Preserve conversation messages and run activity across conversation switching, reload and reconnect.
- [ ] Add a review surface that compares proposed work with GitHub-confirmed changes.
- [ ] Keep ordinary informational chat distinct from coding/action workflows.
- [ ] Add frontend component/integration tests and update accessible loading/disabled/error states.

**Gate:** owner can follow a real coding run, understand each action, reconnect/reload, review the resulting GitHub diff and see accurate final status.

## Batch 4 — GitHub Actions verification and bounded repair

- [ ] Inspect/dispatch supported Actions workflows using existing GitHub integration; preserve REST/GraphQL separation and least privilege.
- [ ] Show actual workflow/job/step status and retrieve bounded, redacted logs.
- [ ] Correlate checks to the selected commit/branch; never claim a test ran without an Actions result.
- [ ] Let the model diagnose and attempt a bounded repair using Batch 1 tools, then rerun verification.
- [ ] Cap repair attempts and report blocked, failed, cancelled and successful outcomes accurately.
- [ ] Never automatically merge or deploy production.

**Gate:** a deliberately failing check is diagnosed, corrected, rerun and reported with real workflow evidence.

## Batch 5 — Companion security and execution completion

- [ ] Replace isolate-local device assignment with durable identity and explicit ownership/revocation.
- [ ] Complete authenticated, expiring, idempotent companion work/result contracts.
- [ ] Enforce blocked → approval-required → allowed command policy at execution time.
- [ ] Persist approval against the exact command/tool call and resume once.
- [ ] Restrict working directory, command type, runtime, output, process lifetime and cleanup; redact output.
- [ ] Fail closed if the companion is unavailable; never silently change execution location.
- [ ] Add tests for device revocation, duplicate delivery, timeout, cancellation, output truncation/redaction and result-to-run association.

**Gate:** only an authorized, approved command runs on the intended device and the correct result is durably attached to the run.

## Batch 6 — Cloudflare diagnostics, production hardening and later expansion

- [ ] Implement least-privilege Cloudflare diagnostics only after the coding/verification loop is stable.
- [ ] Redact secrets/PII, filter logs, and correlate evidence to a source commit.
- [ ] Complete rate limits, export/restore procedure, accessibility, end-to-end regression, and environment/deployment checks.
- [ ] Add additional AI providers only after real tool-call, quota, error and cost testing.
- [ ] Add teams/workspace roles only with verified repository/secret isolation.
- [ ] Remove legacy Fastify paths only after route parity and deployed behavior are verified.

**Gate:** security/regression checks pass and no user can access another user's repositories or secrets.

## How to use this TODO

1. I implement the next whole batch directly in this repository and update this ledger with evidence.
2. I run all checks available through code/CI first.
3. I then provide one consolidated owner test card with exact starting URL, safe branch, numbered steps, expected outcomes, PASS/FAIL response format, and safe-stop instructions.
4. You test the deployed app and report the result. I record it as owner-reported evidence, fix failures in the same batch, and ask you to retest.
5. A batch is not complete until its acceptance gate passes. We do not jump ahead merely because code has been committed.
