# Brilina Forge Roadmap

## Phase 0 — Documentation

Status: **started**

- product definition
- requirements
- architecture
- security
- decisions
- testing strategy

## Phase 1 — GitHub foundation

Status: **next**

1. Validate GitHub authorization model.
2. Implement GitHub connection persistence.
3. Implement REST client.
4. Implement GraphQL client.
5. Implement GitHubService.
6. Implement repository discovery.
7. Implement repository context retrieval.
8. Add integration tests against a real test repository.

Acceptance gate:

> Forge can authenticate, identify the account, discover repositories, inspect a selected repository, inspect branches, retrieve context and read files.

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
- permission engine
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

Acceptance gate:

> Forge can safely run a test/build command in E2 and recover from worker failure.

## Phase 5 — AI provider abstraction

- provider interface
- provider adapters
- model registry
- streaming normalization
- tool-call normalization
- usage extraction
- rate-limit handling
- cooldown retry

Acceptance gate:

> The same Agent Controller workflow can run against multiple providers.

## Phase 6 — Chat UI

- authentication
- sidebar
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
