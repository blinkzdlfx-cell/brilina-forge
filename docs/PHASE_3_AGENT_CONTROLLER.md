# Phase 3 — Agent Controller

## Status

Complete — accepted 2026-09-22.

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
- audit persistence adapter
- deterministic fake model and fake tools for controller tests
- read-only GitHub tool adapter

## Out of scope

- real AI provider adapters
- E2 execution
- arbitrary shell execution
- chat UI
- autonomous production coding

## Acceptance

CI passed the TypeScript build and 10 automated tests.

The accepted controller contract is:

1. A provider-neutral model can request a registered read-only Forge tool.
2. The controller validates the request against the tool schema boundary.
3. Authorization/policy is evaluated before execution.
4. The tool executes through its typed interface.
5. Structured results are appended to model context.
6. Tool failures and rejections are audited.
7. Run lifecycle transitions are enforced.
8. A Neon audit-store adapter persists runs and tool calls using the Phase 2 schema.
9. Fake model/tool implementations remain test-only.

## Important boundary

Human approval is represented by the tool policy boundary. The interactive approval/resume experience belongs to the later UI integration; Phase 3 does not expose an approval UI.

Real provider adapters remain Phase 5, and E2 execution remains Phase 4.
