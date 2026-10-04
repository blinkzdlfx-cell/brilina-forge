# Database and API Reference

This reference describes the schema migrations and HTTP contracts currently present. Inspect current source for exact validation, response bodies, and status codes before modifying a contract.

## Data ownership
GitHub is canonical for repository source, branches, commits and pull requests. Neon Postgres stores Forge application state. E2 is planned disposable execution infrastructure. The backend uses @neondatabase/serverless and a small raw-SQL repository layer; an ORM is not currently used.

## Migrations
Apply SQL in order to the intended Neon branch. Confirm the branch before any migration.

### 001_initial_forge.sql
- **forge_users:** Forge identity linked to unique GitHub user ID and login.
- **workspaces:** workspace owned by a Forge user.
- **workspace_members:** workspace membership with owner/admin/member role.
- **github_connections:** GitHub identity and encrypted access/refresh token fields, expiry and scopes.
- **repositories:** GitHub repository synchronized to a workspace, unique by workspace and GitHub node ID.
- **auth_sessions:** hashed session token, expiry and last-seen timestamps.
- **conversations:** user/workspace conversation with optional repository and branch context.
- **runs:** conversation execution status and optional provider/model, timestamps and error.
- **tool_calls:** tool name, status, JSON arguments/result, errors and lifecycle timestamps.
- **usage_records:** provider/model, token counts, estimated USD cost, duration, retry count, status.

The migration enables pgcrypto for UUID generation and creates lookup indexes.

### 002_conversation_messages.sql
Creates conversation_messages with conversation ID, optional run ID, role (user/assistant/system/tool), content, optional tool name, JSON metadata and creation timestamp. Conversation deletion cascades; run deletion nulls the run reference. Indexes support chronological history and run lookup.

See db/migrations/*.sql for authoritative constraints and foreign keys.

## Secrets
GitHub access and refresh tokens are encrypted using AES-256-GCM; ciphertext, IV and tag are stored separately. GITHUB_TOKEN_ENCRYPTION_KEY is a base64-encoded 32-byte application secret held outside Neon. Session tokens are hashed. The browser gets an HttpOnly Forge session cookie, not GitHub tokens. Never log or expose secrets, and never commit .env.

## API routes
Protected routes require the Forge session cookie. Identity is derived server-side. This table is a route inventory, not a full OpenAPI schema.

| Method | Path | Purpose |
|---|---|---|
| GET | /health | Service health and phase |
| GET | /auth/github/start | Begin GitHub App user authorization |
| GET | /auth/github/callback | Exchange code, persist session, set cookie |
| GET | /auth/github/logout | Delete session and clear cookie |
| GET | /api/github/me | Authenticated GitHub profile |
| GET | /api/github/repos?page=&per_page= | List accessible repositories |
| GET | /api/github/repos/:owner/:repo/branches | List branches |
| POST | /api/github/repositories/sync | Sync selected repo into workspace state |
| GET | /api/conversations | List current user's conversations |
| POST | /api/conversations | Create conversation |
| PATCH | /api/conversations/:conversationId | Update repository/branch context |
| GET | /api/conversations/:conversationId/messages | Load persisted messages |
| POST | /api/conversations/:conversationId/runs | Create run and start controller asynchronously |
| GET | /api/runs/:runId/events | Ownership-checked SSE stream |

Exact API behavior lives in src/server.ts; client wrappers and UI types live in web/src/api.ts and web/src/types.ts.

## Agent and stream contracts
Run statuses: queued, running, completed, failed, cancelled, interrupted.
Tool statuses: requested, authorized, running, completed, failed, rejected.
SSE event names: run.started, assistant.delta, tool.requested, tool.started, tool.completed, approval.required, assistant.completed, run.completed, run.failed. SSE is server-to-browser. WebSocket is reserved for the Phase 6 PTY terminal.

The controller exposes registered typed tools, validates basic object/required fields, applies policy and authorization, audits tool states/results, appends tool results to context, and uses a bounded loop (default maximum 8 steps). Current approval-required actions are rejected; interactive approval/resume is not yet implemented.

## Current limitations
- Phase 4 uses a deterministic development/test model; no production AI provider is integrated.
- E2, PTY and terminal WebSocket are Phase 6 work.
- Usage schema exists, but do not assume live provider usage is recorded before Phase 5.
- The UI's approval presentation is not a complete approval workflow.
