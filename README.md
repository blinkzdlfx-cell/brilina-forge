# Brilina Forge

**Brilina Forge — AI-Assisted Software Development Workspace**

Brilina Forge is a GitHub-centered workspace for controlled AI-assisted software engineering.

## Current architecture

The production target is a single native Cloudflare Worker:

```
Browser
   |
   v
Cloudflare Worker
   |-- React static assets
   |-- GitHub authentication
   |-- Forge API
   |-- Agent Controller
   |-- AI provider
   |-- SSE run stream
   |
   v
Neon Postgres
```

GitHub remains the source of truth for repository code. Neon stores Forge application state.

Unknown `/api/*`, `/auth/*`, and `/health` paths return JSON 404 responses instead of falling through to the SPA shell.

The Worker does **not** run a local shell. Terminal/execution is a separate future adapter and may use Codespaces or a local Brilina Agent.

## Important migration decision

The old Fastify/Node API is being replaced by native Worker routing.

Do not add new application routes to `src/server.ts`.

New Worker API work belongs in:

- `worker/index.ts`
- `worker/api.ts`

The old Node runtime is migration-era code and will be removed after route parity and live Worker verification.

## Current status

The repository contains the first native Worker implementation.

Implemented on the migration branch:

- native Worker API routing
- GitHub login and session handling
- GitHub repository APIs
- Neon-backed conversations and sessions
- Agent Controller execution
- deterministic AI provider
- OpenAI-compatible provider integration
- run audit and usage persistence
- SSE run streaming
- Worker security headers
- Worker request cancellation support
- Workers Static Assets + React SPA

Still unverified:

- live GitHub App OAuth
- live Neon browser flow
- live AI provider
- deployed run/SSE flow
- browser acceptance
- final removal of Fastify and legacy terminal code

See [Native Worker migration](docs/NATIVE_WORKER_MIGRATION.md).

## Database

**Neon Postgres remains the database.**

D1 is not part of the Worker migration. The existing Neon serverless driver and PostgreSQL repository layer already fit the Worker architecture.

## Run lifecycle

1. The browser creates a run.
2. The run is stored as `queued` in Neon.
3. The browser opens the run SSE endpoint.
4. The first stream atomically claims the run.
5. The Worker executes the Agent Controller while the stream remains open.
6. Run/tool/assistant events are streamed to the browser.
7. Final run state and messages are persisted in Neon.

This avoids relying on Worker-isolate process memory for run ownership.

## Local development

The default development command is Wrangler:

```bash
npm install
npm run build
npm run dev
```

Use `.dev.vars` for local Worker secrets and variables. Never commit it.

For the legacy Node runtime during migration only:

```bash
npm run dev:node
```

Do not build new features against that runtime.

## Deployment

```bash
npm run build
npm run deploy:cloudflare
```

See [Cloudflare Worker deployment](docs/CLOUDFLARE_DEPLOYMENT.md).

## Documentation

- [Native Worker migration](docs/NATIVE_WORKER_MIGRATION.md)
- [Cloudflare deployment](docs/CLOUDFLARE_DEPLOYMENT.md)
- [Agent handoff](docs/AGENT_HANDOFF.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Requirements](docs/REQUIREMENTS.md)
- [Roadmap](docs/ROADMAP.md)
- [Security](docs/SECURITY.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Testing strategy](docs/TESTING.md)
- [Database and API reference](docs/DATABASE_AND_API_REFERENCE.md)
- [GitHub App setup](docs/GITHUB_APP_SETUP.md)
- [Local development](docs/LOCAL_DEVELOPMENT.md)

## Development rule

**Documentation → architecture decision → implementation → test → verification**

Do not silently replace accepted architectural decisions.
