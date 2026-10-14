> **Historical implementation note:** This file uses the previous internal phase numbering and records past implementation work. It is not the current five-phase product roadmap. Follow [the current roadmap](ROADMAP.md) and [current-state ledger](CURRENT_STATE_AND_CONTINUATION.md) for delivery order and verified status. A historical 'complete' label does not prove live verification.

# Brilina Forge — Phase 2 Neon

Status: **complete**

Accepted on 2026-09-22.

## Completed

- Neon development and production branches established
- Forge persistence schema applied and verified
- Durable session store implemented
- GitHub credentials encrypted at rest with AES-256-GCM
- Persistent authentication survives server restart
- Automatic GitHub token refresh persisted to Neon
- Persistence and refresh acceptance passed
- Accepted schema migration applied to the Neon production branch

## Acceptance

> Application state survives restarts, GitHub credentials are protected at
> rest, and workspace/repository ownership constraints are enforced.

## Schema

Migration 001 creates `forge_users`, `workspaces`, `workspace_members`,
`github_connections`, `repositories`, `auth_sessions`, `conversations`, `runs`,
`tool_calls` and `usage_records`. Migration 002 creates `conversation_messages`.
`runs` carries nullable `provider` and `model`.

## Notes

The workspace slug is keyed on the immutable GitHub user id, not the login:
GitHub recycles logins, and a login-keyed unique slug would let a new account
collide with a previous owner's workspace row.