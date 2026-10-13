# Brilina Forge Architecture

## High-level topology

```
                          ┌──────────────────────────┐
                          │      Forge Web UI        │
                          │  App.tsx (chat + diff)   │
                          └───────────┬──────────────┘
                                      │ SSE /api/*
                                      ▼
                          ┌──────────────────────────┐
                          │  Fastify 5 application   │
                          │  helmet · rate-limit     │
                          │  origin + session guard  │
                          └───────────┬──────────────┘
                                      │
               ┌──────────────────────┘
               ▼
  ┌────────────────────┐
  │ Agent Controller   │
  │ policy · registry  │
  │ observer · audit   │
  └────┬───────┬───────┘
       │       │
       ▼       ▼
┌────────────┐  ┌───────────────────┐
│ AI runtime │  │   Tool Registry   │
│ src/ai/    │  │  github.* tools   │
│ provider   │  └─────────┬─────────┘
│ registry   │            │
└─────┬──────┘            │
      │                   ▼
      │           ┌──────────────┐
      │           │ GithubService│
      │           └──────┬───────┘
      │                  │
      ▼                  ▼
 AI provider        REST/GraphQL
 (OpenAI-           GitHub
  compatible)

    ┌───────────────────────────────────────────┐
    │             Neon / Lakebase Postgres      │
    │ users · workspaces · sessions ·           │
    │ conversations · messages · runs ·         │
    │ tool_calls · usage_records                │
    └───────────────────────────────────────────┘

  Commands do not run here. The Forge server has no shell and no
  child_process. When a command needs to execute, the browser asks the
  user's machine, which runs a small local Node companion and streams the
  output back over SSE. See [Plan — Local execution](PLAN_LOCAL_EXECUTION.md).
```

Note: the Forge server holds **no execution state**. There is no server-side
worker, no browser terminal, and no WebSocket PTY. Execution lives on the
user's machine behind a command-policy boundary (ADR-018).

## Architectural rules

### Rule 1 — Source ownership

GitHub owns source code.

### Rule 2 — Application state

Neon owns Forge state.

### Rule 3 — Execution

Commands run on the user's machine, never on the Forge server. The companion
is disposable: it holds only temporary execution state and the per-machine
approval store. See [Plan — Local execution](PLAN_LOCAL_EXECUTION.md).

### Rule 4 — Orchestration

The Forge backend owns agent orchestration.

### Rule 5 — Model abstraction

The Agent Controller never depends directly on a provider SDK. Provider SDK-shaped code lives only in `src/ai/`.

### Rule 6 — GitHub abstraction

Application code never scatters raw GitHub API calls. All access goes through `GithubService`.

### Rule 7 — Tool boundary

Models request typed tools. Models do not receive arbitrary backend credentials or direct network access.

### Rule 8 — No server-side shell

The Forge server has no `child_process`, no local filesystem execution, and no
browser terminal. Command classification happens in the companion, not on the
server.

## Backend module map

The package layout as implemented:

```
src/
  server.ts            Fastify routes, plugins, run orchestration, SSE (local dev only)
  start.ts             Neon session store, graceful shutdown, listen
  config.ts            Environment-backed configuration
  web-serving.ts       Built frontend static files and SPA fallback
  auth/
    github.ts          PKCE authorization URL, token exchange, refresh, state binding
    session.ts         SessionStore boundary and cookie parsing
  github/
    client.ts          GitHub REST + GraphQL transport
    service.ts         Semantic GitHubService (repos, branches, tree, file, compare, commits)
  db/
    client.ts          Neon serverless SQL client
    crypto.ts          AES-256-GCM token encryption and session hashing
    repositories.ts    Users, workspaces, members, GitHub connections, sessions
    conversation-repositories.ts
    agent-repositories.ts   Run and tool-call audit (redacted on write)
    audit-repositories.ts   Run audit read and run listing
    usage-repositories.ts   usage_records writes
  agent/
    types.ts           Provider-neutral controller contracts, AgentObserver, lifecycle
    registry.ts        Typed tool registry
    context.ts         Bounded model context assembly
    policy.ts          Tool policy evaluation and authorization boundary
    run-state.ts       Run lifecycle state machine
    controller.ts      The controller loop
    tools/
      github-read-repository.ts   github.get_repository
      github-read-context.ts      five further GitHub read tools
  ai/
    types.ts           AiProvider, AiProviderError, AiMessage, AiStreamEvent, AiModelResult
    errors.ts          HTTP status classification, retry-after parsing, transport errors
    openai-compatible.ts  OpenAI-compatible chat/completions adapter with SSE streaming
    deterministic.ts   DeterministicDevelopmentProvider
    registry.ts        ProviderModelRegistry
    retry.ts           withCooldownRetry
    retry-model.ts     wrapWithCooldownRetry for AgentModel
    provider-model.ts  ProviderAgentModel, toAiMessages
    factory.ts         createProviderRuntime (key-gated activation)
  security/
    redact.ts          redactSecrets, redactValue
  phase4/
    model.ts           Phase4DeterministicModel
    events.ts          In-memory RunEventBus
web/src/
  App.tsx              Workspace shell, chat, tool activity, diff panel
  api.ts               Same-origin API wrappers
  types.ts             Shared browser types
db/migrations/         Ordered SQL migrations
```

Execution is not in this tree. It lives in the companion, which is built as a
separate small Node service. See [Plan — Local execution](PLAN_LOCAL_EXECUTION.md).

## Transport

Only SSE is used (ADR-013). There is no WebSocket: the browser never holds a
shell, so there is nothing bidirectional to stream.

| Transport | Used for | Direction | Why |
|---|---|---|---|
| SSE | `/api/runs/:runId/events` — conversation and run lifecycle | server → browser | The chat stream is one-directional and benefits from automatic reconnection and simple per-event dispatch. |

Consequences that are implemented, not aspirational:

- The SSE stream replays the in-memory run history on subscribe, then streams live, and closes on `run.completed` or `run.failed`. A 15-second comment heartbeat keeps the connection alive.
- The stream is origin-checked, because a WebSocket handshake is no longer the concern it was when the terminal lived on the server.

## Command policy

Command classification lives in the companion, not on the Forge server. The
same `classifyCommand` logic is reused so the server and the companion cannot
drift.

Order of evaluation in `classifyCommand`:

1. Empty command → `blocked`.
2. Length above 2000 characters → `blocked`.
3. Control characters → `blocked`.
4. Chaining, command substitution, redirection or embedded newlines (`; & | \` > $( << \n \r`) → `blocked`. One classified command cannot smuggle in another.
5. Block list → `blocked`. Destructive filesystem operations, disk writes, power-state changes, privilege escalation (`sudo`, `su -`), package publication, and the Windows equivalents.
6. Approval list → `approval-required`. Dependency installation, repository mutation, outbound network fetches, container execution, process termination, long-running dev servers, interactive terminal programs, remote host access, and environment inspection.
7. Executable not on the read-only inspection allow-list → `approval-required`. An unknown command never runs unattended.
8. Otherwise → `safe`.

The model cannot alter its own policy: the policy is applied inside the
companion, after authorization, not by the caller.

Evaluation order is **blocked → approval-required → safe**, matching Claude
Code's `deny → ask → allow` and Codex's `forbidden → prompt → allow`.

## Agent Controller boundary

The Agent Controller owns orchestration, not provider-specific behavior or infrastructure implementation.

Its inputs are:
- authenticated principal
- conversation/run identifiers
- bounded user/model context
- registered typed tools
- model decisions through a provider-neutral interface
- an optional observer for tool lifecycle events
- an optional lifecycle hook for cooperative cancellation

Its responsibilities are:
- create and transition runs
- expose only registered tool schemas
- validate tool arguments
- evaluate tool policy and authorization
- execute typed tools
- append structured tool results to model context, and record the assistant tool-call turn so provider message protocols stay valid
- inject the active repository/branch as a system context message
- persist run/tool-call audit state
- enforce a maximum step count
- stop at a step boundary when cancellation is requested

The controller does not:
- call provider SDKs directly
- execute arbitrary shell commands
- access GitHub outside `GithubService`
- load an entire repository by default
- receive or expose raw credentials

## AI provider runtime

```
createProviderRuntime()
  → DeterministicDevelopmentProvider always registered
  → OpenAiCompatibleProvider registered only when AI_PROVIDER_API_KEY is set
  → ProviderModelRegistry resolves model → provider
  → ProviderAgentModel adapts AiProvider to the AgentModel contract
  → wrapWithCooldownRetry adds provider-aware cooldown retry
```

Key properties:

- Provider activation is key-gated. With no key, the deterministic adapter remains the active model and the rest of the system behaves identically (ADR-014).
- Provider failures are normalized into `AiProviderError` with a classified `kind` and `retryAfterMs`. The API key never appears in an error message.
- Timeouts use `AbortSignal.timeout`, composed with the run's cancellation signal via `AbortSignal.any`.
- `runs.provider` / `runs.model` and a `usage_records` row are written for every run.

## GitHub context pipeline

```
conversation repository + branch
→ repository metadata
→ branch metadata
→ tree
→ relevant paths
→ file reads
→ context assembly
→ token/context budget check
→ model
```

The context service may cache where safe, but cache invalidation must respect commit/branch changes. A conversation with no bound repository cannot use the GitHub read tools at all.

## Agent execution pipeline

```
message
→ create run
→ inject active development context
→ invoke model (with cooldown retry and cancellation signal)
→ receive tool call
→ validate schema
→ evaluate policy
→ authorize (identity → workspace → repository)
→ execute
→ persist redacted result
→ append result and assistant tool-call turn to model context
→ continue
→ finish run
→ release run event history
```

## Security layering

See [Security](SECURITY.md) for the full control list. The layers in execution order:

1. Transport: helmet headers, rate limiting, 256 KB body limit, `trustProxy`.
2. Request: same-origin check on state-changing routes and the SSE stream.
3. Identity: HttpOnly `SameSite=Strict` session cookie, server-side session lookup in Neon.
4. Authorization: user + workspace scoping on every conversation and run route.
5. Input: UUID and session-id validation, branch/title validation, GitHub path and ref validation.
6. Execution: command classification, companion environment allow-list, device verification on first use.
7. Output: secret redaction on persisted audit values, generic `internal_error` responses, `publicRunFailure` filtering over SSE.

## Future extensibility

The architecture should allow:

- additional AI providers registered in `createProviderRuntime`
- additional tool families
- GitLab and Bitbucket services
- persisted run-event history and a DB-backed OAuth state store
- a future execution adapter (Codespaces, Docker, or another machine)

without changing the conversation model or Agent Controller contract.

---

## Current deployment architecture: native Cloudflare Worker

The original architecture described a Node/Fastify API with a local execution
worker. That is no longer the target production runtime.

The current target is:

```
Browser
   |
   v
Cloudflare Worker
   |-- React Static Assets
   |-- Auth/session
   |-- GitHubService
   |-- Conversations
   |-- Agent Controller
   |-- AI provider
   |-- SSE
   |
   v
Neon Postgres
```

The Worker uses standard Fetch APIs and Web Streams. Neon remains the durable
application database. GitHub remains the source of truth for repository code.

Execution is outside this runtime. It runs on the user's machine through the
companion, which is built as a separate small Node service. See
[Plan — Local execution](PLAN_LOCAL_EXECUTION.md).

`src/server.ts` is the local development runtime. Do not add new application
behavior to it. New application routes belong in `worker/api.ts`, and new
companion endpoints belong in the companion service.

The run stream atomically claims a queued run and executes the Agent
Controller while the SSE connection remains open. This removes production
dependence on process-local run ownership and event history.

See [Native Worker migration](NATIVE_WORKER_MIGRATION.md) for the implementation record and [Cloudflare deployment](CLOUDFLARE_DEPLOYMENT.md) for deployment configuration.
