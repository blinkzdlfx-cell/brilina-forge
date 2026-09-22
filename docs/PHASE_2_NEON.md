# Phase 2 — Neon Persistence

Status: **complete**

## Objective

Replace Phase 1's in-memory application session with durable Forge state in Neon / Lakebase Postgres.

GitHub remains the canonical source for repository code. Neon stores Forge application state only.

## Neon project

Existing project:
- Name: Brilina Forge
- Project ID: `nameless-haze-58360399`
- Production branch: `production`
- Phase 2 development branch: `phase-2-neon-persistence`

The Phase 2 database work was developed and verified against the dedicated Neon branch first. The accepted schema was then applied to the production branch.

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

The persistence layer enforces database relationships for:
- workspace ownership;
- explicit workspace membership;
- repository-to-workspace ownership;
- conversation-to-workspace/user relationships;
- run-to-conversation/user relationships;
- tool-call-to-run relationships;
- usage-record-to-run relationships when applicable.

Authorization checks remain application-layer responsibilities in addition to database foreign-key constraints.

## Verification

Phase 2 verification completed on 2026-09-22:
- Neon development schema inspected and verified.
- Application tests: 9/9 passed.
- TypeScript build completed successfully.
- GitHub authentication persisted across a server restart.
- A near-expiry GitHub token was refreshed automatically without reauthentication.
- Refreshed GitHub credential metadata was persisted back to Neon.
- GitHub credentials remained encrypted at rest.
- Accepted migration was applied to the Neon production branch.

## Acceptance gate

> Application state survives process restarts, GitHub credentials are protected at rest, and workspace/repository ownership constraints are enforced.

Phase 2 acceptance gate passed on 2026-09-22.

## Explicit non-goals

Phase 2 does not implement:
- Agent Controller orchestration
- terminal execution
- AI provider adapters
- chat UI
- arbitrary model tool execution
