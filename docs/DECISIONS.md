# Architecture Decision Records

## ADR-001 — GitHub is the source of truth

**Status:** Accepted

GitHub remains canonical for repository code, branches, commits and pull requests.

E2 is disposable.

## ADR-002 — E2 is not an agent host

**Status:** Accepted

OpenCode, Kilo Code and other coding-agent frameworks are not installed on E2 in the initial architecture.

The Forge backend owns orchestration.

## ADR-003 — Hybrid GitHub REST + GraphQL

**Status:** Accepted

Forge uses both GitHub APIs behind one GitHubService.

The Agent Controller does not care which protocol is used.

## ADR-004 — Progressive context retrieval

**Status:** Accepted

The model receives only the repository context required for the task rather than the whole repository by default.

## ADR-005 — Chat UI after backend contracts

**Status:** Superseded by ADR-011

The original sequencing placed the chat UI after the GitHub, database, agent, execution and AI provider foundations.

The implementation sequence was later changed so that the chat UI is built immediately after the Agent Controller, before real AI provider integration and E2 execution. The UI remains dependent on proven backend contracts and the provider-neutral Agent Controller rather than on a specific AI provider.

## ADR-006 — No giant agent framework initially

**Status:** Accepted

Forge will implement a small typed tool/controller layer rather than importing a large autonomous-agent framework before its requirements justify one.

## ADR-007 — E2 without Git CLI initially

**Status:** Accepted

GitHub APIs remain the primary repository interface. E2 does not require Git CLI for the initial architecture.

A future decision can introduce Git if execution workflows demonstrate a concrete need.

## ADR-008 — GitHub App user authorization

**Status:** Accepted

Brilina Forge will use a GitHub App with the user authorization flow rather than a legacy OAuth App.

Reasons:
- GitHub currently recommends GitHub Apps for new integrations.
- GitHub Apps support fine-grained permissions.
- Repository access can be constrained during installation.
- User access tokens can act on behalf of the authorized user.

The backend keeps the GitHub client ID and secret server-side. The browser never receives the client secret or GitHub access token.

Phase 1 implements the web authorization exchange and a development-only in-memory session. Durable GitHub connection persistence is deferred to Phase 2 with Neon.

Permission configuration must follow least privilege and be finalized in the GitHub App registration before production use.

## ADR-009 — Neon owns durable Forge application state

**Status:** Accepted

Neon / Lakebase Postgres is the durable state store for Forge.

GitHub remains the canonical source for repository code. E2 remains disposable execution infrastructure.

Phase 2 persists:
- users
- workspaces and memberships
- GitHub connections
- application sessions
- repositories
- conversations
- runs
- tool calls
- usage records

GitHub access and refresh tokens are encrypted before persistence. The encryption key is held outside the database in application-managed secrets.

The first implementation uses the Neon serverless Postgres driver with raw SQL and a small repository layer. An ORM is not introduced unless a concrete requirement justifies it.

## ADR-010 — Typed Agent Controller before provider integration

**Status:** Accepted

Forge implements a small provider-neutral Agent Controller before integrating real AI provider SDKs.

The controller owns tool registration, schema validation, authorization/policy checks, run lifecycle transitions, bounded context assembly and audit persistence.

Deterministic fake models and fake tools are test infrastructure only. They are not runtime dependencies and are not part of the production AI architecture.

Real provider adapters are Phase 5. E2 execution is Phase 6.

## ADR-011 — Chat UI before AI providers and E2

**Status:** Accepted

The remaining implementation sequence is:

1. Phase 4 — Chat UI
2. Phase 5 — AI provider abstraction
3. Phase 6 — E2 execution
4. Phase 7 — Verification and hardening

Phase 4 is built against provider-neutral application contracts and the existing Agent Controller. It must not introduce a dependency on a specific AI provider SDK.

Phase 4 may use deterministic development/test adapters to exercise UI lifecycle behavior, but those adapters are not production AI implementations.

The purpose of this ordering is to establish conversation, run, event, tool-activity, approval, repository/branch, and execution integration contracts before concrete AI providers or E2 execution infrastructure are integrated.

## ADR-012 — React + Vite + TypeScript frontend

**Status:** Accepted

The Brilina Forge frontend uses React, Vite and TypeScript.

The frontend lives under web/ beside the Fastify backend.

The browser communicates with Forge application APIs only. It does not call GitHub, Neon, E2 or AI providers directly.

## ADR-013 — SSE for chat/run events; WebSocket for E2 terminal

**Status:** Accepted

Server-Sent Events are used for server-to-browser conversation and run lifecycle events.

The event contract is provider-neutral and includes:
- run.started
- assistant.delta
- tool.requested
- tool.started
- tool.completed
- approval.required
- assistant.completed
- run.completed
- run.failed

WebSocket is reserved for the Phase 6 E2 interactive terminal, where bidirectional PTY input/output is required.

This avoids introducing WebSocket complexity into the normal chat stream while preserving a bidirectional transport for the terminal use case.
