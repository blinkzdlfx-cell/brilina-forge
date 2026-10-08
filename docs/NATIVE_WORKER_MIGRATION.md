# Native Worker migration

## Purpose

This document records the implementation work that replaces the old Node/Fastify runtime with a native Cloudflare Worker.

## Target architecture

```
React browser
     |
     v
Cloudflare Worker
     |
     +-- Auth / sessions
     +-- GitHubService
     +-- Conversations
     +-- Agent Controller
     +-- AI provider
     +-- SSE
     |
     v
Neon Postgres
```

GitHub remains the source of truth for repository code.

Execution is outside the Worker. A future execution adapter may connect the Worker to Codespaces or a local Brilina Agent.

## Implemented on this branch

### 1. Worker-native API

Added:

- `worker/api.ts`
- native Fetch routing
- native JSON responses
- cookie handling
- same-origin checks
- GitHub authentication
- GitHub repository routes
- conversation routes
- run creation
- run audit
- cancellation
- SSE run streaming
- Agent Controller execution

### 2. Worker entrypoint

`worker/index.ts` now:

1. sends application API requests to `worker/api.ts`
2. adds security headers
3. serves all other requests through the Workers Static Assets binding

There is no API-origin proxy.

### 3. Runtime configuration

`src/config.ts` now supports Worker bindings through `configureRuntimeEnv()`.

AI provider configuration also comes through the shared config instead of direct `process.env` access.

### 4. Run lifecycle

The old runtime used process-local state:

- active run sets
- controller maps
- in-memory event bus
- detached promises

The Worker implementation instead uses:

- Neon run records
- an atomic queued-to-running claim
- an SSE stream as the execution lifetime
- the request abort signal for cooperative cancellation

Cloudflare's `waitUntil()` is not used as the agent job system because it only extends background work for up to 30 seconds after a response/disconnect. A streamed HTTP request can remain active while its response body is streaming. citeturn2search1turn2search2turn2search9

## Routes currently implemented

### Authentication

- GET `/auth/github/start`
- GET `/auth/github/callback`
- GET/POST `/auth/github/logout`
- GET `/api/session`

### GitHub

- GET `/api/github/me`
- GET `/api/github/repos`
- GET `/api/github/repos/:owner/:repo`
- GET `/api/github/repos/:owner/:repo/rest`
- GET `/api/github/repos/:owner/:repo/context`
- GET `/api/github/repos/:owner/:repo/branches`
- GET `/api/github/repos/:owner/:repo/tree`
- GET `/api/github/repos/:owner/:repo/file/*`
- GET `/api/github/repos/:owner/:repo/compare`
- GET `/api/github/repos/:owner/:repo/commits`
- POST `/api/github/repositories/sync`

### Conversations

- GET/POST `/api/conversations`
- PATCH `/api/conversations/:conversationId`
- GET `/api/conversations/:conversationId/messages`
- GET/POST `/api/conversations/:conversationId/runs`

### Runs

- GET `/api/runs/:runId/events`
- GET `/api/runs/:runId/audit`
- POST `/api/runs/:runId/cancel`

## Intentionally removed from the Worker design

These are not part of the target runtime:

- Fastify
- `@fastify/websocket`
- `@fastify/helmet`
- `@fastify/rate-limit`
- local shell execution
- `child_process`
- local execution filesystem
- terminal WebSocket
- permanent Node API server
- `FORGE_API_ORIGIN`

The old files are being removed only after route parity and Worker deployment are verified so that functionality is not silently lost during the migration.

## Neon decision

Neon remains in place.

The existing Neon serverless driver is suitable for Cloudflare Workers, and the existing PostgreSQL schema/repository layer already matches Forge's durable state model. citeturn3search0turn3search6

D1 migration is intentionally outside this migration.

## Verification still required

The implementation is not considered production-complete until these are tested:

1. `npm run build`
2. `npm run test:worker`
3. Wrangler local Worker startup
4. deployed `/health`
5. deployed React shell
6. real GitHub App sign-in
7. real Neon session creation
8. repository sync
9. conversation creation
10. deterministic run
11. real AI-provider run
12. SSE completion
13. cancellation after browser disconnect

No live OAuth, Neon or AI result should be claimed from code inspection alone.


## Latest hardening

OAuth no longer keeps the PKCE verifier in a process-local map. The Worker stores the state and verifier in the browser-bound HttpOnly OAuth cookie and validates the state during callback. This makes the OAuth flow independent of Worker isolate affinity.

Worker runtime configuration and the Neon session store are also configured from the current request environment rather than retained from an earlier request.
