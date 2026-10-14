# Brilina Forge Architecture

## Purpose

Brilina Forge is a private GitHub-centered workspace for controlled AI-assisted software development. The browser provides the workspace UI. The Agent Controller coordinates the model and registered tools. GitHub is the source of truth for code; Neon stores Forge application state.

## Production topology

```
Browser (React + Vite)
        |
        | HTTPS / same-origin API and SSE
        v
Cloudflare Worker
  - GitHub App auth/session routes
  - Forge API
  - Agent Controller and typed tools
  - AI provider adapter
  - run lifecycle / SSE response
  - Workers Static Assets
        |
        +------> GitHub REST / GraphQL (repository source)
        |
        +------> Neon Postgres (users, sessions, conversations,
                                  messages, runs, tool audit, usage,
                                  companion work results)
        
Separate future component:
User's computer -> local Node.js companion -> approved local commands
```

The production entry points are `worker/index.ts` and `worker/api.ts`. The old Fastify runtime in `src/server.ts` is migration-era/local-only code. Do not add new product behavior to it. Neon remains the database; D1 is not part of the migration.

## Ownership and boundaries

1. **GitHub owns source code.** Forge reads repositories through the shared `GithubService`; it does not replace GitHub as the canonical source.
2. **Neon owns durable application records.** Session, conversation, run, message, audit and usage data belongs in the database where durability is required.
3. **The Worker does not execute shell commands.** No `child_process`, local shell, or browser terminal in the production Worker.
4. **The controller owns orchestration.** It validates typed tool requests, applies policy/authorization, audits tool activity and uses a provider-neutral model interface.
5. **Context is progressive.** Give the model only task-relevant repository information, not a full repository dump by default.
6. **Secrets stay server-side.** The model and browser must not receive raw provider/GitHub credentials.
7. **Local execution is a separate component.** If implemented, a small Node.js companion runs on the user's machine. It must authenticate work, enforce command policy, obtain consent for risky commands, bound output and time, and report results. The current repository has partial Worker/database scaffolding but does not yet establish a complete working companion.
8. **Human approval must be real.** A UI event saying approval is required is not approval functionality. The tool call must persist in a pending state, accept an authenticated decision, audit that decision and resume or reject deterministically.

## Run lifecycle: current behavior and required guarantees

Current Worker code creates a run in Neon with status `queued`. The browser opens `GET /api/runs/:runId/events`; the Worker attempts to claim the run and executes the controller while the SSE response remains open. Another subscriber waits for the run to reach a terminal state. Run records are durable, but this request-bound execution pattern does not by itself guarantee recovery after disconnect, isolate termination, or timeout. Do not describe it as fully durable orchestration.

Before this path is considered reliable, tests and implementation must establish:

- one authoritative, atomic claim/lease per run;
- idempotent dispatch so reconnects cannot execute the same run twice;
- explicit behavior for browser disconnect versus actual run cancellation;
- durable final status, result messages and tool audit;
- bounded execution and cleanup on timeout/cancellation;
- a documented recovery path for a claimed run whose execution disappears;
- ordered event IDs and a reliable replay strategy if SSE reconnect/replay is required.

The current legacy `src/phase4/events.ts` is an in-memory event bus. Do not claim that it provides durable replay across Worker isolates or restarts.

## Current module map

- `worker/index.ts`: Worker entry point, API dispatch, security headers, static assets.
- `worker/api.ts`: native Worker auth, GitHub, conversation, run, audit, SSE and companion-related routes.
- `src/auth/`: GitHub authorization and session abstractions shared by runtime code.
- `src/github/`: GitHub API transport and semantic `GithubService`.
- `src/db/`: Neon SQL client, session and conversation/run/audit/usage repositories, companion-work persistence.
- `src/agent/`: typed tool contracts, policy, context assembly, controller and tool registry.
- `src/ai/`: provider-neutral AI contracts, OpenAI-compatible adapter, deterministic adapter and retry logic.
- `src/security/`: secret redaction.
- `src/phase4/`: legacy deterministic model and in-memory event bus.
- `web/src/`: React UI, API client and browser types.
- `db/migrations/`: database migrations.
- `docs/CURRENT_STATE_AND_CONTINUATION.md`: current evidence-based status and next stages.
- `docs/NEXT_KILO_PROMPT.md`: reusable inspection-first handoff prompt.

The exact current file tree must be inspected on the checked-out branch before coding; this module map is not a claim that every listed module is active in production.

## AI provider boundary

The controller consumes the provider-neutral `AgentModel` contract. The OpenAI-compatible adapter is intended to be enabled only when configured; otherwise the deterministic development model is used. Unit tests with faked responses do not prove a live provider request works. Usage/cost fields must distinguish provider-reported usage from estimates.

## Companion and command policy

The companion is not part of the Worker process and must not be described as complete until its executable application and end-to-end tests exist. Device identity cannot depend on an in-memory Worker `Map`, because requests may reach different isolates. Work assignment/results need authenticated ownership and durable state. Commands should be classified as blocked, approval-required, or safe in that order. Because the companion runs with the user's OS permissions and the first version has no sandbox, the policy boundary and user consent are critical and must not be bypassed.

## Verification language

Use these labels consistently:

- **Implemented in code:** source exists.
- **Automated-tested:** named test(s) actually ran and passed.
- **Live-verified:** behavior was exercised against the real configured environment.
- **Partial:** only some contracts or scaffolding exist.
- **Not implemented:** no complete implementation exists.
- **Blocked:** required environment, decision, or dependency is unavailable.

See `docs/CURRENT_STATE_AND_CONTINUATION.md` and `docs/ROADMAP.md` for current status and order.
