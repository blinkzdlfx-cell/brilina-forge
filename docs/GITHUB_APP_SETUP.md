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

After authorization, the callback creates a development-only in-memory session.

## 6. Phase 1 API acceptance path

1. GET /api/github/me
2. GET /api/github/repos
3. GET /api/github/repos/blinkzdlfx-cell/brilina-forge
4. GET /api/github/repos/blinkzdlfx-cell/brilina-forge/rest
5. GET /api/github/repos/blinkzdlfx-cell/brilina-forge/branches
6. GET /api/github/repos/blinkzdlfx-cell/brilina-forge/context
7. GET /api/github/repos/blinkzdlfx-cell/brilina-forge/tree?ref=main
8. GET /api/github/repos/blinkzdlfx-cell/brilina-forge/file/README.md?ref=main

The selected repository endpoint intentionally uses GraphQL to prove the hybrid REST + GraphQL architecture.

## 7. Important Phase 1 limitation

The session store is intentionally in memory.
Restarting the server invalidates development sessions. Durable users, workspaces, GitHub connections and token persistence are implemented in Phase 2 with Neon.
The browser never receives the GitHub client secret or access token.

## 8. Security requirements before production

Before production:
- replace the development session store with durable server-side persistence;
- encrypt GitHub tokens at rest;
- implement session expiration and revocation;
- add CSRF protection beyond the OAuth state mechanism where appropriate;
- validate installation/repository access;
- add audit events;
- configure HTTPS and secure cookies;
- restrict GitHub App permissions to the minimum required.