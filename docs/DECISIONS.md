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

## ADR-005 — Backend before chat UI

**Status:** Accepted

The UI comes after the GitHub, database, agent, execution and AI provider foundations.

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
