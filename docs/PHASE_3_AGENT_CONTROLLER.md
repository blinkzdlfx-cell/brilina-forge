# Phase 3 — Agent Controller

## Status

In progress.

## Purpose

Phase 3 establishes the backend orchestration contract between future AI providers and typed Forge tools. It does not implement a real AI provider, E2 execution, or chat UI.

## Scope

- typed tool contract
- tool registry
- tool schemas and argument validation
- authorization/policy boundary
- run lifecycle state machine
- model context assembly
- deterministic execution loop
- audit persistence
- deterministic fake model and fake tools for controller tests

## Out of scope

- real AI provider adapters
- E2 execution
- arbitrary shell execution
- chat UI
- autonomous production coding

## Core flow

```
request
→ create run
→ assemble bounded context
→ model decision
→ validate tool request
→ authorize
→ execute typed tool
→ persist tool result
→ append result to context
→ continue or finish
```

## Tool contract

Tools expose stable semantic operations. A tool has a name, description, input schema, operation class, and execution function. The controller never gives a model direct credentials or arbitrary backend access.

## Policy classes

- allowed: may execute when identity, workspace and repository constraints pass
- approval-required: controller pauses before execution
- blocked: controller rejects execution

Phase 3 initially proves these policy paths with deterministic test doubles. Real terminal policy is deferred to Phase 4.

## Run lifecycle

```
queued → running → completed
              ├→ failed
              ├→ cancelled
              └→ interrupted
```

The implementation must reject invalid transitions and persist terminal outcomes.

## Context assembly

The controller receives explicitly supplied context only. It does not load an entire repository automatically. Repository context remains behind the existing GitHub service boundary.

## Persistence

The existing Phase 2 tables are authoritative:

- conversations
- runs
- tool_calls
- usage_records

Phase 3 does not create duplicate run or tool-call state.

## Acceptance criteria

1. A deterministic model can request a real read-only Forge tool.
2. The controller validates the request against the registered schema.
3. Authorization is evaluated before execution.
4. The tool executes through its typed interface.
5. The result is persisted and returned to the model context.
6. A rejected/failed tool call is audited without exposing secrets.
7. Run state transitions are persisted and invalid transitions are rejected.
8. Controller tests pass without external AI or E2 dependencies.
