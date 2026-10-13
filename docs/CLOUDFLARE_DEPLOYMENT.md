# Brilina Forge — Cloudflare deployment

The production runtime is a native Cloudflare Worker. The legacy Node/Fastify
server in `src/` is local development only and must not gain new application
behavior.

## Files

- `worker/index.ts` — entrypoint, routing, static assets.
- `worker/api.ts` — application routes: auth, GitHub, conversations, runs,
  audit, SSE.
- `worker/api.test.ts`, `worker/oauth-state.test.ts` — Worker tests.
- `wrangler.jsonc` — deployment configuration.
- `scripts/package-web.mjs` — builds and packages the React app for Workers
  Static Assets.

## Configuration

`wrangler.jsonc` declares the Worker name, the compatibility date, the
`assets` directory pointing at the packaged web build, and environment
bindings. Secrets (GitHub credentials, the encryption key, the database URL,
the AI provider key) are supplied through `wrangler secret put` or environment
variables — never committed.

## Runtime

The Worker uses standard Fetch APIs and Web Streams. Neon remains the durable
application database through the serverless driver. GitHub remains the source of
truth for repository code.

The run stream atomically claims a queued run and executes the Agent
Controller while the SSE connection remains open. This removes production
dependence on process-local run ownership and event history. The request abort
signal drives cooperative cancellation.

## Execution

The Worker does **not** run a shell itself. Commands run on the user's own
machine through a small local Node companion that starts only when a command
needs to execute. Output streams back to the browser over SSE. See
[Plan — Local execution](PLAN_LOCAL_EXECUTION.md).

Do not reintroduce `child_process`, local shell execution, a local execution
filesystem, a terminal WebSocket, or Fastify into the Worker.

## Migration-era source

Migration-era Fastify/terminal source remains in the repository for test and
compatibility coverage. It is not used by the Worker runtime and should be
removed only after native route parity and the remaining live checks are
complete.

## Verification

Before the migration is declared complete, verify locally and in deployment:

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

See [Native Worker migration](NATIVE_WORKER_MIGRATION.md).