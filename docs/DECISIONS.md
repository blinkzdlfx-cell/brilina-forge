# Brilina Forge — Architecture decisions

## ADR-001 — GitHub is canonical; execution is on the user's machine

GitHub owns source code. Neon owns Forge state. Execution runs on the user's
own machine through a small local Node companion, which is disposable and
holds only temporary execution state and the per-machine approval store.

The companion is never the only copy of source. Do not install OpenCode or
Kilo Code on it in the current architecture.

## ADR-002 — Execution is not an agent host

The companion runs commands, not an agent framework. OpenCode, Kilo Code and
other coding-agent frameworks are not installed on it in the initial
architecture.

## ADR-003 — One GitHubService

Application code never scatters raw GitHub API calls. All access goes through
`GithubService`, which hides REST and GraphQL behind one interface.

## ADR-004 — Progressive task-relevant context

The model receives bounded, task-relevant context. It never receives a complete
repository dump by default. A conversation with no bound repository cannot use
the GitHub read tools at all.

## ADR-005 — Neon is the durable store

Neon Postgres stores Forge state through the serverless driver and a small
raw-SQL repository layer. No ORM without justification.

## ADR-006 — Small typed controller

The Agent Controller is small and typed, not a large agent framework without a
concrete need.

## ADR-007 — No Git CLI requirement initially

GitHub APIs remain the primary repository interface. The companion does not
require Git CLI for the initial architecture.

## ADR-008 — GitHub App user authorization

Authorization uses a GitHub App with user-level tokens, not a legacy OAuth App.

## ADR-009 — Neon serverless driver, raw SQL

The backend uses `@neondatabase/serverless` with raw SQL. An ORM is not used
without justification.

## ADR-010 — Provider-neutral controller

The Agent Controller never depends directly on a provider SDK. Provider
SDK-shaped code lives only in `src/ai/`.

## ADR-011 — Phase order

The implementation order was changed so the chat UI is built immediately after
the Agent Controller, before real AI provider integration and local execution.
The UI remains dependent on proven backend contracts and the provider-neutral
Agent Controller rather than on a specific AI provider.

## ADR-012 — Frontend is React + Vite + TypeScript

The frontend lives in `web/` and is React 19, Vite 7, TypeScript.

## ADR-013 — SSE for run events; no WebSocket

Chat and run events stream over SSE. There is no WebSocket: the browser never
holds a shell, so there is nothing bidirectional to stream. This supersedes the
earlier decision to reserve a WebSocket for the interactive terminal.

## ADR-014 — OpenAI-compatible adapter, key-gated

The first provider adapter is OpenAI-compatible. It is activated only when
`AI_PROVIDER_API_KEY` is set. With no key, the deterministic development
adapter remains the active model and the rest of the system behaves
identically. That is intentional, not a defect.

## ADR-015 — Command policy in the companion

Command classification lives in the companion, not on the Forge server. The
same `classifyCommand` logic is reused so the server and the companion cannot
drift. Evaluation order is blocked → risky (ask) → light (allow).

## ADR-016 — Native Cloudflare Worker runtime

The production runtime is a native Cloudflare Worker. `src/server.ts` is the
local development runtime and must not gain new application behavior. New
application routes belong in `worker/api.ts`.

## ADR-017 — OAuth state bound to a browser cookie

The OAuth `state` is bound to an `HttpOnly` browser cookie set at
`/auth/github/start` and verified at the callback. This closes the login CSRF
window: an attacker cannot complete their own authorization and hand the
victim a callback URL. The cookie carries `state.verifier` so the PKCE
verifier travels with the state.

## ADR-018 — Execution on the user's machine, no sandbox

Execution runs on the user's own machine through a small local Node companion.
There is no server-side shell, no VPS cost, and no browser terminal.

- The companion starts only when a command actually needs to execute, never
  when the AI is just planning.
- The machine is verified on first use: the companion registers itself with
  Forge under the current session in one background call. No pairing ceremony.
- Light read-only commands run automatically on a verified machine.
- Risky commands require the user's consent, like Claude Code, Codex and
  Gemini CLI.
- Some commands are blocked outright, even with consent.
- There is **no sandbox**. The companion runs as the user. The command policy
  layer is the only boundary. Codex's sandbox is a future hardening option, not
  a first-version requirement.

## Superseded

- ADR-013 originally reserved a WebSocket for the interactive terminal. The
  terminal is removed; SSE is the only transport.
- The earlier Phase 6 scope (a server-side execution worker with a browser
  terminal) is superseded by ADR-018.
- The earlier "local disposable worker as the Phase 6 stand-in for GCP E2"
  framing is superseded; there is no server-side worker at all.