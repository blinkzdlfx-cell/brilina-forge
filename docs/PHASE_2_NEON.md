# Phase 2 — Neon Persistence

Status: **schema designed; implementation in progress**

## Objective

Replace Phase 1's in-memory application session with durable Forge state in Neon / Lakebase Postgres.

GitHub remains the canonical source for repository code. Neon stores Forge application state only.

## Neon project

Existing project:
- Name: Brilina Forge
- Project ID: `nameless-haze-58360399`
- Production branch: `production`
- Phase 2 development branch: `phase-2-neon-persistence`

The Phase 2 database work is developed against the dedicated Neon branch first. Production schema changes are applied only after the branch schema is tested and accepted.

## Initial persistence model

### Identity and ownership
- `forge_users`
- `workspaces`
- `workspace_members`

### GitHub
- `github_connections`
- `repositories`

### Authentication
- `auth_sessions`

### Agent/application state
- `conversations`
- `runs`
- `tool_calls`
- `usage_records`

## Credential storage

GitHub access and refresh tokens are never stored as plaintext database fields.

The schema stores ciphertext plus IV/tag material. The application encryption key remains outside Neon in the application environment/secret store.

The browser continues to receive only the application session cookie.

## Ownership rules

The persistence layer must enforce:
- a workspace has one owner;
- workspace membership is explicit;
- repositories belong to a workspace;
- conversations belong to a workspace and user;
- runs belong to conversations and users;
- tool calls belong to runs;
- usage records belong to runs when applicable.

Authorization checks remain application-layer responsibilities in addition to database foreign-key constraints.

## Migration workflow

1. Develop schema on the Phase 2 Neon branch.
2. Verify tables, constraints and indexes.
3. Implement database access behind a small repository/data-access layer.
4. Replace the Phase 1 in-memory session implementation.
5. Add integration tests for restart persistence and ownership boundaries.
6. Apply the accepted migration to the Neon production branch.
7. Update the Phase 2 completion status only after the acceptance gate passes.

## Acceptance gate

> Application state survives process restarts, GitHub credentials are protected at rest, and workspace/repository ownership constraints are enforced.

## Explicit non-goals

Phase 2 does not implement:
- Agent Controller orchestration
- terminal execution
- AI provider adapters
- chat UI
- arbitrary model tool execution
