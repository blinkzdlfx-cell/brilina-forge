# Brilina Forge — Native Worker Migration

## Current implementation direction

The accepted production runtime is a native Cloudflare Worker. Do not extend the old Fastify server with new application behavior.

Primary Worker files:
- `worker/index.ts`
- `worker/api.ts`

The Worker handles the API and serves the React application through Workers Static Assets.

## Database decision

Keep Neon Postgres. Do not migrate to D1 as part of this runtime migration. The existing Neon serverless driver and repository layer are intended to fit the Worker model.

## Current run execution model

A run is created in Neon as `queued`. The browser opens `GET /api/runs/:runId/events`; the Worker attempts to claim and execute the Agent Controller while the SSE response remains open.

This pattern must not be treated as fully reliable until reconnect, duplicate subscribers, disconnect, cancellation, timeout, durable results, event replay and abandoned-run recovery are verified. See [Architecture](ARCHITECTURE.md) and [Testing](TESTING.md).

## Execution boundary

Do not reintroduce:
- `child_process` or shell execution in the Worker;
- a local execution filesystem in the Worker;
- a terminal WebSocket;
- new product behavior in legacy Fastify.

Local execution is a **future Phase 3** capability delivered through a separate Node.js companion on the user's computer. Partial Worker routes and database scaffolding do not mean the companion is implemented. See [Plan — Local execution](PLAN_LOCAL_EXECUTION.md).

## Migration verification checklist

Verify the following in the actual environment before marking the runtime fully verified:
1. Worker local startup and production build;
2. `/health` and React static shell;
3. GitHub App OAuth and Neon-backed session;
4. repository/branch selection and conversation creation;
5. deterministic run and real AI-provider run;
6. SSE completion, reconnect, and cancellation;
7. deployed route behavior and browser acceptance.

The current product delivery priority is Phase 1 in [Roadmap](ROADMAP.md): usable AI coding through GitHub. Migration verification is a prerequisite checkpoint, not a reason to implement every later phase at once.