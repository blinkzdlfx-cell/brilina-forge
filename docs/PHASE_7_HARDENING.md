# Brilina Forge — Phase 7 hardening

Status: **controls implemented and tested; live end-to-end verification outstanding**

## Completed

- Origin validation on state-changing routes and the SSE stream.
- OAuth state bound to an HttpOnly browser cookie (login CSRF fix); session
  cookie `SameSite=Strict`; logout is `POST` with `GET` retained for older
  clients.
- `@fastify/helmet` (CSP `frame-ancestors 'none'`, framing `DENY`, `nosniff`,
  referrer policy) and `@fastify/rate-limit` (120/min keyed by session cookie
  then IP, `/health` allow-listed).
- UUID validation on conversation and run ids; generic `internal_error` instead
  of leaking database or provider messages.
- `redactSecrets` / `redactValue` applied to persisted `tool_calls.arguments`,
  `tool_calls.result`, `tool_calls.error_message` and `runs.error_message`.
- Workspace slug keyed on the immutable GitHub user id; `workspace_members`
  grant cross-join fixed.
- GitHub read tools deny when no repository is bound to the conversation.
- Branch name and conversation title validated to prevent prompt injection into
  the system context.
- Conversation `UPDATE` scoped by user and workspace.
- `web-serving` decodes the path, rejects backslashes, and verifies `realpath`
  containment.
- Detached run closure captures session and service before replying.
- Run message length capped at 8000; one active run per conversation.
- `POST /api/runs/:runId/cancel` (cooperative cancellation through
  `AgentRunLifecycle.shouldStop` and an `AbortController` passed to the
  provider), `GET /api/runs/:runId/audit` (ownership-checked via
  `getOwnedRunConversation`), `GET /api/conversations/:conversationId/runs`,
  `runEventBus.release` on completion plus a 5-minute sweep interval, and
  SIGINT/SIGTERM graceful shutdown in `start.ts`.
- CI (`.github/workflows/ci.yml`) runs `verify` and `security-audit`
  (`npm audit --audit-level=high` for backend and web).

## Test suite

The suite grew from 17 passing tests at the previous handoff to **103
passing** at this one. New files: `controller.observer`, `controller.cancellation`,
`openai-compatible`, `retry`, `provider-model`, `local-worker`, `socket`,
`execution/api`, `phase4/model`, `security/redact`, `security/http`, plus the
four Cloudflare Worker tests.

## Honest caveats

- No live verification was performed: no provider key, no GitHub OAuth
  application, no browser-driven run, no Neon-backed end-to-end conversation.
- Security testing is unit/integration level. There is no penetration test and
  no multi-instance deployment test.
- The OAuth state store and run event history remain process-local.
- The companion, device verification, and the approval UI have not been built.
- The protections built around server-side execution — the WebSocket
  raw-stdin removal, the worker environment allow-list, and origin validation
  on a terminal socket — are no longer relevant once execution leaves the
  server. They are recorded here as history.