# Brilina Forge Security Model

This document describes controls that are **implemented in code**, followed by the risks that remain. Each control below is covered by automated tests where a test is named.

## Trust boundaries

There are five major trust zones:

1. Browser
2. Forge backend
3. GitHub
4. AI provider
5. Execution worker

Neon is the durable application-state boundary. The execution worker is currently a **local** worker inside the Forge process's host, so zones 2 and 5 are not separated by a network or virtualization boundary — see [Remaining risks](#remaining-risks).

## Browser

The browser may receive:

- safe user/session information
- repository metadata
- conversation data
- tool status
- terminal output

The browser must not receive:

- raw GitHub credentials
- provider secrets
- server credentials
- unrestricted execution credentials

Enforced by: the session cookie is `HttpOnly`, GitHub and provider tokens stay server-side, provider errors are normalized to a classified `AiProviderError` whose message never contains the API key, and unexpected failures return a generic `internal_error`.

## Request-level controls

| Control | Implementation |
|---|---|
| Security headers | `@fastify/helmet`: CSP `default-src 'self'` with `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`; `frameguard: deny`; `nosniff`; `referrer-policy: same-origin` |
| Rate limiting | `@fastify/rate-limit`: 120 requests per minute, keyed by session cookie then IP; `/health` allow-listed |
| Body size | Fastify `bodyLimit` of 256 KB |
| Proxy awareness | `trustProxy: true` so rate limiting keys on the real client IP |

Tests: `src/security/http.test.ts`.

## CSRF and origin validation

`SameSite=Strict` on the session cookie stops the cookie from riding a cross-site navigation, but two paths are not covered by that guarantee and are checked explicitly:

- **State-changing routes** (`POST` / `PATCH` / `DELETE`) call `assertSameOrigin`. A request carrying an `Origin` outside `{ PUBLIC_BASE_URL, callback origin }` is rejected with 403 before any work happens.
- **The SSE stream** (`GET /api/runs/:runId/events`) is origin-checked, before authentication.
- **The WebSocket handshake** is not covered by the same-origin policy at all, so the terminal socket checks `Origin` explicitly and closes with 4403.

A missing `Origin` header is allowed, which is why these checks are defence in depth rather than the only control.

Tests: `src/security/http.test.ts`, `src/execution/socket.test.ts`.

## OAuth state binding (login CSRF)

Without a browser binding, an attacker can complete their own GitHub authorization and hand a victim a callback URL, logging the victim into the attacker's account.

Implemented:

- PKCE (`code_challenge_method: S256`) on the authorization request.
- The `state` value is also written to an HttpOnly `SameSite=Lax` cookie (`brilina_oauth_state`, 10-minute max age) at `/auth/github/start`.
- `/auth/github/callback` requires the cookie value to equal the presented `state`, compared with a constant-time comparison, and clears the cookie on both success and mismatch.
- Mismatch returns `400 oauth_state_binding_mismatch`.
- The server-side pending-state map is TTL-expired and capped at 500 entries.

Tests: `src/security/http.test.ts`.

## Cookie flags

| Cookie | Attributes |
|---|---|
| `brilina_session` | `HttpOnly; Path=/; SameSite=Strict; Max-Age=86400`, plus `Secure` when `COOKIE_SECURE=true` |
| `brilina_oauth_state` | `HttpOnly; Path=/; SameSite=Lax; Max-Age=600`, plus `Secure` when `COOKIE_SECURE=true` |

Session tokens are stored hashed in Neon; the raw token only exists in the cookie. Session lifetime is 24 hours, and expiring GitHub credentials are refreshed transparently or the session is deleted and the caller must sign in again.

Sign-out is `POST /auth/github/logout` and is origin-checked. A `GET` variant is retained only so an already-loaded older client is not stranded; it should be removed once no client depends on it.

## Tenant and resource scoping

| Resource | Enforcement |
|---|---|
| Conversations | Listed, read and updated by `userId` + `workspaceId`. Conversation `UPDATE` is scoped by both, so a guessed id cannot move a repository binding. |
| Runs | `userOwnsRun` joins runs to conversations and requires the run user and the conversation workspace. `getOwnedRunConversation` additionally requires the conversation user. Both are used before SSE, cancel and audit. |
| Run audit | `getRunAudit` is scoped by conversation id, and the conversation id comes from the ownership-checked lookup. |
| Terminal sessions | Scoped by workspace **and** `userId`; a workspace member cannot read or drive another user's terminal. The socket applies the same checks and closes 4403/4404. |
| Terminal tools | `terminal.exec` / `read` / `kill` authorize against workspace and session owner. |
| GitHub read tools | Deny unless the conversation has a repository bound and it matches `owner/repo` case-insensitively. An unbound conversation cannot read any repository the token can reach. |
| Workspace identity | The workspace slug is keyed on the immutable GitHub user id, not the login, so a recycled GitHub login cannot collide with a previous owner's workspace row. The `workspace_members` grant is resolved by slug rather than by an unconstrained cross-join. |

## Input validation

| Input | Rule |
|---|---|
| `conversationId`, `runId` | UUID format, checked before any database access |
| Terminal session id | `^[A-Za-z0-9-]{8,64}$` |
| Run message | Non-empty after trim, at most 8000 characters (413) |
| Branch name | `^[A-Za-z0-9._/-]{1,255}$` and no `..` |
| Conversation title | At most 200 characters, no control characters |
| Terminal command | At most 2000 characters, no control characters |
| GitHub file path and ref | Validated in `GithubService` before any GitHub call |
| Pagination | Bounded on repository, commit and output queries |

Branch names and conversation titles are interpolated into the model's system context, so restricting them to ref-safe characters closes a durable prompt-injection vector: a stored branch name would otherwise be injected into every later run.

## Tool authorization

A tool request is not permission by itself.

The backend verifies:

```
identity
→ workspace membership
→ repository relationship
→ branch rules
→ tool permission
→ operation policy
```

Every tool declares a policy of `allowed`, `approval-required` or `blocked`. The controller evaluates policy before authorization and before execution, and the model cannot alter its own policy: the execution-side policy in the worker runs again regardless of what the caller decided.

## Terminal security

### Command policy

`src/execution/command-policy.ts` classifies every command before a worker runs it. Evaluation order: empty/length/control-character rejection, then chaining-substitution-redirection rejection, then a block list, then an approval list, then an allow-list of read-only inspection executables. Anything not matched by the block list or the approval list and not on the allow-list is **approval-required**, so an unknown command never runs unattended.

The block list covers destructive filesystem operations, raw device writes, power-state changes, privilege escalation, package publication, remote repository mutation, and the Windows equivalents of each. The approval list covers dependency installation, repository mutation, outbound network fetches, container execution, process termination, long-running development servers, interactive terminal programs, remote host access, and environment inspection.

### No raw-stdin transport path

`ExecutionService.write` exists in the contract but is **not reachable from any HTTP route or socket message**. The terminal socket accepts only `{ type: "exec", command }`, and every browser-initiated command path goes through `exec`, which classifies first. An earlier raw-stdin `input` message existed and was removed because it handed an authenticated browser a shell that bypassed command policy (ADR-015).

### Worker environment allow-list

`buildWorkerEnv` constructs the child environment from an explicit allow-list (`PATH`, `HOME`, temp directories, locale, and the Windows system variables a shell needs). The worker does not inherit the Forge process environment, so `DATABASE_URL`, `GITHUB_CLIENT_SECRET`, `GITHUB_TOKEN_ENCRYPTION_KEY` and `AI_PROVIDER_API_KEY` are unreachable from a terminal session. `TERM` is set to `xterm-256color`.

Test: `src/execution/local-worker.test.ts` asserts the allow-list excludes every Forge secret.

### Resource bounds

- Session directories are resolved under the execution root with path segments sanitized and containment verified.
- Log buffer capped at 256 KB per session; captured command output capped at 32000 characters.
- Command timeout defaults to 120 s and is clamped to 600 s.
- At most 8 concurrent sessions; creating a ninth evicts the oldest.
- Child processes and their stdio are `unref`'d so a live session cannot hold the event loop open, and `dispose()` kills every session on shutdown.
- One concurrent command per session; a second returns 409.

## Secret redaction

`src/security/redact.ts` removes credential-shaped substrings from:

- persisted `tool_calls.arguments`
- persisted `tool_calls.result`
- persisted `tool_calls.error_message`
- persisted `runs.error_message`

Patterns include GitHub tokens (`ghp_`, `gho_`, `ghu_`, `ghs_`, `ghr_`, `github_pat_`), provider keys (`sk-`, `sk-ant-`, `AIAccessToken`), database URLs, `Authorization` headers, PEM private key blocks, and secret-shaped environment assignments. `redactValue` walks structures, masks secret-named keys, and bounds depth and breadth; `redactSecrets` truncates at 20000 characters so a large tool result cannot inflate an audit row.

Client-visible errors are separately protected: unexpected failures return `internal_error`, and SSE `run.failed` messages pass through `publicRunFailure`, which forwards only Forge's own policy messages and reports provider failures only as a classified kind.

Tests: `src/security/redact.test.ts`.

## Audit

Recorded in Neon:

- `runs`: user, conversation, status, provider, model, timestamps, error
- `tool_calls`: run, tool name, status, redacted arguments and result, error, lifecycle timestamps
- `usage_records`: run, provider, model, token counts, duration, retry count, status

Exposed read-only to the owning user via `GET /api/runs/:runId/audit` and `GET /api/conversations/:conversationId/runs`. Secrets are not recorded: tool payloads and error messages are redacted before they are written.

Run events streamed to the browser are in-memory and released when the run finishes; they are not persisted.

## Remaining risks

Stated plainly. None of these are fixed.

1. **No execution isolation.** The worker is `local-disposable` on the Forge host. The command policy is the only boundary. A policy bypass is a host compromise. A Google Cloud E2 adapter is not implemented.
2. **Approval is not implemented.** Approval-required tools and commands are rejected, not approved. There is no approve/resume flow, so the "human in the loop" control exists as a rejection rather than a decision point.
3. **Policy is pattern-based.** The command block/approval/allow lists are regular expressions. They are a speed bump against known shapes, not a shell parser, and they cannot be considered complete.
4. **No live security verification.** All of the above is covered by unit and integration tests. No penetration test, no multi-instance deployment test, and no authenticated browser session has been exercised.
5. **OAuth state is process-local.** The pending-state map is in-memory, so a multi-instance deployment would reject valid callbacks on the instance that did not start the flow. A DB-backed state store is required before scaling out.
6. **Terminal sessions and run events are in-memory.** A restart loses them; a second instance cannot see them.
7. **Rate limiting is per-instance and in-memory.** It does not bound aggregate traffic across instances.
8. **`GET /auth/github/logout` still exists.** The GET variant is not origin-checked, so it can be triggered cross-site. Its only effect is ending the caller's own session, which is a nuisance rather than a compromise, but it should be removed.
9. **`COOKIE_SECURE` defaults to false.** Production must set it, and must terminate TLS, or the session cookie is transmissible over plaintext.
10. **Trust-proxy assumption.** `trustProxy: true` is unconditional. Behind a proxy that does not strip `X-Forwarded-For`, rate-limit keys can be spoofed.
11. **Token usage can be inaccurate.** When a provider reports no usage, `usage_records` records a message-length estimate. Do not treat those rows as billing data.
12. **Provider keys are read from the environment.** There is no secret manager integration; `.env` handling is a local-development convention.

## Security testing before production use

Automated coverage exists for:

- security headers and cookie flags
- cross-origin rejection on state-changing routes, SSE and the WebSocket
- OAuth state cookie binding
- identifier validation before database access
- static-serving traversal containment including encoded escapes and the repository `.env`
- command policy classification and chaining/substitution/redirection rejection
- worker environment secret exclusion and execution-root containment
- terminal session and socket authorization across workspace and user
- redaction of persisted payloads

Still to be tested live:

- unauthorized repository access through a real GitHub token
- cross-workspace access with two real accounts
- expired GitHub authorization in a browser
- provider credential leakage with a real provider
- terminal session hijacking from a real browser
