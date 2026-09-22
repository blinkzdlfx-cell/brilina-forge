# Brilina Forge Roadmap

## Phase 0 — Documentation
Status: **complete**

## Phase 1 — GitHub foundation
Status: **complete**

Acceptance completed on 2026-09-22. Forge can authenticate, identify the account, discover repositories, inspect branches, retrieve repository context and read files while handling expiring authorization and malformed requests safely.

## Phase 2 — Neon persistence
Status: **complete**

Completed:
- Neon development and production branches established
- Forge persistence schema applied and verified
- Durable session store implemented
- GitHub credentials encrypted at rest
- Persistent authentication survives server restart
- Automatic GitHub token refresh is persisted to Neon
- Persistence and refresh acceptance passed
- Accepted schema migration applied to the Neon production branch

Acceptance completed on 2026-09-22:

> Application state survives restarts, GitHub credentials are protected at rest, and workspace/repository ownership constraints are enforced.

## Phase 3 — Agent Controller
Status: **complete**

Completed:
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

Acceptance completed on 2026-09-22:

> The controller can accept a provider-neutral model decision, validate and authorize a registered read-only tool, execute the typed tool, append its structured result to model context, and audit the run/tool lifecycle. Automated CI verified the build and 10 tests.

## Phase 4 — Chat UI
Status: **in progress**

Purpose:
- establish the user-facing Forge workspace contract before real AI provider integration
- build the UI against the provider-neutral Agent Controller
- avoid coupling the UI directly to any AI provider SDK

Scope:
- authenticated Forge shell
- conversation list and lifecycle
- repository and branch selection
- chat composer and message history
- run lifecycle/status presentation
- streaming/event contract
- tool activity presentation
- approval-required state presentation
- provider-neutral model UI contract
- terminal and diff integration points for later execution work
- responsive workspace layout

Constraints:
- no production AI provider SDK
- deterministic development responses only as test/development adapters
- stable backend contracts, not provider-specific payloads
- E2 execution deferred to Phase 6
- real AI provider integration is Phase 5

## Phase 5 — AI provider abstraction
- provider interface
- provider adapters
- model registry
- streaming normalization
- tool-call normalization
- usage extraction
- rate-limit handling
- cooldown retry

## Phase 6 — E2 execution
- worker provisioning
- persistent PTY
- WebSocket transport
- workspace hydration
- command policy
- execution logs
- failure recovery

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
