# Brilina Forge — Agent Handoff

Read this before changing code. It records the product boundaries, accepted decisions, current status, and safe continuation process.

## Product purpose
Brilina Forge is a private, GitHub-centered AI-assisted software development workspace, initially for the owner and a small trusted group. It is a controlled engineering workflow, not simply a chatbot with a terminal attached.

## System ownership
- **GitHub:** canonical source for code, branches, commits, and pull requests.
- **Neon Postgres:** durable Forge application state, users, workspaces, sessions, conversations, messages, runs, tool audit, and usage records.
- **Forge backend:** authentication boundary, API, Agent Controller, policy, and coordination.
- **Browser:** React client that calls Forge APIs only.
- **Google Cloud E2:** planned disposable execution worker for builds, tests, scripts, shell and PTY. Phase 6; not yet integrated.

Never make E2 the only copy of source. Do not install OpenCode or Kilo Code on E2 in the current architecture.

## Status at handoff
The latest known main includes Phase 4 Chat UI merge commit 06a2c8d0db4182673b82bf437416c9353c4473dd. Verify current GitHub state before relying on this reference.

| Phase | Scope | Status |
|---|---|---|
| 0 | Documentation | Complete |
| 1 | GitHub foundation | Complete |
| 2 | Neon persistence | Complete |
| 3 | Agent Controller | Complete |
| 4 | Chat UI | Foundation implemented; local acceptance and remaining work pending |
| 5 | AI provider abstraction | Not started |
| 6 | E2 execution | Not started |
| 7 | Verification and hardening | Not started |

Phase 4 remaining items: execution/diff integration points, authenticated production serving/deployment verification, and automated UI/API acceptance tests. The deterministic model is a development/test adapter, not real AI. Interactive approval/resume is not implemented; approval-required tools currently reject pending approval.

## Accepted decisions
See docs/DECISIONS.md for full ADRs. Do not silently replace these:
- GitHub is canonical; E2 is disposable (ADR-001).
- Backend owns orchestration; no coding-agent framework installed on E2 (ADR-002).
- GitHub REST + GraphQL are hidden behind one GitHubService (ADR-003).
- Progressive task-relevant context; no complete repo dump by default (ADR-004).
- Small typed controller, not a large agent framework without a concrete need (ADR-006, ADR-010).
- No Git CLI requirement on E2 initially; GitHub APIs are primary (ADR-007).
- GitHub App user authorization, not legacy OAuth App (ADR-008).
- Neon stores durable state; Neon serverless driver + raw SQL, no ORM without justification (ADR-009).
- Current order is Phase 4 UI → Phase 5 AI → Phase 6 E2 → Phase 7 verification (ADR-011); it supersedes historical sequencing in old docs.
- Frontend is React + Vite + TypeScript in web/ (ADR-012).
- SSE for chat/run events; WebSocket reserved for interactive E2 terminal (ADR-013).
- High-impact operations require policy checks and human control.

## Technology and source areas
Backend is TypeScript ESM, Fastify 5, Node.js >=20, with @neondatabase/serverless. Frontend is React 19, Vite 7, TypeScript. Root package scripts build/test backend and invoke web builds.

- src/auth/: GitHub authorization and application sessions.
- src/github/: API client and semantic GitHub service.
- src/db/: Neon client, AES-GCM token crypto, persistence repositories, audit.
- src/agent/: model-neutral types, tool registry, context, policy, run state, controller, GitHub read tool.
- src/phase4/: deterministic model and in-memory run event bus.
- src/server.ts: Fastify routes, auth, run orchestration and SSE.
- src/start.ts: configures Neon session store and starts server.
- src/web-serving.ts: built frontend static files and SPA fallback.
- web/src/: React application, API client, frontend types and styles.
- db/migrations/: ordered schema migrations.
- docs/: specifications, decisions, security, testing, roadmap and phase details.

Inspect the actual tree and relevant source on the checked-out branch before coding.

## Backend and frontend contracts
Current route inventory:
- GET /health
- GET /auth/github/start
- GET /auth/github/callback
- GET /auth/github/logout
- GET /api/github/me
- GET /api/github/repos?page=&per_page=
- GET /api/github/repos/:owner/:repo/branches
- POST /api/github/repositories/sync
- GET /api/conversations
- POST /api/conversations
- PATCH /api/conversations/:conversationId
- GET /api/conversations/:conversationId/messages
- POST /api/conversations/:conversationId/runs
- GET /api/runs/:runId/events

Inspect src/server.ts for exact schemas, validation and error behavior. Protected APIs derive user identity from the Forge session cookie. SSE verifies run ownership.

SSE event names: run.started, assistant.delta, tool.requested, tool.started, tool.completed, approval.required, assistant.completed, run.completed, run.failed. Frontend wrappers are in web/src/api.ts; shared browser types are in web/src/types.ts. Browser requests use same-origin relative API paths and credentials.

## Agent Controller
The controller calls a provider-neutral AgentModel.next contract, exposes registered typed tools, validates object/required arguments, checks policy and authorization, audits tool lifecycle, adds structured tool results to context, and limits model steps (default 8). It does not call provider SDKs, execute arbitrary shell, or bypass GitHubService. Current approval-required behavior is rejection with an approval message, not a pause/resume approval workflow.

## Database
Migration 001 creates forge_users, workspaces, workspace_members, github_connections, repositories, auth_sessions, conversations, runs, tool_calls and usage_records. Migration 002 creates conversation_messages. GitHub tokens are encrypted at rest with AES-256-GCM; key is outside Neon. Session tokens are hashed. See docs/DATABASE_AND_API_REFERENCE.md.

## Next recommended steps
1. Pull current main and inspect working-tree status.
2. Configure a local development .env without sharing secrets.
3. Run backend and frontend locally and record actual outcomes.
4. Fix only observed errors, adding tests for regressions.
5. Finish Phase 4 acceptance/integration scope.
6. Begin Phase 5 only after Phase 4 contracts are verified.

## Working protocol
- Discuss the plan before implementation.
- Read relevant specs, ADRs, roadmap, security and tests first.
- Separate observed evidence, recommendations, and decisions requiring owner approval.
- Gate architecture, auth, secrets, schema, permissions, infrastructure and provider choices.
- Do not invent data, routes, configuration, successful tests, or deployment state.
- Keep changes focused, tests and docs synchronized; use a branch/PR unless explicitly told otherwise.
- Report exact commands and actual test results.
