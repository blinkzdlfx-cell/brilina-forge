# Brilina Forge

**Brilina Forge — AI-Assisted Software Development Workspace**

Brilina Forge is a private, GitHub-centered workspace for controlled AI-assisted software engineering. It combines repository awareness, a provider-neutral Agent Controller, a React chat interface with tool-activity and diff presentation, Neon persistence, a key-gated OpenAI-compatible AI provider adapter, and a disposable local execution worker with an interactive terminal.

## Source of truth

GitHub is canonical for source code and history. Neon stores Forge application state. The execution worker is disposable and must never be the only copy of source.

## Development rule

**Documentation → architecture decision → implementation → test → verification**

Do not silently replace accepted architectural decisions. Read [Agent Handoff](docs/AGENT_HANDOFF.md) before continuing work.

## Current status

Phases 0–7 are implemented in code. Read the caveats before treating any phase as production ready.

| Phase | Scope | Status |
|---|---|---|
| 0 | Documentation | Complete |
| 1 | GitHub foundation | Complete |
| 2 | Neon persistence | Complete |
| 3 | Agent Controller | Complete |
| 4 | Chat UI | Complete in code; browser acceptance not performed |
| 5 | AI provider abstraction | Complete in code; no live provider key has been exercised |
| 6 | Execution | Complete against a **local** worker; Google Cloud E2 adapter is not implemented |
| 7 | Verification and hardening | Controls implemented and unit/integration tested; live end-to-end verification outstanding |

Key honest caveats:

- The Phase 6 execution worker is a **local, in-process worker** (`local-disposable`). It has no isolation boundary beyond the command-policy layer. A Google Cloud E2 adapter is future work.
- Approval-required tools are still permanently rejected. There is no interactive approve/resume flow.
- Without `AI_PROVIDER_API_KEY`, the deterministic development adapter stays active. This is intentional.
- Run event history, OAuth state and terminal sessions are in-memory only.

## Accepted implementation order

1. Phase 0 — Documentation
2. Phase 1 — GitHub foundation
3. Phase 2 — Neon persistence
4. Phase 3 — Agent Controller
5. Phase 4 — Chat UI
6. Phase 5 — AI provider abstraction
7. Phase 6 — E2 execution
8. Phase 7 — Verification and hardening

This follows ADR-011. Phase 6 delivered the ExecutionService contract, command policy, session lifecycle and terminal transport on a local worker rather than on Google Cloud E2; see [Phase 6 Execution](docs/PHASE_6_EXECUTION.md) and ADR-016.

## What is verified and what is not

**Verified by automated tests (95 passing, `npm test`):**

- Controller tool lifecycle, policy rejection, approval-required rejection, observer events, active repository/branch system context, cooperative cancellation.
- Provider adapter normalization: chat completions, streamed tool-call reassembly across chunk indices, usage normalization, retry-after parsing, error classification, no secret in errors.
- Command policy classification, worker environment allow-list, session caps, log and output caps, LRU eviction.
- Terminal WebSocket backlog replay, live streaming, exec forwarding, and rejection of unauthenticated / cross-workspace / cross-origin connections.
- HTTP security headers, session cookie flags, cross-origin rejection on state-changing routes and on the SSE stream, OAuth state binding to a browser cookie, identifier validation, static-serving traversal containment.
- Secret redaction in persisted tool arguments, results, errors and run error messages.
- Run event bus history cap, release and TTL sweep.
- Backend TypeScript build and frontend Vite build in CI, plus `npm audit --audit-level=high` for backend and web.

**Not verified — no live exercise was performed:**

- No live AI provider key was used. The OpenAI-compatible adapter is covered only by unit tests against recorded response shapes.
- No GitHub OAuth application was registered for this work. The callback, cookie binding and session persistence are covered by tests that stub the GitHub endpoints.
- The terminal WebSocket was not driven from a real authenticated browser against a live session.
- No Neon-backed path was exercised end to end. Neon queries are covered by repository-level tests and by manual development use only.

Do not describe these areas as working end to end until they have actually been run and the results recorded here.

## Local development

See [Windows PowerShell Local Development](docs/LOCAL_DEVELOPMENT.md) for installation, environment setup, build, and local run instructions.

## Environment variables

Copy `.env.example` to `.env`. `src/config.ts` and `.env.example` are authoritative.

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | no | Runtime mode. Defaults to `development`. |
| `HOST` | no | Listen host. Defaults to `0.0.0.0`. |
| `PORT` | no | Listen port. Defaults to `3000`. |
| `PUBLIC_BASE_URL` | no | Forge origin. Used for same-origin checks. Defaults to `http://localhost:3000`. |
| `GITHUB_CLIENT_ID` | yes | GitHub App client ID, server-side only. |
| `GITHUB_CLIENT_SECRET` | yes | GitHub App client secret, server-side only. |
| `GITHUB_CALLBACK_URL` | no | Callback URL; its origin is also an allowed browser origin. |
| `COOKIE_SECURE` | no | `true` only when serving over HTTPS. Adds `Secure` to cookies. |
| `DATABASE_URL` | yes | Neon / Lakebase Postgres connection string. |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | yes | Base64-encoded 32-byte AES-256-GCM key, held outside Neon. |
| `AI_PROVIDER_BASE_URL` | no | OpenAI-compatible base URL. Defaults to `https://api.openai.com/v1`. |
| `AI_PROVIDER_MODEL` | no | Model id sent to the provider. Defaults to `gpt-4o-mini`. |
| `AI_PROVIDER_API_KEY` | no | **Activation switch.** Unset or empty keeps the deterministic development adapter active. |
| `AI_PROVIDER_TIMEOUT_MS` | no | Provider request timeout. Defaults to `120000`. |
| `EXECUTION_ROOT_DIR` | no | Root directory for disposable worker session directories. Defaults to a `brilina-forge-worker` directory in the system temp directory. |

The API key is the only thing that switches the runtime from the deterministic development adapter to the OpenAI-compatible adapter. There is no separate provider toggle.

## Engineering documentation

- [Agent handoff](docs/AGENT_HANDOFF.md)
- [Product & engineering specification](docs/BRILINA_FORGE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Requirements](docs/REQUIREMENTS.md)
- [Roadmap](docs/ROADMAP.md)
- [Security](docs/SECURITY.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Testing strategy](docs/TESTING.md)
- [Database and API reference](docs/DATABASE_AND_API_REFERENCE.md)
- [GitHub App setup](docs/GITHUB_APP_SETUP.md)
- [Local development](docs/LOCAL_DEVELOPMENT.md)
- [Phase 1 hardening](docs/PHASE_1_HARDENING.md)
- [Phase 2 Neon](docs/PHASE_2_NEON.md)
- [Phase 3 Agent Controller](docs/PHASE_3_AGENT_CONTROLLER.md)
- [Phase 4 Chat UI](docs/PHASE_4_CHAT_UI.md)
- [Phase 5 AI provider](docs/PHASE_5_AI_PROVIDER.md)
- [Phase 6 execution](docs/PHASE_6_EXECUTION.md)
- [Phase 7 hardening](docs/PHASE_7_HARDENING.md)

## Main commands

From the repository root:

```powershell
npm install
npm --prefix web install
npm run build
npm test
npm --prefix web run build
npm run dev
```

For a separate frontend development server, run `npm --prefix web run dev` in another terminal. See the local development guide for full details.
