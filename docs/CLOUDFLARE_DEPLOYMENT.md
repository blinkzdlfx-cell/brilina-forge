# Cloudflare Workers deployment

Brilina Forge is split into two runtime planes:

- **Cloudflare Worker**: serves the React/Vite application from Workers Static Assets and acts as the same-origin edge gateway for `/api/*`, `/auth/*`, and `/health`.
- **Forge API origin**: runs the existing Node.js/Fastify application. It owns GitHub OAuth, Neon access, AI provider calls, SSE run events, and the local execution service.

This split is intentional. The current Fastify application is a Node server and should not be bundled directly into a Worker. In particular, the terminal execution service uses `node:child_process`, filesystem access, and long-lived processes. Cloudflare Workers does not provide that execution model. If an all-Cloudflare deployment is required later, the API/execution plane should move into Cloudflare Containers rather than pretending the Fastify process is a Worker.

## Cloudflare Workers build settings

Use the repository root as the build root.

- **Build command:** `npm run build:cloudflare`
- **Deploy command:** `npm run deploy:cloudflare`
- **Root directory:** `/`
- **Output directory:** not required; Wrangler reads `web/dist` from `wrangler.jsonc`

The Worker configuration is committed in `wrangler.jsonc`.

## Required Worker variable

Configure this non-secret Worker variable:

`FORGE_API_ORIGIN=https://<your-node-forge-api>`

Do not put database credentials, GitHub secrets, AI keys, or encryption keys in this variable. Those remain on the API origin.

The browser continues to call relative URLs such as `/api/session`. The Worker proxies them to `FORGE_API_ORIGIN`, so the browser stays same-origin and no public API CORS configuration is required.

## Backend configuration

The Node/Fastify origin must use the public Worker URL as its public application URL:

`PUBLIC_BASE_URL=https://brilina-forge.blinkzdlfx.workers.dev`

The GitHub OAuth callback URL must therefore be:

`https://brilina-forge.blinkzdlfx.workers.dev/auth/github/callback`

Keep the existing backend secrets on the backend:

- `DATABASE_URL`
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_TOKEN_ENCRYPTION_KEY`
- `AI_PROVIDER_API_KEY` and related provider settings, when used

The backend must be reachable over HTTPS by the Worker.

## Deployment flow

```text
GitHub
  |
  | npm run build:cloudflare
  v
web/dist
  |
  | Wrangler
  v
Cloudflare Worker
  |\
  | \__ static assets -> React SPA
  |
  +---- /api/*, /auth/*, /health
             |
             v
       Node/Fastify API
             |
       +-----+-----+----------------+
       |           |                |
      Neon       GitHub        AI provider
       |
  local execution service
  (Node/container host)
```

The React build is uploaded as Workers Static Assets. SPA routes fall back to `index.html`. API/auth routes are executed by the Worker first and forwarded to the backend.

## Important production limitation

The existing local execution worker is intentionally a development/local implementation. It starts shell processes with `child_process.spawn`. It cannot be moved into the ordinary Workers isolate simply by enabling Node compatibility.

For a fully Cloudflare-native production Forge, the next infrastructure step is to run the API/execution plane in a Cloudflare Container and have the Worker route requests to that container. Cloudflare Containers are a paid Workers feature. Until that is provisioned, deploy the existing Node/Fastify API on a normal Node host and keep this Worker as the edge/frontend gateway.

## Local Worker development

Build the frontend first:

```bash
npm run build:cloudflare
```

Then run:

```npx wrangler@4.68.0 dev
```

For local API proxying, create a local `.dev.vars` file:

```text
FORGE_API_ORIGIN=http://localhost:3000
```

Do not commit `.dev.vars`.

## Cloudflare dashboard

If the Worker is connected to GitHub through Workers Builds, make sure the dashboard is not using an old framework auto-configuration. The committed `wrangler.jsonc` should be the source of truth for the deployment.

After the first successful deployment:

1. Confirm the Worker serves the React shell.
2. Confirm a generated JS asset returns JavaScript rather than `index.html`.
3. Confirm `/health` reaches the API origin.
4. Confirm `/api/session` returns the unauthenticated session response.
5. Confirm GitHub OAuth callback uses the Worker hostname.
6. Test SSE run events.
7. Test the terminal WebSocket only after the Node/execution origin is reachable.
