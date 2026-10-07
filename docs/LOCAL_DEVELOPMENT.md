# Local Development — Windows PowerShell

## Requirements
- Node.js 20+ and npm.
- Git for pulling the repository.
- Configured GitHub App and Neon development database for authenticated end-to-end tests.

Check versions with **node --version**, **npm --version**, and **git --version**.

## Update source
From the project root (folder containing package.json), run **git checkout main**, then **git pull origin main**, then **git status**. Confirm the local branch is current. Inspect local changes before overwriting or resetting anything.

## Install dependencies
From project root:
- **npm install** installs backend dependencies.
- **npm --prefix web install** installs the separate frontend dependencies. This works without changing into web/.

## Configure environment
Copy .env.example to .env and edit locally. Runtime config in src/config.ts is authoritative if anything differs. Template variables include NODE_ENV, HOST, PORT, PUBLIC_BASE_URL, GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, GITHUB_CALLBACK_URL, COOKIE_SECURE, DATABASE_URL, GITHUB_TOKEN_ENCRYPTION_KEY, AI_PROVIDER_BASE_URL, AI_PROVIDER_MODEL, AI_PROVIDER_API_KEY, AI_PROVIDER_TIMEOUT_MS, and EXECUTION_ROOT_DIR.

Leaving AI_PROVIDER_API_KEY empty keeps the deterministic development adapter active; that is the expected default for local work. EXECUTION_ROOT_DIR controls where disposable terminal session directories are created and defaults to a brilina-forge-worker directory in the system temp directory.

Use a Neon development branch for local experimentation. GitHub callback URL must exactly match the GitHub App configuration. COOKIE_SECURE should be false for local HTTP and true only behind HTTPS. GITHUB_TOKEN_ENCRYPTION_KEY is a base64-encoded 32-byte key for AES-256-GCM. Never commit or share .env, database URLs, OAuth secrets, tokens, or encryption keys.

## Build
From project root:
- **npm run build** builds backend TypeScript.
- **npm --prefix web run build** type-checks and bundles the frontend.
- **npm test** runs backend Node tests.

A successful build does not prove OAuth, Neon connectivity, SSE, or end-to-end UI behavior.

## Run separate development servers
Terminal A — backend, from project root: **npm run dev**. Root script loads .env and starts src/start.ts through tsx. Default port is 3000. Keep terminal open.

Terminal B — frontend, from project root: **npm --prefix web run dev**. Vite prints the URL, commonly http://localhost:5173. Open the exact URL printed and keep terminal open. Check web/vite.config.ts for the API proxy configuration; do not assume relative /api requests are proxied unless the current config confirms it.

## Built frontend through Fastify
Run **npm run build**, **npm --prefix web run build**, then **npm start**. Fastify serves web/dist, usually at http://localhost:3000. If the frontend was not built, the fallback responds with frontend_not_built. Inspect src/web-serving.ts if behavior differs.

## Smoke test
- Open http://localhost:3000/health and confirm JSON response.
- Complete GitHub sign-in; protected endpoints otherwise return 401.
- Confirm repositories and branches load.
- Create a conversation, send a message, confirm events stream, reopen conversation and check history.
- Without AI_PROVIDER_API_KEY the runtime uses the deterministic development adapter. With a key it uses the OpenAI-compatible adapter; neither has been verified against a live endpoint from this project.
- Open the terminal panel, start a session, and run an allow-listed command such as `ls`. Note that the worker is local with no isolation boundary.
- Inspect browser Network/Console and backend terminal logs for failures.

## Stop
Press Ctrl+C in each terminal.

## Troubleshooting
| Symptom | Check |
|---|---|
| npm not recognized | Install Node 20+ and reopen PowerShell; check PATH. |
| Backend build error | Capture full output; check root dependencies and Node version. |
| Frontend build error | Run npm --prefix web install, retry, capture full output. |
| Port conflict | Identify process; update port and callback consistently only if needed. |
| 401 from API | Sign-in/session/cookie expiry and backend logs. |
| OAuth callback failure | GitHub App credentials, exact callback URL and authorization configuration. |
| Neon failure | Development DATABASE_URL, branch availability, encryption key format. Never expose credentials. |
| API errors on Vite URL | Inspect web/vite.config.ts proxy and ensure backend is running. |
| SSE stalls | Check EventSource request, auth/session, run ownership and backend logs. |
| Keyboard repeats input | Stop issuing commands; test the keyboard separately and isolate hardware input. |

