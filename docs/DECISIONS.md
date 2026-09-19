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
