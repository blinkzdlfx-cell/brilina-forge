# Brilina Forge — Product Architecture and Phase Rebaseline

**Status:** Neon Postgres and the direct-to-main, test-before-advance workflow are owner-approved. Other architecture details remain a working plan to validate against the source. No application code or database schema has been changed by this planning pass.  
**Planning baseline:** 2026-10-15.  
**Purpose:** Agree on the whole product architecture before extending the current minimal implementation, so we avoid piecemeal redesign and unnecessary migration work.

## 1. Product definition

Brilina Forge is a browser-based AI software-development workspace. It should take a task from request to a reviewable, verified result: understand the repository, plan, inspect relevant files, make controlled edits, run permitted tools, explain evidence, recover from interruptions, and let the user review or undo changes.

It is not merely a chat interface with tool calls. A run is a durable workflow with visible state, bounded autonomy, policy enforcement, checkpoints, results, and a clear human approval boundary.

### Product principles

1. **Evidence over claims:** tool results, GitHub state, test output, and logs determine success—not model wording.
2. **Human control:** the user can inspect activity, cancel, approve/deny consequential actions, review diffs, and choose whether to merge or deploy.
3. **Durable state:** browser tabs, SSE connections, and Worker isolates must not be the only place a task's state exists.
4. **Safe autonomy:** allow low-risk actions under policy; ask before consequential actions; deny prohibited actions. Model instructions are not a security boundary.
5. **Replaceable providers:** isolate provider-specific formats, capabilities, errors, limits, and usage behind an adapter.
6. **GitHub is canonical for source code:** never maintain a competing source-code truth in the database.
7. **Free-tier-first, not free-tier-at-any-cost:** prefer current free allowances, expose limits, bound work, and avoid dependencies that force a paid plan before the product needs it.
8. **No pretend integrations:** no mock results that look like real provider, GitHub, test, or deployment success.
9. **Incremental implementation:** architecture and acceptance criteria are broad; each coding increment remains small, testable, and reviewable.

## 2. What established products teach us

These are public product/documentation patterns, not claims that the vendors use identical internals.

| Reference | Useful pattern for Forge | What Forge should learn—not blindly copy |
|---|---|---|
| OpenAI Agents SDK / Agents platform | Explicit agent loop, typed tools, run state, guardrails, human review, handoffs, traces and evaluation | Separate orchestration from provider API calls; record each model/tool step and its status. Hosted agent features may have different cost and deployment implications from a self-hosted SDK. |
| Anthropic Claude / Managed Agents | Event-streamed sessions, explicit idle/running/terminated states, permission pauses, session budgets, per-thread activity and usage visibility | Model a paused-for-approval run as a real state, not a failed tool call; show the user why work is waiting. Do not assume managed-service behavior is available for free in a self-hosted app. |
| Google ADK | Session/event state, resumability, workflow execution and tools | Resume from durable completed steps and protect side effects from duplicate execution. A resumed workflow must not blindly repeat a write or command. |
| Cline | Persistent tasks, task history, interruption/resume, Git-based checkpoints and rollback | A task should remain inspectable after refresh/restart; checkpoint file changes and make rollback understandable. |
| OpenCode | Built-in and custom/MCP tools, per-tool allow/deny/ask permissions, agents and provider/model selection | Permission is policy attached to each capability, not just a warning in the system prompt. Keep tool inventory and model configuration explicit. |
| Kilo Code | Interactive/autonomous modes, granular tool approval, snapshots/checkpoints, CLI operation and failure exits | Expose autonomy mode and permission boundaries; snapshots and clear process exit/failure status are part of the product, not optional polish. |

### Common reference architecture to adopt

- A **run controller** owns the lifecycle and decides whether to call the model, execute a tool, pause for a user, retry, or finish.
- A **provider adapter** translates the common model/tool contract into each provider's API and normalizes errors/usage.
- A **tool registry** declares schemas, capabilities, risk levels, authorization scope, output limits and policies.
- A **policy engine** evaluates identity, workspace/repository scope, action risk and approval requirements before execution.
- A **durable event history** records run transitions, model turns, tool requests/results, approvals, retries and terminal outcomes.
- A **task UI** renders those events as a timeline, not merely a scrolling text transcript.
- A **checkpoint/review layer** makes changes inspectable and reversible before merge/deploy.
- **Tracing and evaluations** help identify tool-routing failures, hangs, repeated calls, context problems and regressions.

## 3. Proposed product architecture

### Runtime and service boundaries

- **Web UI:** existing React + Vite application served as Cloudflare Worker Static Assets. It is the control and review surface, never a shell.
- **API/control plane:** existing native Cloudflare Worker entry points, including `worker/index.ts` and `worker/api.ts`. Do not add new product behavior to legacy Fastify routes.
- **Run controller:** owns run state transitions, budgets, tool routing, cancellation, resume, retries and terminal results. Keep it small and typed rather than introducing a large agent framework without demonstrated need.
- **Provider adapter:** one real provider first; add others only after the core tool contract and live tests work. Record provider/model, capabilities, normalized error class, retryability and usage where available.
- **Tool execution:** typed application tools for GitHub and approved integrations. Every call is validated, scoped, authorized, policy-checked, bounded, audited and returned with a structured result.
- **Durable state:** Neon Postgres for users/workspaces, conversations/messages, runs, ordered run events, tool calls, approvals, usage and integration metadata.
- **Canonical code state:** GitHub repositories, branches, commits, diffs and pull requests.
- **Remote verification:** GitHub Actions, with actual job/step logs and exit/status evidence.
- **Optional local execution:** a separately authenticated Node.js companion on the user's machine. No shell on the Worker and no browser terminal.
- **Production diagnostics:** Cloudflare observability/log integration after the core coding and verification loop is dependable.

### Run lifecycle (target contract)

A run should have explicit, persisted transitions such as:

`queued → running → waiting_for_approval → running → succeeded | failed | cancelled | interrupted`

Only valid transitions are accepted. The implementation must define:
- atomic/idempotent claiming so two requests do not execute the same run;
- stable run, step, tool-call and event identifiers;
- ordered events and a way to replay events after reconnect;
- a clear distinction between client disconnect and task cancellation;
- user-requested cancellation and provider/tool timeouts;
- bounded retries with retryability rules and idempotency protection;
- stale-work detection based on observed execution/heartbeat/lease behavior—not an arbitrary timeout alone;
- resume semantics that do not repeat already completed side effects;
- durable approval requests tied to the exact pending tool call, approved by an authenticated user and resumed at most once;
- a final state and error visible in both UI and database.

**Important:** the existing request/SSE execution pattern does not by itself prove durable background execution. Cloudflare Workflows is a candidate to evaluate for durable orchestration, not an automatic decision: its free tier has usage limits, and it must be compared against the current Worker + Neon design with a small proof of concept before adoption. Neon remains the source of truth for Forge records even if an execution runtime is added.

## 4. UI and presentation requirements

The workspace should make the system's real state understandable:

1. **Workspace/repository context:** signed-in identity, selected workspace, repository and working branch always visible.
2. **Task conversation:** user request and final answer, with a way to inspect prior tasks.
3. **Run activity timeline:** model turn, tool requested, permission decision, tool started/completed/failed, retry, test run and final state. Show timestamps and durations where available.
4. **Plan and progress:** distinguish the model's proposed plan from completed actions and evidence.
5. **Tool permission UI:** explain the exact action, target, risk and consequences; allow approve/deny when policy requires it.
6. **Code review:** changed-file list, unified diff, branch/commit links, conflict/error detail and explicit merge/deploy boundary.
7. **Checkpoint/restore:** make the saved checkpoint and rollback action visible. Never silently rewrite the default branch or production state.
8. **Run controls:** stop, retry where safe, resume after a valid pause/interruption, and copy diagnostic details.
9. **Usage/limits:** show model/provider and usage when available, retry count, elapsed time, and when a provider or free-tier limit blocks progress.
10. **Honest states:** loading, waiting, partial success, blocked, failed and cancelled must not be presented as success.

Do not redesign the entire interface before a basic real workflow exists. Implement the UI in increments against the event contract so the backend and frontend do not invent different lifecycle semantics.

## 5. Tools, autonomy and permissions

Use a consistent decision order:

1. authenticate the user and establish workspace/repository scope;
2. validate tool name, schema, path, arguments and output bounds;
3. deny prohibited actions;
4. ask for approval when policy requires it;
5. execute only after authorization;
6. record a redacted audit event and structured result;
7. return the result to the model and UI.

Initial tool groups:
- **Read-only repository:** repository metadata, branch/tree/file reads, diffs and relevant GitHub workflow results.
- **Repository writes:** work-branch creation, file create/update, commit and pull-request preparation. Require non-default branch scope, current blob SHA/conflict handling, audit and reviewable results.
- **Verification:** dispatch/inspect GitHub Actions, retrieve bounded logs, diagnose failures and attempt limited repairs.
- **Local execution (later):** only through the companion with device authentication, command policy, approval, working-directory restriction, timeout, output bounds and cleanup.
- **Cloudflare diagnostics (later):** least-privilege access and secret/PII redaction.

Tool-routing instructions can guide the model, but are not sufficient on their own. Do not register powerful tools in contexts that do not need them. A tool should be available only when its capability, execution location and policy are valid for the current run.

## 6. Database decision: Neon Postgres vs Cloudflare D1

**Decision: keep the existing Neon Postgres database for Forge's core application state. Do not migrate to D1 in this rebaseline. Revisit only if measured needs justify it.**

SQL is a query language, not a single database engine. PostgreSQL is a relational database engine that uses SQL. Cloudflare D1 is a managed database built on SQLite and uses SQLite-compatible SQL semantics. They are not interchangeable merely because both support SQL.

| Consideration | Neon Postgres (current) | Cloudflare D1 |
|---|---|---|
| Existing state | Already configured; current Forge project and schema exist | Requires schema conversion, migration and data verification |
| Free storage | Neon announced 1 GB per Free project on 2026-10-02; confirm current account quota in the dashboard | 500 MB per database, 5 GB total per Free account according to current D1 limits |
| Free usage shape | 100 compute-hours/project/month, scale-to-zero, up to 2 CU; current plan also lists 5 GB monthly public network transfer | 5 million rows read/day, 100,000 rows written/day; free-tier limits are enforced and queries fail until daily reset when exceeded |
| Runtime fit | External Postgres service; use the existing serverless driver and pooled connection where appropriate | Native Worker binding and Cloudflare integration; fewer external network/provider pieces |
| SQL semantics | Full PostgreSQL compatibility and ecosystem | SQLite semantics; differences in types, SQL functions, migrations and advanced PostgreSQL features must be accounted for |
| Concurrency | PostgreSQL concurrency and transaction model | Each individual D1 database processes queries serially; query duration affects throughput |
| Branching/recovery | Neon branches and a 6-hour instant-restore window on current Free plan; also keep independent exports | D1 Free includes 7-day Time Travel according to current limits |
| Portability | Standard PostgreSQL tools and broad host compatibility | More Cloudflare/SQLite-specific assumptions if code relies on D1 bindings or SQLite syntax |
| Operational simplicity | Already wired and tested through management tooling; Worker connection still needs end-to-end verification | Simpler Worker binding path, but migration and future portability costs are not free |

### Why Neon is the lower-risk decision now

- The existing database is already in place and currently contains the application schema. A migration would introduce risk without a demonstrated capacity or cost problem.
- Forge needs ordered events, transactions, relationships, run claims, tool audit, approval state and future workspace access controls. PostgreSQL is a strong fit for these relational and transactional requirements.
- Neon is currently within its free allowance according to the inspected project state; current logical size is about 33 MB against a 1 GB branch limit. That is a snapshot, not a guarantee of future quota.
- D1's Cloudflare proximity is useful, but its SQLite semantics, 500 MB per-database cap and enforced daily read/write quotas are not an unambiguous upgrade.
- A database migration would not solve the main current problems: run lifecycle, tool hangs, permissions, event replay, UI clarity or provider reliability.

### Portability and recovery rules to avoid a future scramble

- Keep SQL and schema changes in versioned migration files in the repository; never make undocumented production-only schema edits.
- Keep database access behind the existing repository/data-access layer. Do not scatter raw queries throughout UI or controller code.
- Avoid introducing provider-specific database features without recording the reason. Where PostgreSQL-specific behavior is necessary for correctness, document it rather than pretending it is portable.
- Maintain a repeatable export/restore procedure and test it before relying on it. Neon instant restore is useful but is not a substitute for an independent export.
- Treat D1 migration as a planned project with schema conversion, data export/import, row-count/content checks, application tests and rollback—not as a provider toggle.
- Use GitHub for source/checkpoints; store metadata and bounded event/result records in Postgres. Add object storage only when real artifacts exceed reasonable database-record use.

**Database decision: APPROVED by the owner on 2026-10-15.** Keep Neon as the primary database. Do not migrate to D1 or introduce a second database in the current work.

A future backup database/backup layer may be considered for resilience, but it is out of scope until the primary system, backup objectives, restore procedure and consistency model are established. It must not become a second writable source of truth by accident. A longer-term product idea is to let each customer retain stronger ownership/control of their own database and connected services; this is a future product/business requirement, not an implementation requirement for the current personal-use build.

## 7. Persistence, files and checkpoints

- **GitHub:** canonical source files, branches, commits, pull requests and code-review history.
- **Neon:** identities, workspace/repository bindings, conversations/messages, run records, ordered events, tool calls/results, approval decisions, usage and integration metadata.
- **Large outputs/artifacts:** keep bounded summaries in Postgres. Add R2 or another object store only when a real need exists; store references, checksums, size, content type and retention metadata in Postgres.
- **Checkpoints:** use work branches and commits as the durable source-code checkpoints. A local Git shadow/snapshot repository, as used by desktop agents, is only relevant if Forge later owns a local working tree. Do not invent a second source-of-truth snapshot system while GitHub API editing is the primary workflow.
- **Retention:** define retention separately for conversation content, tool output, logs, artifacts and audit records. Avoid storing secrets or unbounded raw logs.
- **Recovery:** document how to export the database and recover GitHub-backed work independently.

## 8. Provider and free-tier strategy

- Make one real provider reliable first. Keep the provider adapter independent of the controller and UI.
- Maintain a capability record per provider/model: tool calling, structured output, streaming, context limits, usage reporting, retryable errors and known restrictions.
- Do not assume that OpenAI-compatible endpoints behave identically.
- Set maximum model turns, tool calls, repair attempts, elapsed time, input/output size and estimated usage per run.
- Retry only classified transient errors and only when repeating the operation is safe. Respect provider retry hints; do not retry invalid requests, denied permissions or exhausted quotas blindly.
- Distinguish provider quota failure from tool failure, application bug, cancellation and user approval wait.
- Keep credentials server-side, never send keys to the model, and redact tokens, database URLs and sensitive output.
- Treat free-tier quotas as hard operational constraints. Show a useful blocked state rather than silently looping or claiming success.

## 9. Security, observability and testing

Security baseline:
- authorization scoped by user, workspace, repository and selected branch;
- deny-by-default for unrecognized/high-risk capabilities;
- explicit approval for consequential writes or execution;
- strict argument/path validation and bounded input/output;
- encrypted credentials, server-side secrets and redaction;
- CSRF/origin/session protection, rate limits and abuse controls;
- no automatic merge or production deploy;
- audit of permission decisions and consequential actions.

Observability baseline:
- stable correlation IDs for conversation, run, event and tool call;
- normalized error classes, timestamps, durations, retry count and final state;
- redacted structured logs;
- traceable model/tool sequence and usage when available;
- diagnostics sufficient to explain why a run is waiting, failed or interrupted.

Testing baseline:
- unit tests for state transitions, policy, provider normalization, argument validation and idempotency;
- integration tests for Neon persistence, GitHub reads/writes and event replay;
- failure injection for provider timeout, GitHub rate limits, stale SHA, duplicate request, disconnect, cancellation and interrupted work;
- end-to-end test of a real code change on a non-default branch;
- browser acceptance for activity, diff, failure and resume states;
- restore/export drill before claiming recovery readiness.

## 10. Rebaselined delivery phases

These are the **current product phases**. Historical technical Phase 0–7 documents and old phase branches remain historical evidence; do not delete or merge them blindly.

### Phase 0 — architecture, baseline and data decision (this planning gate)
- Approve the target architecture and database decision.
- Audit the actual current source, provider configuration, run/event schema and UI paths.
- Record the main SHA, existing test/build state and live-verification gaps.
- Confirm database migration/export approach and free-tier budget assumptions.
- **Gate:** owner-approved plan and an evidence-based baseline. No broad refactor.

### Phase 1 — reliable core GitHub coding workflow
- Complete one real provider path and typed GitHub read/write tools.
- Bind each run to a user, workspace, repository and non-default work branch.
- Add safe file edits, SHA/conflict handling, read-back, diff/commit links and audit.
- Persist conversation, run, tool results and important events.
- Deliver the core UI: task history, activity, changed files, diff and honest status.
- Include minimum run safeguards: single-run claim, bounded tool/model turns, visible errors, and safe cancellation/timeout behavior.
- **Gate:** a real AI-triggered file change is confirmed in GitHub, read back, visible as a diff/commit, and retained after reload. Do not advance if unverified.

### Phase 2 — autonomous runtime reliability and recovery
- Finalize explicit run/step/tool state machines and ordered event replay.
- Test duplicate submissions/subscribers, disconnects, cancellation, timeouts, interrupted runs and recovery.
- Add idempotency keys, leases/heartbeats or other evidence-based stale-work detection, safe retry rules and persisted approval/resume.
- Evaluate Cloudflare Workflows against the current Worker + Neon design using a small measured proof of concept before choosing it.
- Add trace/correlation IDs and run budgets.
- **Gate:** a controlled failure/reconnect test proves the same side effect is not repeated and the run ends in an accurate recoverable/terminal state.

### Phase 3 — GitHub Actions verification and bounded repair
- Trigger or inspect real workflows; show jobs, steps and filtered/redacted logs.
- Let the model diagnose real failures and apply bounded corrections through Phase 1 tools.
- Limit repair attempts and show usage/limits.
- **Gate:** a deliberately failing test/build is diagnosed, corrected, rerun and reported accurately; no automatic merge/deploy.

### Phase 4 — optional local Node.js companion
- Durable device identity, authentication, revocation and work contracts.
- Command allow/ask/deny policy, working-directory restrictions, approval and exact-call resume, timeout, cancellation, output bounds and cleanup.
- Never silently change execution location when the device is unavailable.
- **Gate:** an approved command runs on the intended device and its result is securely associated with the correct run.

### Phase 5 — Cloudflare diagnostics and production troubleshooting
- Least-privilege account connection and supported logs/observability sources.
- Filtering, redaction, correlation to source/commit and proposed fixes.
- Verify fixes through Phase 3; production deployment remains separately approved.
- **Gate:** a real diagnostic can be traced to a reviewable, verified source fix without automatic production deployment.

### Phase 6 — providers, collaboration and product hardening
- Add providers one at a time after capability and live behavior testing.
- Add invited workspaces, roles, repository-level authorization and isolated settings/secrets.
- Finish security, accessibility, browser/E2E regression, retention, export/restore and free-tier monitoring.
- Remove legacy paths only after route parity and production behavior are verified.
- **Gate:** an invited user cannot access another user's repositories/secrets and the core workflows pass the regression suite.

## 11. Decisions still requiring evidence

Do not decide these from preference alone:
- whether Cloudflare Workflows is worth its free-tier step/storage limits for Forge's run loop;
- which provider should be the first production default, based on actual available credentials, quotas, tool-call reliability and cost;
- whether a separate object store is needed for artifacts;
- whether any local snapshot store is needed beyond GitHub branch/commit checkpoints;
- exact retry, heartbeat, lease and timeout values, based on observed provider/tool duration distributions and cancellation semantics;
- which UI acceptance test framework best fits the existing frontend.

## 12. Implementation protocol

For each increment, work directly on `main` as explicitly requested by the owner: inspect source and tests → state one goal and acceptance criteria → implement only that increment → run the relevant tests/build → inspect the diff → fix failures and repeat until the increment passes → record the exact result, test evidence and commit SHA → only then begin the next increment. Do not create a PR as the default workflow. Do not skip tests because work is on main. If a change cannot be verified, stop and report the blocker rather than moving forward. Production data changes, database migrations and production deployments still require explicit authorization.
