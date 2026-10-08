# Cloudflare Worker deployment

Brilina Forge is being migrated to a **single native Cloudflare Worker runtime**.

```
Browser
  |
  v
Cloudflare Worker
  |---- React static assets
  |---- GitHub authentication
  |---- Forge API
  |---- GitHub API calls
  |---- AI provider calls
  |---- run streaming
  |
  v
Neon Postgres
```

There is no permanent Fastify API origin in the new architecture.

## What changed

The Worker entrypoint is `worker/index.ts`.

- `worker/api.ts` contains the HTTP API.
- Static frontend files are served through Workers Static Assets.
- Neon remains the application database.
- GitHub access remains server-side.
- AI providers remain server-side.
- Run state is stored in Neon.
- The SSE connection owns the active agent run while it is executing.
- The old local shell/terminal worker is **not** part of the Worker runtime.

Cloudflare Workers is built around standard Fetch APIs and Web Streams, so the new API uses `Request`, `Response`, `ReadableStream` and URL routing instead of Fastify's Node HTTP server model. citeturn4search2turn2search0

## Database

Keep Neon Postgres.

The existing `@neondatabase/serverless` driver is designed for serverless/edge environments including Cloudflare Workers, so a D1 migration is not required for this architecture. citeturn3search0turn3search6

Required Worker secret:

- `DATABASE_URL`

## Required secrets and variables

### Secrets

- `DATABASE_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_TOKEN_ENCRYPTION_KEY`
- `AI_PROVIDER_API_KEY` when a real provider is enabled

### Variables

- `PUBLIC_BASE_URL=https://brilina-forge.blinkzdlfx.workers.dev`
- `GITHUB_CALLBACK_URL=https://brilina-forge.blinkzdlfx.workers.dev/auth/github/callback` (optional; derived from `PUBLIC_BASE_URL` when omitted)
- `AI_PROVIDER_MODEL` (optional; defaults to `gpt-4o-mini`)
- `AI_PROVIDER_BASE_URL` (optional)
- `AI_PROVIDER_TIMEOUT_MS` (optional)

Do not configure `FORGE_API_ORIGIN`. The Worker no longer proxies API requests to a separate Forge server.

Cloudflare recommends storing credentials such as API keys as Worker secrets rather than putting them in source code. citeturn4search3

## OAuth

The callback is handled directly by the Worker:

`/auth/github/callback`

The callback must be registered in the GitHub App with the Worker URL.

The existing PKCE and browser-bound OAuth state protections remain in place. The pending server-side state map is still a migration follow-up for multi-instance durability.

## API and streaming

The Worker owns:

- authentication/session
- GitHub repositories and repository context
- conversations
- conversation messages
- run creation
- agent execution
- AI provider selection
- run audit
- usage recording
- SSE run events

The run flow is:

1. `POST /api/conversations/:conversationId/runs` creates a queued run.
2. The browser opens `GET /api/runs/:runId/events`.
3. The first stream atomically claims the queued run.
4. The Worker executes the agent while the SSE response remains open.
5. The Worker emits run/tool/assistant events through a Web Stream.
6. Run status and audit records remain in Neon.

This removes the production dependency on process-local `Set`, `Map`, event buses and detached Node promises. Cloudflare supports streaming responses through standard Web Streams. citeturn2search0

The Worker enables `enable_request_signal` so a disconnected browser can signal cancellation to the active request. citeturn7search0turn7search3

## Execution / terminal

The old terminal implementation used `child_process.spawn`, local filesystem workspaces, shell processes and an interactive WebSocket.

Those are intentionally **not** part of the native Worker API.

Future execution can be added behind an execution adapter, such as a local Brilina Agent or Codespaces. The Worker must not become an unrestricted remote shell for the user's computer.

## Static frontend

Wrangler deploys the Worker and `web/dist` together.

The configuration uses:

- `assets.directory = ./web/dist`
- `not_found_handling = single-page-application`
- `run_worker_first` for API/auth/health routes

Cloudflare Workers Static Assets supports this full-stack Worker + SPA arrangement. citeturn5search0turn5search1

## Local development

```bash
npm run build
npm run dev
```

For local secrets/variables, use `.dev.vars`. Do not commit it.

```text
DATABASE_URL=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_TOKEN_ENCRYPTION_KEY=...
PUBLIC_BASE_URL=http://localhost:8787
GITHUB_CALLBACK_URL=http://localhost:8787/auth/github/callback
AI_PROVIDER_API_KEY=...
```

## Deployment

```bash
npm run build
npm run deploy:cloudflare
```

Wrangler deploys the Worker and frontend assets together. citeturn5search8

After deployment, verify:

1. `/health` reports `runtime: cloudflare-worker`.
2. The React shell loads.
3. `/api/session` returns `authenticated: false` before sign-in.
4. GitHub sign-in reaches the configured callback.
5. A repository can be selected and synced.
6. A conversation can be created.
7. A run can be started.
8. The SSE stream receives events.
9. The final assistant message is persisted in Neon.

## Current migration status

The first native Worker API implementation is now on the migration branch.

Still required before calling the migration complete:

- remove unused Fastify/terminal source and dependencies after route parity is verified
- add full Worker-focused integration tests
- verify a real GitHub App OAuth flow
- verify a real Neon-backed browser session
- verify a real AI provider
- decide the future execution adapter
- move OAuth pending state from process memory to durable storage before multi-instance production use

Do not describe those items as verified until they have been exercised against the deployed Worker.
