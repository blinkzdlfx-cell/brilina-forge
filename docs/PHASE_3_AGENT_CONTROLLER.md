# Brilina Forge — Phase 3 Agent Controller

Status: **complete**

Accepted on 2026-09-22.

## Completed

- typed tool contract
- tool registry
- schema validation boundary
- tool policy/authorization boundary
- run state machine
- bounded model context assembly
- deterministic controller loop
- deterministic fake model and in-memory audit store for controller tests
- Neon audit-store adapter
- real read-only GitHub repository tool adapter
- Phase 3 architecture and ADR documentation
- CI build and test verification

## Acceptance

> The controller can accept a provider-neutral model decision, validate and
> authorize a registered read-only tool, execute the typed tool, append its
> structured result to model context, and audit the run/tool lifecycle.

## Execution note

The controller does **not** execute arbitrary shell commands. It orchestrates
typed tools. Commands run on the user's machine through the companion, not on
the Forge server. E2 execution is **Phase 6**, not Phase 4.