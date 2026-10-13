# Brilina Forge — Local development

## Prerequisites

- Node.js >= 20
- A `.env` file at the project root (copy from `.env.example`, never commit it)
- A Neon database with the migrations applied
- A GitHub App registered and configured

## Environment variables

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Neon Postgres connection string |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub App credentials |
| `GITHUB_CALLBACK_URL` | OAuth redirect; defaults to `<PUBLIC_BASE_URL>/auth/github/callback` |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Base64-encoded 32-byte AES-256 key |
| `PUBLIC_BASE_URL` | Production base URL; defaults to `http://localhost:3000` |
| `AI_PROVIDER_BASE_URL` | OpenAI-compatible endpoint; defaults to `https://api.openai.com/v1` |
| `AI_PROVIDER_MODEL` | Default model; defaults to `gpt-4o-mini` |
| `AI_PROVIDER_API_KEY` | Leave empty to run the deterministic development adapter |
| `AI_PROVIDER_TIMEOUT_MS` | Provider request timeout; defaults to 120_000 |
| `EXECUTION_ROOT_DIR` | Companion workspace root; defaults to a `brilina-forge-worker` directory in the system temp directory |

Leaving `AI_PROVIDER_API_KEY` empty keeps the deterministic development adapter
active; that is the expected default for local work.

## Running

**Terminal A — backend, from project root: `npm run dev:node`**

The root script loads `.env` and starts `src/start.ts` through `tsx`. Default
port is 3000. Keep it open.

**Terminal B — frontend, from project root: `npm --prefix web run dev`**

Vite prints the URL, commonly `http://localhost:5173`. Open the exact URL
printed. Check `web/vite.config.ts` for the API proxy configuration; do not
assume relative `/api` requests are proxied unless the config confirms it.

## Testing

`npm test` runs the backend suite (Node's built-in test runner via `tsx`).
`npm run build` type-checks the backend. `npm --prefix web run build` builds the
frontend.

## Manual checks

- Sign in with GitHub and create a conversation.
- Select a repository and branch.
- Send a message and watch the SSE stream.
- Verify `GET /health`, `GET /api/session`, and the protected routes returning
  401 without a session.
- Check browser Network/Console and the backend terminal logs for failures.

Execution on the user's machine is not available locally until the companion is
built. The command policy is exercised through unit tests only.

## Stopping

Press Ctrl+C in each terminal.