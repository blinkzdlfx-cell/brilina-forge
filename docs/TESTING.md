# Brilina Forge Testing Strategy

## How to run

The backend suite uses Node's built-in test runner through `tsx`. From the repository root:

```powershell
npm install
npm test
```

To run a single file:

```powershell
node --import tsx --test src/security/http.test.ts
```

Frontend type-check and bundle, which is the closest thing to a frontend check:

```powershell
npm --prefix web install
npm --prefix web run build
```

CI (`.github/workflows/ci.yml`) runs build, Worker tests, Wrangler dry-run validation, and dependency audits on push and pull request.

There is no separate lint script and no end-to-end browser test runner.

## Current suite structure

The suite reports **95 passing tests**. Files live beside the code they cover.

| File | Area under test |
|---|---|
| `src/agent/controller.test.ts` | Tool validation, policy rejection, authorization, execution and audit |
| `src/agent/controller.observer.test.ts` | Full tool lifecycle events, approval-required reporting, blocked tools, active repository/branch system context |
| `src/agent/controller.cancellation.test.ts` | Cooperative cancellation at step boundaries |
| `src/agent/run-state.test.ts` | Run state machine transitions |
| `src/agent/tools/github-read-repository.test.ts` | The `github.get_repository` adapter is a real typed read-only tool |
| `src/ai/openai-compatible.test.ts` | Chat completions normalization, streamed tool-call reassembly, usage, rate-limit cooldowns, retry-after parsing, status classification, transport errors, malformed arguments, no key in errors |
| `src/ai/provider-model.test.ts` | Registry resolution, deterministic provider tool use, provider decision conversion, context-to-message mapping, streaming |
| `src/ai/retry.test.ts` | Cooldown retry honoring provider retry-after, cooldown cap, exponential fallback, attempt budget, non-provider failures |
| `src/auth/session.test.ts` | Session store create/update boundary |
| `src/db/crypto.test.ts` | AES-GCM token encryption round-trip without plaintext |
| `src/execution/local-worker.test.ts` | Command policy classification, worker environment secret exclusion, execution-root containment, session cap, run/exit-code capture, blocked-command refusal, log retention, workspace isolation, output truncation |
| `src/execution/socket.test.ts` | Terminal socket backlog replay, live streaming, exec forwarding, malformed message handling, unauthenticated and cross-workspace rejection |
| `src/execution/api.test.ts` | Terminal routes authenticate before touching the worker; parameter validation happens after authentication |
| `src/github/client.test.ts` | GitHub client behaviour |
| `src/github/service.test.ts` | GitHub service semantics |
| `src/github/service.hardening.test.ts` | File path and ref validation before any GitHub call; compare URL construction |
| `src/phase4/api.test.ts` | Health, session endpoint, branch comparison validation, authentication-before-validation on conversation and GitHub routes |
| `src/phase4/events.test.ts` | Run event bus history replay to a later SSE subscriber |
| `src/phase4/model.test.ts` | Deterministic adapter tool-request behavior; run event bus history cap and TTL release |
| `src/security/redact.test.ts` | Redaction of provider/GitHub/database credentials, authorization headers, private keys, secret-shaped assignments, structure walking and bounding |
| `src/security/http.test.ts` | Security headers, cookie flags, cross-origin rejection on state-changing routes and SSE, OAuth state cookie binding, identifier validation, static-serving traversal containment |
| `src/server.refresh.test.ts` | Runtime GitHub token refresh, expiry rejection, and the no-early-refresh case |

## Testing levels

### Unit

Tested today:

- tool schemas, argument validation, tool policy, tool authorization
- run state transitions
- bounded context assembly
- provider response normalization and streaming tool-call reassembly
- rate-limit and retry-after parsing
- cooldown retry
- command classification
- secret redaction
- OAuth state binding
- run event bus retention and release

### Integration

Tested today with in-process fakes (no network, no database):

- Fastify route behaviour, headers, cookies and error shaping
- terminal WebSocket behaviour against a fake `ExecutionService`
- local worker behaviour against a real child shell
- the Agent Controller against a fake audit store and deterministic models

### End-to-end

**Not performed.** No browser-driven test exists, and no live GitHub, Neon or AI provider endpoint has been exercised by an automated test. Everything above is unit or in-process integration level.

Do not describe any of these areas as end-to-end verified:

- the OpenAI-compatible provider adapter
- the GitHub OAuth callback against a real GitHub App
- the terminal WebSocket from a real authenticated browser
- Neon-backed persistence in a running server

## Acceptance scenarios

### GitHub foundation acceptance (Phase 1)

1. Authenticate.
2. Retrieve the authenticated GitHub profile.
3. List repositories.
4. Select the test repository.
5. Retrieve repository metadata.
6. Retrieve the default branch.
7. Retrieve tree/context.
8. Read README/documentation.
9. Verify REST and GraphQL results represent the same repository correctly.

### Agent acceptance (Phase 3, extended in Phase 4)

1. Create a run.
2. Send a user request.
3. Model requests a registered tool.
4. Validate tool schema.
5. Validate policy, then authorization.
6. Execute tool.
7. Persist the redacted tool result.
8. Append the result and the assistant tool-call turn to context.
9. Emit lifecycle events with the provider `callId`.
10. Complete or cancel the run at a step boundary.

### Execution acceptance (Phase 6)

1. Create a terminal session for a conversation the caller owns.
2. Run an allow-listed command.
3. Observe streamed output over the WebSocket.
4. Attempt a blocked command and confirm 403 before execution.
5. Attempt an unknown executable and confirm it is approval-required.
6. Attempt a second concurrent command and confirm 409.
7. Terminate the session and confirm the state transition.

These steps are covered by unit and in-process integration tests only. They have not been driven from a browser against a live session.

### Hardening acceptance (Phase 7)

1. Unauthenticated request to a protected route returns 401 before parameter validation.
2. Cross-origin request to a state-changing route returns 403.
3. Cross-origin SSE request returns 403 before authentication.
4. WebSocket handshake from a disallowed origin is closed.
5. OAuth callback with a state that does not match the browser cookie returns 400.
6. Malformed conversation or run id returns 400 without a database call.
7. Persisted tool arguments, results and errors contain no credential-shaped strings.
8. Unexpected failures return `internal_error` rather than an internal message.
9. A run can be cancelled and stops at the next step boundary.
10. Static asset requests cannot escape the web root through any traversal form.

## Failure tests

Covered today:

- expired or unrecoverable GitHub authorization
- repository unavailable and invalid refs (rejected before any GitHub call)
- malformed tool requests
- provider rate limit, timeout, overload, authentication and transport failures
- provider cooldown exhaustion and attempt-budget exhaustion
- blocked and approval-required terminal commands
- session cap with LRU eviction
- runaway output truncation
- worker child exit and session failure
- terminal socket disconnect, malformed message, unauthenticated and cross-workspace connection
- database-independent malformed identifiers

Still untested live:

- E2 crash and PTY disconnect (no E2 adapter exists)
- multi-instance behaviour for the in-memory OAuth state, run events and terminal sessions
- real provider streaming tool calls against a live endpoint

## Completion rule

A feature is not complete because the happy path works. The associated failure modes must be tested and documented. Equally, a feature covered only by unit tests must not be reported as verified end to end; the [README](../README.md) section "What is verified and what is not" is the canonical statement of that boundary.


## Native Worker testing

The production API runtime is now the native Cloudflare Worker in `worker/`.

Worker-specific automated checks currently include:

- `worker/api.test.ts` health-route behavior
- unknown non-API routes falling through to Static Assets
- CI Worker bundle validation through `wrangler deploy --dry-run`

Run locally with:

```bash
npm run test:worker
npx wrangler@4.68.0 deploy --dry-run
```

Live Worker checks performed so far:

1. deployed health endpoint — verified
2. deployed React shell — verified
3. unauthenticated `/api/session` — verified

Still required:

4. GitHub App OAuth
5. Neon-backed authenticated browser session
6. repository sync and conversation creation
7. deterministic run and SSE completion
8. real AI-provider run
9. request-disconnect cancellation

The old Fastify/terminal tests remain migration-era coverage until the legacy runtime is removed. They must not be used as evidence that the native Worker runtime is verified.
