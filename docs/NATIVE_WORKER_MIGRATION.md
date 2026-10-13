# Brilina Forge — Native Worker migration

## Current implementation direction

The accepted production runtime is now a native Cloudflare Worker.

Do not extend the old Fastify server with new application behavior.

Primary Worker files:

- `worker/index.ts`
- `worker/api.ts`

The Worker directly handles the API and serves the React application through
Workers Static Assets.

## Database decision

Keep Neon Postgres.

Do not migrate to D1 as part of this runtime migration. The existing Neon
serverless driver and repository layer already work with the Worker model.

## Run execution model

A run is created in Neon as `queued`.

The browser then opens:

```
GET /api/runs/:runId/events
```

The first stream atomically claims the run and executes the Agent Controller
while the SSE response remains open.

This replaces:

- process-local `activeRuns`
- process-local controller maps
- the in-memory run event bus as the production coordination mechanism
- detached background promises

The Worker uses the request abort signal for cooperative cancellation.

## Execution boundary

Do not reintroduce:

- `child_process`
- local shell execution
- local execution filesystem
- terminal WebSocket
- Fastify

Execution runs on the user's own machine through the companion, which is built
as a separate small Node service. See [Plan — Local execution](PLAN_LOCAL_EXECUTION.md).

## Verification requirements

Before the migration is declared complete, verify:

1. Worker local startup
2. Worker build/deploy
3. `/health`
4. React shell
5. GitHub App OAuth
6. Neon-backed session
7. repository sync
8. conversation creation
9. deterministic run
10. real AI-provider run
11. SSE completion
12. request-disconnect cancellation

Do not report any of these as verified until the actual environment has been
exercised.

## Status

The migration is in progress. The Worker covers authentication, GitHub,
conversations, runs, audit and SSE. The companion and local execution are not
built.

See:

- [Native Worker migration](NATIVE_WORKER_MIGRATION.md)
- [Cloudflare deployment](CLOUDFLARE_DEPLOYMENT.md)
- [Architecture decisions](DECISIONS.md)