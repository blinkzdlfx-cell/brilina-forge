# Brilina Forge Roadmap

## Phase 0 — Documentation

Status: **complete**

- product definition
- requirements
- architecture
- security
- decisions
- testing strategy

## Phase 1 — GitHub foundation

Status: **in progress**

1. Validate GitHub authorization model. **Complete: GitHub App user authorization selected.**
2. Implement GitHub connection persistence. **Deferred to Phase 2 because Neon is the durable state layer.**
3. Implement REST client. **Complete.**
4. Implement GraphQL client. **Complete.**
5. Implement GitHubService. **Complete.**
6. Implement repository discovery. **Complete.**
7. Implement repository context retrieval. **In progress: repository metadata, branches, tree and file reads are implemented; context aggregation remains to be hardened.**
8. Add integration tests against a real test repository. **Test added; requires a GitHub access token in the local environment.**

Current Phase 1 backend:
- Fastify HTTP service
- GitHub App OAuth web flow
- development-only in-memory sessions
- GitHub REST client
- GitHub GraphQL client
- GitHubService abstraction
- repository, branch, tree and file endpoints
- unit test for GraphQL repository context
- real GitHub integration test

Acceptance gate:

> Forge can authenticate, identify the account, discover repositories, inspect a selected repository, inspect branches, retrieve context and read files.

Phase 1 is not complete until the configured GitHub App has been exercised through the OAuth flow and the acceptance path passes against a real repository.

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
