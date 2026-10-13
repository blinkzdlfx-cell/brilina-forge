# Brilina Forge — Agent Handoff

Read this before changing code. It records the product boundaries, accepted decisions, current status, live verification results, remaining gaps, and the safe continuation process.

## Product purpose
Brilina Forge is a private, GitHub-centered AI-assisted software development workspace, initially for the owner and a small trusted group. It is a controlled engineering workflow, not simply a chatbot with a terminal attached.

## System ownership
- **GitHub:** canonical source for code, branches, commits, and pull requests.
- **Neon Postgres:** durable Forge application state, users, workspaces, sessions, conversations, messages, runs, tool audit, and usage records.
- **Forge backend:** authentication boundary, API, Agent Controller, policy, provider adapters, execution policy, and coordination.
- **Browser:** React client that calls Forge APIs only.
- **Execution:** runs on the user's own machine through a small local Node companion. The companion is disposable and holds only temporary execution state and the per-machine approval store. There is no server-side shell, no VPS cost, and no browser terminal.

Never run commands on the Forge server. Do not install OpenCode or Kilo Code on the companion in the current architecture.

## Status at handoff
The working tree contains uncommitted Phase 4–7 work on top of `main` (last commit `1676d1c`). Pull, inspect `git status`, and confirm what is actually present before relying on commit references.

| Phase | Scope | Status |
|---|---|---|
| 0 | Documentation | Complete |
| 1 | GitHub foundation | Complete |
| 2 | Neon persistence | Complete |
| 3 | Agent Controller | Complete |
| 4 | Chat UI | Complete in code; browser acceptance not performed |
| 5 | AI provider abstraction | Complete in code; adapter unit-tested only, no live provider key used |
| 6 | Local execution (companion) | **not started** |
| 7 | Verification and hardening | Controls implemented and tested; live end-to-end verification outstanding |

## What the previous agent completed

### Phase 4 — Chat UI and tool-activity surface

- `AgentController` accepts an optional `AgentObserver` and emits `tool.requested`, `tool.started`, `tool.completed`, `tool.rejected` and `approval.required`, each carrying the provider `callId` (`src/agent/types.ts`, `src/agent/controller.ts`).
- The controller injects an "Active development context" system message (repository + branch) into model context and records the assistant tool-call turn so provider protocols remain valid.
- SSE `RunEventBus` wiring lives in `src/server.ts`; `src/phase4/events.ts` caps history at `MAX_HISTORY_PER_RUN = 500`, supports `release(runId)` and `sweep(ttl)` (default 15 minutes, swept every 5 minutes).
- Six GitHub read tools registered: `github.get_repository`, `github.get_repository_context`, `github.list_branches`, `github.get_tree`, `github.read_file`, `github.get_diff` (`src/agent/tools/github-read-context.ts`). They deny when no repository is bound to the conversation, case-insensitively.
- `Phase4DeterministicModel` now issues a real tool call when a repository is bound and the message shows inspection intent.
- Frontend: sign-in gate driven by `GET /api/session` with `POST /auth/github/logout`; tool-activity cards keyed by `callId`; streaming cursor; `tool.rejected` handling; branch-comparison diff panel backed by `GET /api/github/repos/:owner/:repo/compare`.

### Phase 5 — AI provider abstraction

- `src/ai/types.ts`: `AiProvider`, `AiProviderError` with classified `AiProviderErrorKind`, `AiStreamEvent`, `AiModelResult`.
- `src/ai/errors.ts`: `classifyHttpStatus`, `parseRetryAfterMs` (Retry-After seconds and HTTP-date, `x-ratelimit-reset-requests`/`x-ratelimit-reset` durations and epochs), `transportError`.
- `src/ai/openai-compatible.ts`: `OpenAiCompatibleProvider` over `chat/completions`, SSE streaming with tool-call reassembly across chunk indices, usage normalization, no secret in thrown errors, `AbortSignal.timeout`.
- `src/ai/registry.ts`: `ProviderModelRegistry`.
- `src/ai/retry.ts`: `withCooldownRetry` honoring `retryAfterMs`, exponential fallback, `maxCooldownMs` cap.
- `src/ai/retry-model.ts`: `wrapWithCooldownRetry` for an `AgentModel`.
- `src/ai/deterministic.ts`: `DeterministicDevelopmentProvider`.
- `src/ai/factory.ts`: `createProviderRuntime` — key-gated activation.
- `src/ai/provider-model.ts`: `ProviderAgentModel` and `toAiMessages`.
- `runs.provider` / `runs.model` are written by `updateRunProvider`; `usage_records` are written per run through `src/db/usage-repositories.ts`.

### Phase 6 — Local execution via the user's machine

**Not started.** The previous Phase 6 scope (a server-side execution worker with a
browser terminal) was superseded. Execution now runs on the user's own machine
through a small local Node companion. See [Plan — Local execution](PLAN_LOCAL_EXECUTION.md).

The companion:
- starts only when a command actually needs to execute, never when the AI is
  just planning
- verifies the machine on first use (one background call, no pairing ceremony)
- runs light read-only commands automatically and asks the user before risky
  commands
- streams output back to the browser over SSE

### Phase 7 — Hardening

Security, observability and recovery, and CI changes are listed in
[Phase 7 Hardening](PHASE_7_HARDENING.md). The summary:

- Origin validation on state-changing routes and the SSE stream.
- OAuth state bound to an HttpOnly browser cookie (login CSRF fix); session
  cookie `SameSite=Strict`; logout is `POST` with `GET` retained for older
  clients.
- `@fastify/helmet` (CSP `frame-ancestors 'none'`, framing `DENY`, `nosniff`,
  referrer policy) and `@fastify/rate-limit` (120/min keyed by session cookie
  then IP, `/health` allow-listed).
- UUID validation on conversation and run ids; generic `internal_error` instead
  of leaking database or provider messages.
- `redactSecrets` / `redactValue` applied to persisted `tool_calls.arguments`,
  `tool_calls.result`, `tool_calls.error_message` and `runs.error_message`.
- Workspace slug keyed on the immutable GitHub user id; `workspace_members`
  grant cross-join fixed.
- GitHub read tools deny when no repository is bound to the conversation.
- Branch name and conversation title validated to prevent prompt injection into
  the system context.
- Conversation `UPDATE` scoped by user and workspace.
- `web-serving` decodes the path, rejects backslashes, and verifies `realpath`
  containment.
- Detached run closure captures session and service before replying.
- Run message length capped at 8000; one active run per conversation.
- `POST /api/runs/:runId/cancel` (cooperative cancellation through
  `AgentRunLifecycle.shouldStop` and an `AbortController` passed to the
  provider), `GET /api/runs/:runId/audit` (ownership-checked via
  `getOwnedRunConversation`), `GET /api/conversations/:conversationId/runs`,
  `runEventBus.release` on completion plus a 5-minute sweep interval, and
  SIGINT/SIGTERM graceful shutdown in `start.ts`.
- CI (`.github/workflows/ci.yml`) runs `verify` and `security-audit`
  (`npm audit --audit-level=high` for backend and web).

The protections that were built around server-side execution — the WebSocket
raw-stdin removal, the worker environment allow-list, and origin validation on
a terminal socket — are no longer relevant once execution leaves the server.
They are recorded in [Phase 7 Hardening](PHASE_7_HARDENING.md) as history.

## Live verification results

The test suite reports **103 passing tests** (`npm test`, Node's built-in runner
via `tsx`). New test files added since the last handoff:

- `src/agent/controller.observer.test.ts`
- `src/agent/controller.cancellation.test.ts`
- `src/ai/openai-compatible.test.ts`
- `src/ai/retry.test.ts`
- `src/ai/provider-model.test.ts`
- `src/execution/local-worker.test.ts`
- `src/execution/socket.test.ts`
- `src/execution/api.test.ts`
- `src/phase4/model.test.ts`
- `src/security/redact.test.ts`
- `src/security/http.test.ts`

The `src/execution/*` tests cover the server-side execution layer that has since
been superseded by the companion. They remain in the suite for now.

**Limits of that verification — state these plainly:**

- No live AI provider key was configured. The OpenAI-compatible adapter is exercised against recorded/faked response shapes only.
- No GitHub OAuth application was registered for this work. OAuth callback, cookie state binding, and session persistence are tested with stubbed GitHub endpoints.
- No Neon-backed path was exercised end to end.
- A successful build and passing tests do not prove OAuth, Neon connectivity, live provider responses, or SSE behavior in a browser.
- The companion, device verification, and the approval UI have not been built.

## Remaining gaps

Do not claim these are done.

- **No companion.** Local execution via the user's machine has not been built.
- **No interactive approval flow.** Approval-required tools are permanently rejected; there is no approve/resume.
- **RunEventBus history is in-memory only** and is not persisted across restarts. `release()` and `sweep()` bound memory, they do not persist it.
- **OAuth state store is process-local in-memory.** A multi-instance deployment needs a DB-backed state store.
- **No pagination on `listConversationMessages`** (hard `LIMIT 1000`).
- **`GET /health` still reports `phase: 4`.** The field is stale.

## Accepted decisions
See docs/DECISIONS.md for full ADRs. Do not silently replace these:
- GitHub is canonical; execution is on the user's machine and the companion is
  disposable (ADR-001).
- Backend owns orchestration; no coding-agent framework on the companion (ADR-002).
- GitHub REST + GraphQL are hidden behind one GitHubService (ADR-003).
- Progressive task-relevant context; no complete repo dump by default (ADR-004).
- Small typed controller, not a large agent framework without a concrete need (ADR-006, ADR-010).
- No Git CLI requirement initially; GitHub APIs are primary (ADR-007).
- GitHub App user authorization, not legacy OAuth App (ADR-008).
- Neon stores durable state; Neon serverless driver + raw SQL, no ORM without justification (ADR-009).
- Current order is Phase 4 UI → Phase 5 AI → Phase 6 local execution → Phase 7 verification (ADR-011).
- Frontend is React + Vite + TypeScript in web/ (ADR-012).
- SSE for chat/run events. There is no WebSocket (ADR-013, superseded).
- OpenAI-compatible adapter as the first provider, activated only when an API key is present (ADR-014).
- Allow-list command policy; light commands run automatically, risky commands ask
  for consent, and some are blocked outright (ADR-018).
- OAuth state bound to a browser cookie (ADR-017).
- High-impact operations require policy checks and human control.

## Technology and source areas
Backend is TypeScript ESM, Fastify 5, Node.js >=20, with @neondatabase/serverless, @fastify/helmet, @fastify/rate-limit and @fastify/websocket. Frontend is React 19, Vite 7, TypeScript. Root package scripts build/test the backend and invoke web builds.

- `src/auth/`: GitHub authorization (PKCE, state binding) and the session store boundary.
- `src/github/`: API client and semantic GitHub service.
- `src/db/`: Neon client, AES-GCM token crypto, persistence repositories, audit and usage repositories.
- `src/agent/`: model-neutral types, tool registry, context, policy, run state, controller, GitHub read tools.
- `src/ai/`: provider-neutral AI contracts, OpenAI-compatible adapter, registry, retry, deterministic adapter, runtime factory, `ProviderAgentModel`.
- `src/security/`: secret redaction.
- `src/phase4/`: deterministic model and the in-memory run event bus.
- `src/server.ts`: Fastify routes, auth, run orchestration, SSE, plugins (local dev only).
- `src/start.ts`: configures the Neon session store, installs graceful shutdown, starts the server.
- `src/web-serving.ts`: built frontend static files and SPA fallback.
- `web/src/`: React application, API client, frontend types and styles.
- `db/migrations/`: ordered schema migrations.
- `docs/`: specifications, decisions, security, testing, roadmap and phase details.

Execution is not in this tree. It lives in the companion, which is built as a
separate small Node service. See [Plan — Local execution](PLAN_LOCAL_EXECUTION.md).

Inspect the actual tree and relevant source on the checked-out branch before coding.

## Backend and frontend contracts
The authoritative route inventory lives in `docs/DATABASE_AND_API_REFERENCE.md`. Inspect `src/server.ts` for exact schemas, validation and error behavior. Protected APIs derive user identity from the Forge session cookie.

SSE event names: `run.started`, `assistant.delta`, `tool.requested`, `tool.started`, `tool.completed`, `approval.required`, `tool.rejected`, `assistant.completed`, `run.completed`, `run.failed`. Frontend wrappers are in `web/src/api.ts`; shared browser types are in `web/src/types.ts`. Browser requests use same-origin relative API paths and `credentials`.

There is no WebSocket. The browser never holds a shell; command output comes back over SSE from the companion.

## Agent Controller
The controller calls a provider-neutral `AgentModel.next` contract, exposes registered typed tools, validates object/required arguments, checks policy and authorization, audits tool lifecycle, adds structured tool results to context, records the assistant tool-call turn, emits observer events, honors cooperative cancellation at step boundaries, and limits model steps (default 8). It does not call provider SDKs, execute arbitrary shell, or bypass GitHubService. Approval-required behavior is rejection with an approval message, not a pause/resume workflow.

## Database
Migration 001 creates `forge_users`, `workspaces`, `workspace_members`, `github_connections`, `repositories`, `auth_sessions`, `conversations`, `runs`, `tool_calls` and `usage_records`. Migration 002 creates `conversation_messages`. `runs` carries nullable `provider` and `model`. GitHub tokens are encrypted at rest with AES-256-GCM; the key is outside Neon. Session tokens are hashed and sessions are Neon-backed through `createNeonSessionStore`. See docs/DATABASE_AND_API_REFERENCE.md.

## Next recommended steps
1. Pull current `main` and inspect working-tree status.
2. Configure a local development `.env` without sharing secrets.
3. Run backend and frontend locally and record actual outcomes.
4. Fix only observed errors, adding tests for regressions.
5. Perform and record the live verification that is still missing: a real GitHub OAuth sign-in, a real provider key, a browser-driven terminal session, and a Neon-backed conversation.
6. Then decide on the GCP E2 adapter, the interactive approval flow, and persistent run-event history.

## Working protocol
- Discuss the plan before implementation.
- Read relevant specs, ADRs, roadmap, security and tests first.
- Separate observed evidence, recommendations, and decisions requiring owner approval.
- Gate architecture, auth, secrets, schema, permissions, infrastructure and provider choices.
- Do not invent data, routes, configuration, successful tests, or deployment state.
- Never report a feature as verified when only unit tests cover it.
- Keep changes focused, tests and docs synchronized; use a branch/PR unless explicitly told otherwise.
- Report exact commands and actual test results.


---

# Native Worker migration handoff

## Current implementation direction

The accepted production runtime is now a native Cloudflare Worker.

Do not extend the old Fastify server with new application behavior.

Primary Worker files:

- `worker/index.ts`
- `worker/api.ts`

The Worker directly handles the API and serves the React application through Workers Static Assets.

## Database decision

Keep Neon Postgres.

Do not migrate to D1 as part of this runtime migration. The existing Neon serverless driver and repository layer already work with the Worker model.

## Run execution model

A run is created in Neon as `queued`.

The browser then opens:

`GET /api/runs/:runId/events`

The first stream atomically claims the run and executes the Agent Controller while the SSE response remains open.

This replaces:

- process-local `activeRuns`
- process-local controller maps
- the in-memory run event bus as the production coordination mechanism
- detached background promises

The Worker uses the request abort signal for cooperative cancellation.

## Execution boundary

Do not reintroduce:

- `child_process`
- local shell execution
- local execution filesystem
- terminal WebSocket
- Fastify

A future execution adapter may connect Forge to Codespaces or a local Brilina Agent.

## Verification requirements

Before the migration is declared complete, verify:

1. Worker local startup
2. Worker build/deploy
3. `/health`
4. React shell
5. GitHub App OAuth
6. Neon-backed session
7. repository sync
8. conversation creation
9. deterministic run
10. real AI-provider run
11. SSE completion
12. request-disconnect cancellation

Do not report any of these as verified until the actual environment has been exercised.

See:

- [Native Worker migration](NATIVE_WORKER_MIGRATION.md)
- [Cloudflare deployment](CLOUDFLARE_DEPLOYMENT.md)
- [Architecture decisions](DECISIONS.md)
