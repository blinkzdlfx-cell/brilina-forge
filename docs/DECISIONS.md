# Architecture Decision Records

## ADR-001 — GitHub is the source of truth

**Status:** Accepted

GitHub remains canonical for repository code, branches, commits and pull requests.

E2 is disposable.

## ADR-002 — E2 is not an agent host

**Status:** Accepted

OpenCode, Kilo Code and other coding-agent frameworks are not installed on E2 in the initial architecture.

The Forge backend owns orchestration.

## ADR-003 — Hybrid GitHub REST + GraphQL

**Status:** Accepted

Forge uses both GitHub APIs behind one GitHubService.

The Agent Controller does not care which protocol is used.

## ADR-004 — Progressive context retrieval

**Status:** Accepted

The model receives only the repository context required for the task rather than the whole repository by default.

## ADR-005 — Chat UI after backend contracts

**Status:** Superseded by ADR-011

The original sequencing placed the chat UI after the GitHub, database, agent, execution and AI provider foundations.

The implementation sequence was later changed so that the chat UI is built immediately after the Agent Controller, before real AI provider integration and E2 execution. The UI remains dependent on proven backend contracts and the provider-neutral Agent Controller rather than on a specific AI provider.

## ADR-006 — No giant agent framework initially

**Status:** Accepted

Forge will implement a small typed tool/controller layer rather than importing a large autonomous-agent framework before its requirements justify one.

## ADR-007 — E2 without Git CLI initially

**Status:** Accepted

GitHub APIs remain the primary repository interface. E2 does not require Git CLI for the initial architecture.

A future decision can introduce Git if execution workflows demonstrate a concrete need.

## ADR-008 — GitHub App user authorization

**Status:** Accepted

Brilina Forge will use a GitHub App with the user authorization flow rather than a legacy OAuth App.

Reasons:
- GitHub currently recommends GitHub Apps for new integrations.
- GitHub Apps support fine-grained permissions.
- Repository access can be constrained during installation.
- User access tokens can act on behalf of the authorized user.

The backend keeps the GitHub client ID and secret server-side. The browser never receives the client secret or GitHub access token.

Phase 1 implements the web authorization exchange and a development-only in-memory session. Durable GitHub connection persistence is deferred to Phase 2 with Neon.

Historical note: Phase 2 replaced that in-memory session with the Neon-backed store described in ADR-009, and ADR-017 later added the browser cookie binding for OAuth state. The session store described in this paragraph no longer describes the runtime.

Permission configuration must follow least privilege and be finalized in the GitHub App registration before production use.

## ADR-009 — Neon owns durable Forge application state

**Status:** Accepted

Neon / Lakebase Postgres is the durable state store for Forge.

GitHub remains the canonical source for repository code. E2 remains disposable execution infrastructure.

Phase 2 persists:
- users
- workspaces and memberships
- GitHub connections
- application sessions
- repositories
- conversations
- runs
- tool calls
- usage records

GitHub access and refresh tokens are encrypted before persistence. The encryption key is held outside the database in application-managed secrets.

The first implementation uses the Neon serverless Postgres driver with raw SQL and a small repository layer. An ORM is not introduced unless a concrete requirement justifies it.

## ADR-010 — Typed Agent Controller before provider integration

**Status:** Accepted

Forge implements a small provider-neutral Agent Controller before integrating real AI provider SDKs.

The controller owns tool registration, schema validation, authorization/policy checks, run lifecycle transitions, bounded context assembly and audit persistence.

Deterministic fake models and fake tools are test infrastructure only. They are not runtime dependencies and are not part of the production AI architecture.

Real provider adapters are Phase 5. E2 execution is Phase 6.

## ADR-011 — Chat UI before AI providers and E2

**Status:** Accepted

The remaining implementation sequence is:

1. Phase 4 — Chat UI
2. Phase 5 — AI provider abstraction
3. Phase 6 — E2 execution
4. Phase 7 — Verification and hardening

Phase 4 is built against provider-neutral application contracts and the existing Agent Controller. It must not introduce a dependency on a specific AI provider SDK.

Phase 4 may use deterministic development/test adapters to exercise UI lifecycle behavior, but those adapters are not production AI implementations.

The purpose of this ordering is to establish conversation, run, event, tool-activity, approval, repository/branch, and execution integration contracts before concrete AI providers or E2 execution infrastructure are integrated.

Phase 6 delivered those contracts against a local worker rather than Google Cloud E2; see ADR-016 for what that does and does not claim.

## ADR-012 — React + Vite + TypeScript frontend

**Status:** Accepted

The Brilina Forge frontend uses React, Vite and TypeScript.

The frontend lives under web/ beside the Fastify backend.

The browser communicates with Forge application APIs only. It does not call GitHub, Neon, E2 or AI providers directly.

## ADR-013 — SSE for chat/run events; WebSocket for E2 terminal

**Status:** Accepted

Server-Sent Events are used for server-to-browser conversation and run lifecycle events.

The event contract is provider-neutral and includes:
- run.started
- assistant.delta
- tool.requested
- tool.started
- tool.completed
- approval.required
- assistant.completed
- run.completed
- run.failed

WebSocket is reserved for the Phase 6 E2 interactive terminal, where bidirectional PTY input/output is required.

This avoids introducing WebSocket complexity into the normal chat stream while preserving a bidirectional transport for the terminal use case.

As implemented, the terminal socket carries live output and classified `exec` requests. It deliberately carries no raw-stdin write path; see ADR-015.

## ADR-014 — OpenAI-compatible adapter as the first provider, activated by key

**Status:** Accepted

The first real provider adapter in Forge is a generic **OpenAI-compatible** client (`src/ai/openai-compatible.ts`) rather than a vendor SDK.

The adapter speaks `POST {base}/chat/completions` with `Authorization: Bearer`, supports SSE streaming, and normalizes tool calls and usage into Forge's own `AiModelResult` / `AiStreamEvent` types. Reassembling streamed tool calls across chunk indices is part of the adapter, not the controller.

Activation is **key-gated**:

- `AI_PROVIDER_API_KEY` unset or empty → `createProviderRuntime` registers only `DeterministicDevelopmentProvider` and the active model is `forge-deterministic`.
- `AI_PROVIDER_API_KEY` set → `OpenAiCompatibleProvider` is registered and the active model becomes `AI_PROVIDER_MODEL` (default `gpt-4o-mini`).
- `AI_PROVIDER_BASE_URL` selects a non-OpenAI endpoint; `AI_PROVIDER_TIMEOUT_MS` bounds each request.

Reasons:
- One adapter covers OpenAI and the many services that mirror its API, so a second provider is configuration rather than code.
- Key-gating means the deterministic development adapter stays usable with no credentials, which keeps CI and local development deterministic and free.
- Provider concerns — status classification, retry-after parsing, cooldown retry, timeout, cancellation — stay in `src/ai/` and never reach the Agent Controller (Rule 5).

The deterministic adapter is real, unit-tested code, not a stub. It remains a development adapter and is not a production AI implementation.

Honest status: the adapter has never been run against a live provider endpoint. Its evidence is unit tests against recorded response shapes.

## ADR-015 — Allow-list command policy with no raw-stdin transport path

**Status:** Accepted

Terminal commands are classified by an **allow-list** policy (`src/execution/command-policy.ts`) before a worker executes them, and no transport exposes a raw shell write.

Classification order: reject empty, oversized and control-character input; reject chaining, command substitution and redirection; apply a block list (destructive, privilege-escalating, publishing, power-state, plus Windows equivalents); apply an approval list (installs, mutations, network fetches, containers, process termination, dev servers, interactive programs, remote access, environment inspection); then allow only read-only inspection executables. Anything unrecognised is approval-required, so an unknown command never runs unattended.

Two consequences are deliberate:

1. **Chaining is rejected rather than classified.** One submitted command may not contain `;`, `&`, `|`, backticks, `$(`, `<<`, `>` or a newline. A classified command therefore cannot smuggle in a second one.
2. **There is no raw-stdin path.** `ExecutionService.write` exists in the contract but is not reachable from any route or socket message. The terminal socket accepts only `{ type: "exec", command }`, and every browser command path calls `exec`, which classifies first.

Reasons:
- An earlier WebSocket `input` message wrote straight to the shell's stdin. It bypassed the policy entirely, which meant command classification was advisory rather than enforced. A raw write path turns command policy into decoration, so it was removed rather than gated.
- Deny-by-default means a policy gap fails closed: an unlisted executable asks for approval instead of running.

Trade-off accepted: the policy is regular-expression matching, not a shell parser. It raises the cost of a mistake and blocks known destructive shapes; it is not a complete sandbox. This is one reason the worker is not treated as production-safe (ADR-016).

## ADR-016 — A local disposable execution worker is the Phase 6 stand-in for GCP E2

**Status:** Accepted

Phase 6 delivers the **contract** of execution — `ExecutionService`, command policy, session lifecycle, log and output bounds, HTTP routes and a WebSocket transport — implemented by `LocalExecutionWorker` (`local-disposable`) running on the Forge host. A Google Cloud E2 adapter is **not** implemented and remains future work.

Reasons:
- The contracts, the policy layer, the transport, the authorization checks and the UI could all be built and tested without provisioning remote VMs, which unblocked the terminal and tool work.
- Building against an interface first means an E2 adapter later is an implementation of `ExecutionService`, not a redesign.
- The worker is disposable in the ADR-001 sense: it holds no source of record.

What this decision explicitly does **not** claim:

- The local worker has **no isolation boundary** beyond the command-policy layer. It runs on the Forge host with the host filesystem and network available.
- It is a development/local worker. It must not be treated as a substitute for a disposable remote E2 in production, and the roadmap keeps the E2 adapter as open work.
- Sessions and their logs are in-memory only and are lost on restart.
- Session processes are shell-backed, not true PTYs on Windows.

The README, roadmap and phase documents state this limitation rather than describing the worker as "E2".

## ADR-017 — OAuth state is bound to a browser cookie

**Status:** Accepted

The GitHub authorization `state` value is bound to the browser that started the flow through an HttpOnly `SameSite=Lax` cookie (`brilina_oauth_state`, 10-minute max age).

`/auth/github/start` generates both the state and PKCE verifier, packs them into the browser-bound cookie, and sends the state to GitHub. `/auth/github/callback` requires the cookie-bound state to equal the presented `state`, compares them in constant time, recovers the verifier from the same cookie, and clears the cookie on success or mismatch. A mismatch returns `400 oauth_state_binding_mismatch`. PKCE (`S256`) remains in place.

There is no process-local pending-state map in the native Worker flow.

Reason:
- A server-side `state` map alone proves only that *some* authorization started on this server. An attacker can start their own authorization, then hand a victim the callback URL containing the attacker's `code` and `state`. The server would accept it and sign the victim into the **attacker's** GitHub account — a login CSRF that leaks the victim's subsequent work.
- Binding the state to the browser that received it means a callback only works in the browser that started the flow.

The state cookie uses `SameSite=Lax` (not `Strict`) because the callback is a top-level cross-site navigation from GitHub, which `Strict` would withhold. The session cookie remains `SameSite=Strict`.

The remaining OAuth dependency is the GitHub App configuration itself; the callback still requires the Worker URL and the configured GitHub client credentials.


## ADR-018 — Native Cloudflare Worker is the production API runtime

**Status:** Accepted

Brilina Forge no longer uses Fastify as the production HTTP runtime.

The Worker owns the HTTP API directly with standard Fetch APIs and Web Streams. The React application and API are deployed together through Workers Static Assets.

The old Node/Fastify server and local execution implementation are migration-era code and are not part of the target production runtime.

Reason:

- Cloudflare Workers is the chosen deployment platform.
- A native Worker avoids maintaining a second API server.
- The existing application services — GitHub, Neon, AI, repositories and the Agent Controller — can be reused without keeping the Fastify HTTP shell.
- Terminal execution requires a separate execution environment rather than a shell inside the API Worker.

## ADR-019 — Neon remains the Forge database during the Worker migration

**Status:** Accepted

Do not migrate Forge from Neon Postgres to D1 as part of the API runtime migration.

The current repository layer already uses Neon's serverless driver and PostgreSQL SQL. Neon is compatible with serverless/edge runtimes, including Cloudflare Workers.

A D1 migration would combine two large changes — runtime migration and database migration — without solving a problem required by the Worker architecture.

A future D1 evaluation may happen separately if a concrete requirement justifies it.

## ADR-020 — SSE request owns the active agent run

**Status:** Accepted

A run is created as `queued`. The browser then opens the run SSE endpoint. The first stream atomically changes the run to `running` and executes the Agent Controller while the stream remains connected.

This replaces the old process-local active-run set, controller map and detached background promise.

Reasons:

- Worker isolates do not provide reliable process-local coordination.
- `waitUntil()` is limited to 30 seconds after the response/disconnect, so it is not a reliable execution queue for an AI coding run.
- A streaming HTTP invocation can remain active while the response body is being streamed.
- Neon remains the durable source of run state.

If the browser disconnects, the Worker request signal can be used to stop the active run cooperatively.

This design does not yet provide durable job execution after the browser disconnects. A future Queue, Workflow or Durable Object design can be introduced if Forge must continue runs independently of an open browser stream.
