# Brilina Forge Roadmap

## Phase 0 — Documentation
Status: **complete**

## Phase 1 — GitHub foundation
Status: **hardening implementation complete; acceptance testing required**

Completed:
- GitHub App user authorization
- GitHub REST and GraphQL clients
- GitHubService
- repository discovery
- repository metadata, branches, tree and file retrieval
- PKCE and expiring-token handling
- session expiration and token refresh
- rate-limit/error normalization
- input validation and tree-size limits
- unit/hardening tests
- real GitHub integration test

Acceptance gate:

> Forge can authenticate, identify the account, discover repositories, inspect a selected repository, inspect branches, retrieve context and read files, while handling expiring authorization and malformed requests safely.

Phase 1 is complete only after the automated and manual acceptance checklist in docs/PHASE_1_HARDENING.md passes.

## Phase 2 — Neon persistence
- database project/branch setup
- migrations
- users
- workspaces
- memberships
- GitHub connections
- repositories
- conversations
- runs
- tool calls
- usage

Acceptance gate:

> Application state survives restarts and ownership constraints are enforced.

## Phase 3 — Agent Controller
- tool registry
- schemas
- authorization
- run state machine
- model context assembly
- tool execution loop
- audit events

Acceptance gate:

> A model can request a real read-only tool and receive a validated result.

## Phase 4 — E2 execution
- worker provisioning
- persistent PTY
- WebSocket transport
- workspace hydration
- command policy
- execution logs
- failure recovery

## Phase 5 — AI provider abstraction
- provider interface
- provider adapters
- model registry
- streaming normalization
- tool-call normalization
- usage extraction
- rate-limit handling
- cooldown retry

## Phase 6 — Chat UI
- authentication
- conversations
- repository/branch selector
- model selector
- streaming response
- tool activity
- terminal
- diffs
- approval prompts
- settings

## Phase 7 — Verification and hardening
- end-to-end testing
- security review
- observability
- failure recovery
- performance
- deployment
- documentation synchronization

## Rule
Do not skip a phase simply because a UI can be made to appear functional. A visible UI without proven backend contracts is not considered implementation complete.
