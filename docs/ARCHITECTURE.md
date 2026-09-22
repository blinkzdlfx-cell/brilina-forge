# Brilina Forge Architecture

## High-level topology

```
                         ┌─────────────────────┐
                         │     Forge Web UI    │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │ Application/API     │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │  Agent Controller   │
                         └──────┬──────┬───────┘
                                │      │
                    ┌───────────┘      └────────────┐
                    ▼                              ▼
             ┌──────────────┐               ┌──────────────┐
             │ AI Provider  │               │ Tool Registry│
             └──────────────┘               └──────┬───────┘
                                                   │
                                      ┌────────────┴────────────┐
                                      ▼                         ▼
                               ┌─────────────┐           ┌─────────────┐
                               │ GitHub      │           │ Execution   │
                               │ Service     │           │ Service     │
                               └──────┬──────┘           └──────┬──────┘
                                      │                          │
                                REST/GraphQL                 WebSocket
                                      │                          │
                                      ▼                          ▼
                                   GitHub                     E2 / PTY

                         ┌─────────────────────────┐
                         │ Neon / Lakebase Postgres│
                         └─────────────────────────┘
```

## Architectural rules

### Rule 1 — Source ownership

GitHub owns source code.

### Rule 2 — Application state

Neon owns Forge state.

### Rule 3 — Execution

E2 owns only temporary execution state.

### Rule 4 — Orchestration

The Forge backend owns agent orchestration.

### Rule 5 — Model abstraction

The Agent Controller never depends directly on a provider SDK.

### Rule 6 — GitHub abstraction

Application code never scatters raw GitHub API calls. All access goes through GitHubService.

### Rule 7 — Tool boundary

Models request typed tools. Models do not receive arbitrary backend credentials or direct network access.

## Agent Controller boundary

The Agent Controller owns orchestration, not provider-specific behavior or infrastructure implementation.

Its inputs are:
- authenticated principal
- conversation/run identifiers
- bounded user/model context
- registered typed tools
- model decisions through an internal provider-neutral interface

Its responsibilities are:
- create and transition runs
- expose only registered tool schemas
- validate tool arguments
- evaluate tool policy and authorization
- execute typed tools
- append structured tool results to model context
- persist run/tool-call audit state
- enforce a maximum step count

The controller does not:
- call provider SDKs directly
- execute arbitrary shell commands
- access GitHub outside GitHubService
- load an entire repository by default
- receive or expose raw credentials

## Backend package direction

The eventual application can be organized conceptually as:

```
src/
  app/
  modules/
    auth/
    workspaces/
    github/
    repositories/
    agent/
    tools/
    execution/
    ai/
    usage/
  db/
  security/
  shared/
```

Exact framework/package layout remains an implementation decision after the repository foundation is inspected.

## GitHub context pipeline

```
repository selection
→ repository metadata
→ branch metadata
→ tree
→ relevant paths
→ file reads
→ context assembly
→ token/context budget check
→ model
```

The context service should support caching where safe, but cache invalidation must respect commit/branch changes.

## Agent execution pipeline

```
message
→ create run
→ assemble context
→ invoke model
→ receive tool call
→ validate schema
→ authorize
→ execute
→ persist result
→ append result to model context
→ continue
→ finish run
```

## Future extensibility

The architecture should allow:
- GitLab service
- Bitbucket service
- local execution worker
- Docker execution worker
- additional AI providers
- additional tool families

without changing the conversation model or Agent Controller contract.
