# Database and API Reference

This reference describes the schema migrations and HTTP contracts currently present. Inspect current source for exact validation, response bodies, and status codes before modifying a contract.

## Data ownership
GitHub is canonical for repository source, branches, commits and pull requests. Neon Postgres stores Forge application state. The execution worker is disposable infrastructure; the currently implemented worker is a **local** worker, not Google Cloud E2. The backend uses @neondatabase/serverless and a small raw-SQL repository layer; an ORM is not currently used.

## Migrations
Apply SQL in order to the intended Neon branch. Confirm the branch before any migration.

### 001_initial_forge.sql
- **forge_users:** Forge identity linked to unique GitHub user ID and login.
- **workspaces:** workspace owned by a Forge user, with a unique slug.
- **workspace_members:** workspace membership with owner/admin/member role.
- **github_connections:** GitHub identity and encrypted access/refresh token fields, expiry and scopes.
- **repositories:** GitHub repository synchronized to a workspace, unique by workspace and GitHub node ID.
- **auth_sessions:** hashed session token, expiry and last-seen timestamps.
- **conversations:** user/workspace conversation with optional repository and branch context.
- **runs:** conversation execution status, nullable **provider** and **model**, timestamps and error.
- **tool_calls:** tool name, status, JSON arguments/result, errors and lifecycle timestamps.
- **usage_records:** provider/model, token counts, estimated USD cost, duration, retry count, status.

The migration enables pgcrypto for UUID generation and creates lookup indexes, including `idx_usage_records_provider_created` and `idx_runs_conversation_created`.

### 002_conversation_messages.sql
Creates conversation_messages with conversation ID, optional run ID, role (user/assistant/system/tool), content, optional tool name, JSON metadata and creation timestamp. Conversation deletion cascades; run deletion nulls the run reference. Indexes support chronological history and run lookup.

There is no migration 003. The `runs.provider` / `runs.model` columns were part of migration 001; they are not a later addition.

See db/migrations/*.sql for authoritative constraints and foreign keys.

### Provider and usage columns

`runs.provider` and `runs.model` are written by `updateRunProvider` (`src/db/agent-repositories.ts`) once the runtime resolves the active provider for a run. They are nullable, so pre-Phase-5 runs are simply `NULL`.

`usage_records` is written once per run by `recordUsage` (`src/db/usage-repositories.ts`) and contains:

| Column | Source |
|---|---|
| `run_id` | The run the usage belongs to. |
| `provider`, `model` | The active provider and model for the run. |
| `input_tokens`, `output_tokens` | Normalized provider usage. When the provider reports no usage, a message-length estimate is recorded instead. |
| `estimated_cost_usd` | Currently always `NULL`; no cost model is implemented. |
| `duration_ms` | Wall-clock duration of the run. |
| `retry_count` | Number of provider retries the run consumed. |
| `status` | `success`, `failed`, or `cancelled`. |

A usage row is also written on the failure path, and a failure to record usage never fails the run.

## Secrets
GitHub access and refresh tokens are encrypted using AES-256-GCM; ciphertext, IV and tag are stored separately. GITHUB_TOKEN_ENCRYPTION_KEY is a base64-encoded 32-byte application secret held outside Neon. Session tokens are hashed and sessions are stored in Neon (`createNeonSessionStore`). The browser gets an HttpOnly Forge session cookie, not GitHub tokens. Never log or expose secrets, and never commit .env.

## API routes
Protected routes require the Forge session cookie. Identity is derived server-side. This table is a route inventory, not a full OpenAPI schema.

### Health and authentication

| Method | Path | Purpose |
|---|---|---|
| GET | /health | Service health. Rate-limit allow-listed. Currently reports a stale `phase: 4`. |
| GET | /auth/github/start | Begin GitHub App user authorization; sets the OAuth state cookie and redirects. |
| GET | /auth/github/callback | Exchange code, verify state cookie binding, persist session, set session cookie. |
| POST | /auth/github/logout | Delete session and clear cookie. Origin-checked. |
| GET | /auth/github/logout | Same effect, retained only so an older client is not stranded. Prefer POST. |
| GET | /api/session | `{ authenticated, githubUser, tokenExpiresAt }`; returns `{ authenticated: false }` instead of an error when unauthenticated. Drives the frontend sign-in gate. |

### GitHub

| Method | Path | Purpose |
|---|---|---|
| GET | /api/github/me | Authenticated GitHub profile |
| GET | /api/github/repos?page=&per_page= | List accessible repositories (page and per_page capped at 100) |
| GET | /api/github/repos/:owner/:repo | Repository via GraphQL |
| GET | /api/github/repos/:owner/:repo/rest | Repository via REST |
| GET | /api/github/repos/:owner/:repo/context | Aggregated repository context |
| GET | /api/github/repos/:owner/:repo/branches | List branches |
| GET | /api/github/repos/:owner/:repo/tree?ref=&recursive= | File tree at a ref; `ref` required |
| GET | /api/github/repos/:owner/:repo/file/*?ref= | Read one file |
| GET | /api/github/repos/:owner/:repo/compare?base=&head= | Branch comparison; both refs required |
| GET | /api/github/repos/:owner/:repo/commits?ref=&per_page= | Commits at a ref (per_page 1–100, default 20) |
| POST | /api/github/repositories/sync | Sync selected repo into workspace state; rejects a mismatched `fullName` with 409 |

### Conversations and runs

| Method | Path | Purpose |
|---|---|---|
| GET | /api/conversations | List current user's conversations (max 100) |
| POST | /api/conversations | Create conversation; title and branch validated |
| PATCH | /api/conversations/:conversationId | Update repository/branch context; scoped by user and workspace |
| GET | /api/conversations/:conversationId/messages | Load persisted messages (`LIMIT 1000`, no pagination) |
| POST | /api/conversations/:conversationId/runs | Create run and start the controller asynchronously; returns 202. Message capped at 8000 characters; 409 if a run is already active for the conversation. |
| GET | /api/conversations/:conversationId/runs | Recent runs for the conversation with provider/model |
| GET | /api/runs/:runId/events | Ownership-checked SSE stream |
| GET | /api/runs/:runId/audit | Run record plus its tool-call audit trail; ownership checked via `getOwnedRunConversation` |
| POST | /api/runs/:runId/cancel | Cooperative cancellation; 404 if not owned, 409 if not cancellable |

### Terminal

| Method | Path | Purpose |
|---|---|---|
| GET | /api/terminal/sessions?conversationId= | List sessions in the caller's workspace |
| POST | /api/terminal/sessions | Open a session for a conversation the caller owns; returns 201 |
| GET | /api/terminal/sessions/:sessionId | Session state; scoped by workspace and user |
| GET | /api/terminal/sessions/:sessionId/output?since=&limit= | Buffered output (`limit` 1–2000, default 500) |
| POST | /api/terminal/sessions/:sessionId/exec | Classify and run one command; `timeoutMs` 1000–600000 |
| DELETE | /api/terminal/sessions/:sessionId | Kill the session |
| GET | /api/terminal/sessions/:sessionId/socket | WebSocket transport for live output and `exec` |

### Static frontend

| Method | Path | Purpose |
|---|---|---|
| GET | /* | Built frontend assets from web/dist with SPA fallback; path is decoded, backslashes rejected, and `realpath` containment verified |

Exact API behavior lives in src/server.ts; client wrappers and UI types live in web/src/api.ts and web/src/types.ts.

### Cross-cutting request rules

- State-changing routes (`POST`, `PATCH`, `DELETE`), the SSE stream and the WebSocket handshake are origin-checked against `PUBLIC_BASE_URL` and the callback origin. A disallowed `Origin` is a 403 (HTTP) or close code 4403 (socket).
- `conversationId` and `runId` must be UUIDs; terminal session ids must match `[A-Za-z0-9-]{8,64}`. Invalid identifiers are 400 before any database access.
- Authentication is checked before request-parameter validation.
- Errors raised by Forge's own validation and policy layers carry a `statusCode` and their message is returned. Anything else returns `500 { "error": "internal_error" }` and is logged server-side only.

## Agent and stream contracts
Run statuses: queued, running, completed, failed, cancelled, interrupted.
Tool statuses: requested, authorized, running, completed, failed, rejected.

SSE event names:

```
run.started
assistant.delta
tool.requested        { toolName, callId }
tool.started          { toolName, callId }
tool.completed        { toolName, callId }
approval.required     { toolName, callId }
tool.rejected         { toolName, callId, reason }
assistant.completed
run.completed         { runId, status }
run.failed            { runId, message }
```

SSE is server-to-browser: the browser cannot write to it. WebSocket is used only for the terminal. The event bus is in-memory, caps history at 500 events per run, is released when a run finishes, and is swept on a TTL (default 15 minutes, swept every 5 minutes). History is **not** persisted across restarts.

Terminal socket events: `session.ready`, `output`, `exec.completed`, `error`. The only accepted client message is `{ "type": "exec", "command": "..." }`. There is no raw-stdin message.

The controller exposes registered typed tools, validates basic object/required fields, applies policy and authorization, audits tool states/results, appends tool results and the assistant tool-call turn to context, checks cancellation at each step boundary, and uses a bounded loop (default maximum 8 steps). Current approval-required actions are rejected; interactive approval/resume is not implemented.

## Registered tools

| Tool | Policy | Authorization |
|---|---|---|
| github.get_repository | allowed | Conversation repository must match `owner/repo` |
| github.get_repository_context | allowed | same |
| github.list_branches | allowed | same |
| github.get_tree | allowed | same |
| github.read_file | allowed | same |
| github.get_diff | allowed | same |
| terminal.create_session | approval-required | Workspace present; conversation id format valid |
| terminal.exec | approval-required | Session belongs to the caller's workspace and user |
| terminal.read | allowed | Session belongs to the caller's workspace and user |
| terminal.kill | approval-required | Session belongs to the caller's workspace and user |

Because approval-required tools are rejected by the controller, the three approval-required terminal tools cannot currently be used by a model.

## Current limitations
- The AI provider adapter is unit-tested only; no live provider key has been exercised.
- The execution worker is a local worker with no isolation boundary. There is no Google Cloud E2 adapter.
- Approval-required commands and tools are rejected rather than approved interactively.
- Run event history, OAuth state and terminal sessions are process-local and in-memory.
- `listConversationMessages` has a hard `LIMIT 1000` and no pagination.
- Terminal output returned to the model is truncated to 8000 characters; persisted tool output is redacted and length-bounded.
- `estimated_cost_usd` is never populated.


## Native Worker runtime note

The route inventory above describes the application contract. The production HTTP implementation is now being moved from `src/server.ts` to the native Cloudflare Worker in `worker/api.ts`.

The current Worker implementation covers authentication, GitHub, conversations, runs, audit and SSE.

The following legacy terminal routes are **not** implemented by the native Worker:

- `/api/terminal/sessions`
- `/api/terminal/sessions/:sessionId`
- `/api/terminal/sessions/:sessionId/output`
- `/api/terminal/sessions/:sessionId/exec`
- `/api/terminal/sessions/:sessionId/socket`

They depended on the local shell execution service and are intentionally outside the Worker runtime. Future execution adapters will expose a separate controlled execution contract.

The run SSE implementation also changed: run state is durable in Neon, and the first SSE connection claims a queued run and executes it while the stream remains open. The old in-memory `runEventBus` is not part of the target Worker runtime.

See [Native Worker migration](NATIVE_WORKER_MIGRATION.md) and [Cloudflare deployment](CLOUDFLARE_DEPLOYMENT.md).
