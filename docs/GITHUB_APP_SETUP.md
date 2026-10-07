# GitHub App Setup — Phase 1

Brilina Forge uses a GitHub App with the user authorization flow.

GitHub currently recommends GitHub Apps over OAuth Apps for new integrations because Apps support fine-grained permissions, repository selection, and short-lived user access tokens.

## 1. Create the GitHub App

In GitHub:
1. Open Settings → Developer settings → GitHub Apps.
2. Create a new GitHub App.
3. Use Brilina Forge as the application name.
4. Set the homepage to the eventual Forge application URL.
5. Set the callback URL to: http://localhost:3000/auth/github/callback
6. Enable the user authorization/OAuth flow for the App.
7. Keep the App private during initial development.

## 2. Minimum Phase 1 permissions

Use least privilege.

Repository permissions:
- Metadata: Read-only
- Contents: Read-only

Do not grant write permissions yet. Write operations belong behind the Agent Controller and its approval/policy layer.

## 3. Repository access

Install the App on the GitHub account used for testing.
Restrict repository access to the repositories required for development.
The initial test repository is blinkzdlfx-cell/brilina-forge.

## 4. Environment variables

Copy .env.example to .env and provide:
- GITHUB_CLIENT_ID
- GITHUB_CLIENT_SECRET
- GITHUB_CALLBACK_URL

Never commit the client secret.

## 5. Run the backend

Install dependencies: npm install
Start development mode: npm run dev
Health check: GET /health
Start GitHub authorization: GET /auth/github/start

After authorization, the callback creates a durable Forge session in Neon.

## 6. API acceptance path

1. GET /api/session — confirm `{ authenticated: true }` and the GitHub user
2. GET /api/github/me
3. GET /api/github/repos
4. GET /api/github/repos/blinkzdlfx-cell/brilina-forge
5. GET /api/github/repos/blinkzdlfx-cell/brilina-forge/rest
6. GET /api/github/repos/blinkzdlfx-cell/brilina-forge/branches
7. GET /api/github/repos/blinkzdlfx-cell/brilina-forge/context
8. GET /api/github/repos/blinkzdlfx-cell/brilina-forge/tree?ref=main
9. GET /api/github/repos/blinkzdlfx-cell/brilina-forge/file/README.md?ref=main
10. POST /api/github/repositories/sync
11. GET /api/github/repos/blinkzdlfx-cell/brilina-forge/compare?base=main&head=<branch>
12. GET /api/github/repos/blinkzdlfx-cell/brilina-forge/commits?ref=main

The selected repository endpoint intentionally uses GraphQL to prove the hybrid REST + GraphQL architecture.

## 7. Session storage

The session store is **Neon-backed**, not in memory. `src/start.ts` installs `createNeonSessionStore()` from `src/db/repositories.ts` at startup, which persists users, workspaces, memberships, GitHub connections and sessions. Session tokens are hashed before storage, and GitHub access and refresh tokens are encrypted at rest with AES-256-GCM using `GITHUB_TOKEN_ENCRYPTION_KEY`, which is held outside Neon.

Consequences:

- Sessions survive a server restart.
- Expiring GitHub credentials are refreshed transparently on an authenticated request and the new credentials are persisted.
- The workspace slug is keyed on the immutable GitHub user id rather than the login, so a recycled GitHub login cannot inherit a previous owner's workspace row.

An in-memory session store still exists in `src/auth/session.ts` as the default and is used by tests; it is not the runtime store.

The browser never receives the GitHub client secret or access token. It receives only an HttpOnly, `SameSite=Strict` session cookie.

## 8. Security state

Implemented today:

- PKCE (`code_challenge_method: S256`) on the authorization request
- the OAuth `state` value is additionally bound to an HttpOnly `SameSite=Lax` browser cookie, and the callback rejects a state that does not match it — this prevents login CSRF
- session cookie is `HttpOnly; Path=/; SameSite=Strict; Max-Age=86400`, plus `Secure` when `COOKIE_SECURE=true`
- sign-out is `POST /auth/github/logout` with origin validation; a `GET` variant is retained only for older clients and should be removed once unused
- GitHub tokens are encrypted at rest; session tokens are hashed
- token refresh with expiry, and deletion of the session when refresh credentials are unavailable
- least-privilege GitHub App permissions, repository access restricted to the required repositories
- security headers via `@fastify/helmet` and rate limiting via `@fastify/rate-limit`
- audit events recorded in Neon (`runs`, `tool_calls`, `usage_records`)

Still required before production:

- HTTPS with `COOKIE_SECURE=true`
- validate installation and repository access for the deployment environment
- move the OAuth pending-state store out of process memory before running more than one instance
- validate the GitHub App permission set against the current tool surface
- complete the live security verification listed in docs/SECURITY.md