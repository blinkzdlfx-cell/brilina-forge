# Brilina Forge Architecture

## High-level topology

```
                         ┌──────────────────────────┐
                         │      Forge Web UI        │
                         │  App.tsx + TerminalPanel  │
                         └───────┬───────────┬──────┘
                                 │ SSE       │ WebSocket
                                 │ /api/*    │ terminal only
                                 ▼           ▼
                         ┌──────────────────────────┐
                         │  Fastify 5 application   │
                         │  helmet · rate-limit     │
                         │  origin + session guard  │
                         └───────┬───────────┬──────┘
                                 │           │
              ┌──────────────────┘           └───────────────┐
              ▼                                              ▼
   ┌────────────────────┐                        ┌────────────────────┐
   │  Agent Controller  │                        │ Execution Service  │
   │ policy · registry  │                        │ command policy     │
   │ observer · audit   │                        │ session lifecycle  │
   └────┬────────┬──────┘                        └─────────┬──────────┘
        │        │                                          │
        ▼        ▼                                          │
 ┌────────────┐  ┌───────────────────┐                       │
 │ AI runtime │  │   Tool Registry   │                       │
 │ src/ai/    │  │  github.* tools   │                       │
 │ provider   │  │  terminal.* tools │                       │
 │ registry   │  └─────────┬─────────┘                       │
 │ retry      │            │                                 │
 └─────┬──────┘            ├───────────────┐                 │
       │                   ▼               ▼                 │
       │           ┌──────────────┐  ┌────────────┐          │
       │           │ GithubService│  │ Local      │◄─────────┘
       │           └──────┬───────┘  │ worker     │
       │                  │          │ (disposable)│
       ▼                  ▼          └────────────┘
  AI provider        REST/GraphQL
  (OpenAI-           GitHub
   compatible)

   ┌───────────────────────────────────────────┐
   │             Neon / Lakebase Postgres      │
   │ users · workspaces · sessions ·           │
   │ conversations · messages · runs ·         │
   │ tool_calls · usage_records                │
   └───────────────────────────────────────────┘
```

Note: the execution worker shown is the **local** worker. A Google Cloud E2 adapter is not implemented (ADR-016).

## Architectural rules

### Rule 1 — Source ownership

GitHub owns source code.

### Rule 2 — Application state

Neon owns Forge state.

### Rule 3 — Execution

The execution worker owns only temporary execution state. It is disposable.

### Rule 4 — Orchestration

The Forge backend owns agent orchestration.

### Rule 5 — Model abstraction

The Agent Controller never depends directly on a provider SDK. Provider SDK-shaped code lives only in `src/ai/`.

### Rule 6 — GitHub abstraction

Application code never scatters raw GitHub API calls. All access goes through `GithubService`.

### Rule 7 — Tool boundary

Models request typed tools. Models do not receive arbitrary backend credentials or direct network access.

## Backend module map

The package layout as implemented:

```
src/
  server.ts            Fastify routes, plugins, run orchestration, SSE, terminal routes
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
      terminal.ts                 four terminal tools
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
  execution/
    types.ts           ExecutionService contract and terminal types
    command-policy.ts  classifyCommand
    local-worker.ts    LocalExecutionWorker
    socket.ts          Terminal WebSocket transport
  security/
    redact.ts          redactSecrets, redactValue
  phase4/
    model.ts           Phase4DeterministicModel
    events.ts          In-memory RunEventBus
web/src/
  App.tsx              Workspace shell, chat, tool activity, diff panel
  TerminalPanel.tsx    Terminal session UI
  api.ts               Same-origin API and socket wrappers
  types.ts             Shared browser types
db/migrations/         Ordered SQL migrations
```

## SSE versus WebSocket

The split is deliberate (ADR-013).

| Transport | Used for | Direction | Why |
|---|---|---|---|
| SSE | `/api/runs/:runId/events` — conversation and run lifecycle | server → browser | The chat stream is one-directional and benefits from automatic reconnection and simple per-event dispatch. |
| WebSocket | `/api/terminal/sessions/:sessionId/socket` — terminal output and `exec` | bidirectional | Terminal output arrives live while the client also submits commands. |

Consequences that are implemented, not aspirational:

- The SSE stream replays the in-memory run history on subscribe, then streams live, and closes on `run.completed` or `run.failed`. A 15-second comment heartbeat keeps the connection alive.
- The terminal socket replays a backlog of the last 200 log entries on connect, then streams live, and pings every 20 seconds.
- **The terminal socket exposes no raw-stdin write path.** Every command the browser can run is an `exec` message or a `POST .../exec` request, both of which classify the command first (ADR-015). The `ExecutionService.write` method exists in the contract but is not reachable from any route or socket message.
- Both transports are origin-checked, because a WebSocket handshake is not covered by the same-origin policy.

## Command policy

`src/execution/command-policy.ts` classifies every command before a worker runs it.

Order of evaluation in `classifyCommand`:

1. Empty command → `blocked`.
2. Length above 2000 characters → `blocked`.
3. Control characters → `blocked`.
4. Chaining, command substitution, redirection or embedded newlines (`; & | ` > $( << \n \r`) → `blocked`. One classified command cannot smuggle in another.
5. Block list → `blocked`. Destructive filesystem operations, disk writes, power-state changes, privilege escalation (`sudo`, `su -`), package publication, and the Windows equivalents.
6. Approval list → `approval-required`. Dependency installation, repository mutation, outbound network fetches, container execution, process termination, long-running dev servers, interactive terminal programs, remote host access, and environment inspection.
7. Executable not on the read-only inspection allow-list → `approval-required`. An unknown command never runs unattended.
8. Otherwise → `safe`.

The model cannot alter its own policy: the policy is applied inside the worker, after authorization, not by the caller.

**Current limitation:** `approval-required` is not a decision the system can yet resolve. The controller rejects an approval-required tool outright, and the HTTP/socket paths report the classification. An interactive approve/resume flow is future work.

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
2. Request: same-origin check on state-changing routes, SSE and the WebSocket.
3. Identity: HttpOnly `SameSite=Strict` session cookie, server-side session lookup in Neon.
4. Authorization: user + workspace scoping on every conversation, run and terminal route; workspace + user scoping on terminal sessions.
5. Input: UUID and session-id validation, branch/title validation, GitHub path and ref validation.
6. Execution: command classification, worker environment allow-list, execution-root containment.
7. Output: secret redaction on persisted audit values, generic `internal_error` responses, `publicRunFailure` filtering over SSE.

## Future extensibility

The architecture should allow:
- a Google Cloud E2 execution adapter behind the same `ExecutionService` contract
- GitLab service
- Bitbucket service
- Docker execution worker
- additional AI providers registered in `createProviderRuntime`
- additional tool families
- persisted run-event history and a DB-backed OAuth state store

without changing the conversation model or Agent Controller contract.


---

## Current deployment architecture: native Cloudflare Worker

The original architecture described a Node/Fastify API with a local execution worker. That is no longer the target production runtime.

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

The Worker uses standard Fetch APIs and Web Streams. Neon remains the durable application database. GitHub remains the source of truth for repository code.

The local shell execution service is outside this runtime. Future execution is an adapter concern and may use Codespaces or a local Brilina Agent.

Do not add new API behavior to `src/server.ts`. New application routes belong in `worker/api.ts`.

The run stream now atomically claims a queued run and executes the Agent Controller while the SSE connection remains open. This removes production dependence on process-local run ownership and event history.

See [Native Worker migration](NATIVE_WORKER_MIGRATION.md) for the implementation record and [Cloudflare deployment](CLOUDFLARE_DEPLOYMENT.md) for deployment configuration.
