# Phase 7 — Verification and hardening

## Status

Controls are implemented and covered by automated tests. Live end-to-end verification has not been performed.

## Purpose

Close the gaps found while implementing Phases 4–6, and state plainly what is and is not verified.

## Security fixes

### Transport and headers

| Fix | Implementation |
|---|---|
| `@fastify/helmet` | CSP `default-src 'self'`, `script-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self' https://github.com`; `frameguard: deny`; `nosniff`; `referrer-policy: same-origin` |
| `@fastify/rate-limit` | 120/min, keyed by session cookie then IP, `/health` allow-listed |
| Body limit | 256 KB |

### CSRF and origin

- `assertSameOrigin` on every state-changing route.
- Same-origin check on the SSE stream before authentication.
- `Origin` check on the WebSocket handshake (a handshake is not covered by the same-origin policy), closing 4403.
- Session cookie is `SameSite=Strict`; logout is `POST` with origin validation.
- OAuth `state` is bound to an HttpOnly browser cookie, closing login CSRF (ADR-017).

### Execution

- The WebSocket raw-stdin `input` path was **removed**. It wrote straight to the shell's stdin and bypassed command policy, which made classification advisory. The only client message left is `{ type: "exec", command }` (ADR-015).
- `buildWorkerEnv` allow-list: worker sessions cannot see `DATABASE_URL`, GitHub secrets, the token encryption key or the provider key.
- Session directory containment under the execution root; sanitized path segments.
- Session and log caps; LRU eviction; `dispose()` on shutdown.

### Authorization and tenancy

- Workspace slug keyed on the immutable GitHub user id, not the login, so a recycled GitHub login cannot inherit a previous owner's workspace row.
- The `workspace_members` grant is resolved by slug rather than by an unconstrained cross-join.
- GitHub read tools deny when no repository is bound to the conversation; comparison is case-insensitive.
- Terminal sessions are scoped to `userId` as well as workspace, in HTTP, the socket and the tools.
- Conversation `UPDATE` is scoped by user and workspace.
- Run ownership joins the run, the conversation user and the conversation workspace before SSE, cancel and audit.

### Input validation

- UUID validation for conversation and run ids, before any database access.
- Terminal session id pattern validation.
- Branch name restricted to ref-safe characters with no `..`, and conversation title length/control-character limits. Both are interpolated into the model's system context, so this closes a durable prompt-injection vector.
- Run message capped at 8000 characters (413).
- One active run per conversation (409).

### Output and error handling

- Unexpected failures return `500 { "error": "internal_error" }`. Only errors raised by Forge's own validation and policy layers carry their message to the client.
- SSE `run.failed` messages pass through `publicRunFailure`, which forwards only Forge policy messages and reports provider failures as a classified kind.
- `redactSecrets` / `redactValue` are applied to persisted `tool_calls.arguments`, `tool_calls.result`, `tool_calls.error_message` and `runs.error_message`.

### Static serving

`src/web-serving.ts` decodes the request path, rejects backslashes (a separator on Windows), verifies containment with `path.resolve` **and** `realpath` so a symlink cannot escape, and never answers a dotfile request with the SPA shell.

## Observability and recovery

| Capability | Implementation |
|---|---|
| Cancellation | `POST /api/runs/:runId/cancel` aborts the run's `AbortController`. The controller checks `AgentRunLifecycle.shouldStop` at each step boundary, and the signal is passed into the provider through `AbortSignal.any`. The run is marked `cancelled`. |
| Audit read | `GET /api/runs/:runId/audit` returns the run plus its tool-call trail, ownership-checked via `getOwnedRunConversation`. |
| Run listing | `GET /api/conversations/:conversationId/runs`. |
| Event retention | `runEventBus.release(runId)` when a run finishes, plus a 5-minute sweep interval with a 15-minute default TTL and a 500-event per-run cap. |
| Run closure | The detached run closure captures the session, service and provider runtime before the response is sent, so it does not read from an already-sent request. |
| Shutdown | `SIGINT`/`SIGTERM` handlers in `start.ts` close the app, which triggers `dispose()` on the execution worker and clears the sweep interval. |
| Usage | `usage_records` written per run, including retries and duration. |
| Retry visibility | Each provider retry is logged with attempt, classified kind and delay. |

## CI

`.github/workflows/ci.yml` runs on push to `main` and `phase-*/**` and on pull requests:

| Job | Steps |
|---|---|
| `verify` | backend `npm ci`, `npm run build`, `npm test`; then web `npm ci`, `npm run build` |
| `security-audit` | `npm audit --audit-level=high` for backend and web |

## Test growth

The suite grew from 17 passing tests at the previous handoff to **95 passing** at this one. New files: `controller.observer`, `controller.cancellation`, `openai-compatible`, `retry`, `provider-model`, `local-worker`, `socket`, `execution/api`, `phase4/model`, `security/redact`, `security/http`.

## Verification limits

State these plainly whenever Phase 7 work is reported:

- **No live AI provider key** was used. The provider adapter is covered by unit tests against recorded response shapes.
- **No GitHub OAuth application** was registered for this work. The callback, cookie state binding and session persistence are tested with stubbed GitHub endpoints.
- **The terminal WebSocket was not driven from a real authenticated browser** against a live session.
- **No Neon-backed path was exercised end to end.** Neon queries are covered by repository-level tests.
- A passing build and passing tests do not prove OAuth, Neon connectivity, provider responses, SSE behaviour in a browser, or terminal behaviour in a browser.

## Remaining risks

1. No execution isolation: the local worker has no boundary beyond the command policy.
2. Approval-required actions are rejected, not approved; there is no interactive approve/resume flow.
3. Command policy is pattern-based, not a parser.
4. OAuth state, run event history and terminal sessions are process-local and in-memory, so the service does not currently scale past one instance or survive a restart.
5. Rate limiting is per-instance and in-memory.
6. `GET /auth/github/logout` still exists and is not origin-checked; it should be removed once no client depends on it.
7. `trustProxy: true` is unconditional, so a proxy that does not strip `X-Forwarded-For` allows rate-limit key spoofing.
8. `GET /health` still reports `phase: 4`.
9. No penetration test and no multi-instance deployment test.
10. No pagination on `listConversationMessages`.

## Remaining work

- perform and record live verification: real GitHub OAuth sign-in, real provider key, browser-driven terminal session, Neon-backed conversation
- remove the `GET` logout route
- correct the `phase` value on `/health`
- add an automated UI acceptance test against the built frontend
- decide on persistence for run events and terminal sessions, and a DB-backed OAuth state store
