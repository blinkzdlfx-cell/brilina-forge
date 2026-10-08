# Brilina Forge Roadmap

## Phase 0 — Documentation
Status: **complete**

## Phase 1 — GitHub foundation
Status: **complete**

Acceptance completed on 2026-09-22. Forge can authenticate, identify the account, discover repositories, inspect branches, retrieve repository context and read files while handling expiring authorization and malformed requests safely.

## Phase 2 — Neon persistence
Status: **complete**

Completed:
- Neon development and production branches established
- Forge persistence schema applied and verified
- Durable session store implemented
- GitHub credentials encrypted at rest
- Persistent authentication survives server restart
- Automatic GitHub token refresh is persisted to Neon
- Persistence and refresh acceptance passed
- Accepted schema migration applied to the Neon production branch

Acceptance completed on 2026-09-22:

> Application state survives restarts, GitHub credentials are protected at rest, and workspace/repository ownership constraints are enforced.

## Phase 3 — Agent Controller
Status: **complete**

Completed:
- typed tool contract
- tool registry
- schema validation boundary
- tool policy/authorization boundary
- run state machine
- bounded model context assembly
- deterministic controller loop
- deterministic fake model and in-memory audit store for controller tests
- Neon audit-store adapter
- real read-only GitHub repository tool adapter
- Phase 3 architecture and ADR documentation
- CI build and test verification

Acceptance completed on 2026-09-22:

> The controller can accept a provider-neutral model decision, validate and authorize a registered read-only tool, execute the typed tool, append its structured result to model context, and audit the run/tool lifecycle. Automated CI verified the build and 10 tests.

## Phase 4 — Chat UI
Status: **complete in code; browser acceptance not performed**

Detail: [Phase 4 Chat UI](PHASE_4_CHAT_UI.md).

Completed:
- branded Brilina Forge application shell
- responsive expandable/collapsible sidebar
- sign-in gate driven by `GET /api/session`, sign-out via `POST /auth/github/logout`
- conversation list and creation
- persistent conversation message history backed by Neon
- conversation history loading when reopening a chat
- chat composer with streaming cursor
- tool activity cards keyed by the provider `callId`, covering requested / running / completed / approval-required / rejected
- approval-required and tool-rejected presentation
- repository selector backed by the authenticated GitHub repository API
- branch selector backed by the selected repository's GitHub branches
- repository context synchronization into Forge's repository table
- conversation context update API for repository/branch selection
- branch comparison diff panel (`GET /api/github/repos/:owner/:repo/compare`)
- backend conversation, run-start and SSE run-event APIs
- deterministic Phase 4 model adapter that issues a real tool call for inspection intent
- Agent Controller tool-lifecycle observer wired to the SSE `RunEventBus`

Honest caveats:
- No automated UI acceptance test exists and no browser session has driven the built frontend through sign-in, run, tool activity, diff and terminal flows.
- The UI still labels the composer "Provider-neutral development mode" regardless of whether a live provider is active.

## Phase 5 — AI provider abstraction
Status: **complete in code; adapter unit-tested only, no live provider key used**

Detail: [Phase 5 AI Provider](PHASE_5_AI_PROVIDER.md).

Completed:
- `AiProvider` / `AiModelResult` / `AiStreamEvent` / `AiProviderError` contracts
- OpenAI-compatible `chat/completions` adapter with SSE streaming and tool-call reassembly across chunk indices
- usage normalization
- HTTP status classification into retryable and terminal kinds
- `Retry-After` and `x-ratelimit-*` parsing (seconds, HTTP-date, durations, epochs)
- cooldown retry honoring provider-supplied retry-after with exponential fallback and a cap
- `ProviderModelRegistry`
- `ProviderAgentModel` adapter onto the controller's `AgentModel` contract
- `DeterministicDevelopmentProvider` retained as the keyless development adapter
- `createProviderRuntime` with key-gated activation
- `runs.provider` / `runs.model` recorded per run
- `usage_records` written per run

Honest caveats:
- The adapter has never been run against a real provider endpoint. All evidence is unit tests against recorded/faked response shapes.
- The deterministic adapter remains the active model unless `AI_PROVIDER_API_KEY` is set. That is intentional, not a defect.
- There is no cost estimation: `usage_records.estimated_cost_usd` is left null.
- Token accounting falls back to message-length heuristics when the provider does not return usage.

## Phase 6 — E2 execution
Status: **complete against a local worker; Google Cloud E2 adapter not implemented**

Detail: [Phase 6 Execution](PHASE_6_EXECUTION.md).

Completed:
- `ExecutionService` contract with terminal session, log and exec types
- command policy: allow-list, block-list, approval list, chaining/substitution/redirection rejection, Windows command set
- disposable local execution worker with session lifecycle, LRU eviction, log cap, output cap, execution-root containment
- worker environment allow-list
- `exec` completion-marker protocol with drain window and output truncation
- terminal HTTP routes and a WebSocket transport with backlog replay, live streaming and heartbeat
- no raw-stdin write path on any transport
- four terminal tools registered in the Agent Controller
- frontend `TerminalPanel.tsx`

Honest caveats:
- The worker is `local-disposable`: it runs on the Forge host with **no isolation boundary** beyond the command-policy layer. It is not Google Cloud E2 and must not be treated as an E2 substitute in production.
- Worker processes are shell-backed per session, not true PTYs on Windows.
- Terminal sessions and their logs are in-memory only and are lost on restart.
- Approval-required commands are classified but cannot be approved interactively; the model-facing terminal tools are `approval-required` and therefore rejected by the controller.

## Phase 7 — Verification and hardening
Status: **controls implemented and tested; live end-to-end verification outstanding**

Detail: [Phase 7 Hardening](PHASE_7_HARDENING.md).

Completed:
- removal of the WebSocket raw-stdin path
- worker environment allow-list
- origin validation on state-changing routes, SSE and the WebSocket
- OAuth state bound to an HttpOnly browser cookie
- `SameSite=Strict` session cookie; logout is `POST`
- `@fastify/helmet` with CSP, framing `DENY`, `nosniff`, referrer policy
- `@fastify/rate-limit` at 120/min keyed by session cookie then IP
- UUID validation for conversation and run ids
- generic `internal_error` for unexpected failures
- secret redaction of persisted tool arguments, results, errors and run error messages
- workspace slug keyed on immutable GitHub user id; `workspace_members` cross-join fixed
- GitHub read tools deny when no repository is bound
- terminal sessions scoped to `userId`
- branch name and conversation title validation against prompt injection into system context
- conversation `UPDATE` scoped by user and workspace
- static serving path decode, backslash rejection and `realpath` containment
- detached run closure capture before reply; 8000-character run message cap; one active run per conversation
- `POST /api/runs/:runId/cancel` with cooperative cancellation
- `GET /api/runs/:runId/audit` and `GET /api/conversations/:conversationId/runs`
- `runEventBus.release` on completion plus a 5-minute sweep interval
- SIGINT/SIGTERM graceful shutdown
- CI `verify` and `security-audit` jobs
- test suite grew from 17 to 95 passing tests

Honest caveats:
- No live verification was performed: no provider key, no GitHub OAuth application, no browser-driven terminal session, no Neon-backed end-to-end run.
- Security testing is unit/integration level. There is no penetration test and no multi-instance deployment test.
- The OAuth state store, run event history and terminal sessions remain process-local.

## Forward-looking work

Not started. Ordered roughly by the risk they retire.

### Execution isolation
1. Google Cloud E2 adapter implementing `ExecutionService`, with provisioning, teardown, workspace hydration and a real PTY.
2. Decide whether the local worker is development-only behind a flag, or is removed entirely.
3. Move execution logs to durable storage if audit requires them.

### Human control
4. Interactive approval/resume flow: persist a pending tool call, expose an approve/reject API, and let the controller resume rather than reject.
5. Approval decisions with an audit record of who approved what.

### Durability and multi-instance
6. Persist run event history, or replace SSE replay with a durable log.
7. Move the OAuth state store to Neon so several instances can serve authorization.
8. Persist or explicitly discard terminal sessions across restarts.

### AI provider work
9. Live verification of the OpenAI-compatible adapter against a real endpoint, including streaming tool calls and rate-limit headers.
10. Streaming assistant text to SSE from the provider stream instead of chunking a completed response.
11. Cost estimation for `usage_records.estimated_cost_usd`.
12. Additional providers registered in `createProviderRuntime`; per-model capability checks against `AiModelDescriptor`.

### Scale and correctness
13. Pagination on `listConversationMessages` and conversation listing.
14. Update the stale `phase: 4` value reported by `GET /health`.
15. Automated UI acceptance tests against the built frontend.

## Rule
Do not skip a phase simply because a UI can be made to appear functional. A visible UI without proven backend contracts is not considered implementation complete. Equally, do not report a phase as verified when only unit tests cover it.


## Runtime migration — in progress

The production runtime is being moved from the old Node/Fastify server to a native Cloudflare Worker.

Completed in the migration branch:

1. Native Worker API entrypoint and routing.
2. Neon-backed Worker session/database integration.
3. Worker-native SSE run lifecycle.
4. Removal of terminal execution from the Worker design.
5. Documentation updates for deployment, architecture, API contracts and handoff.

Next migration steps:

6. Verify the Worker locally and in deployment.
7. Verify GitHub App OAuth and Neon-backed sessions against the deployed Worker.
8. Verify deterministic and real-provider runs through SSE.
9. Remove the legacy Fastify/terminal source and dependencies after route parity is proven.
10. Decide the future execution adapter independently of the API Worker.

The D1 database migration is intentionally not part of this work.
