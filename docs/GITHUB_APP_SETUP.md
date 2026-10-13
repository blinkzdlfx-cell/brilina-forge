# Brilina Forge — GitHub App setup

## What is needed

A GitHub App registered on GitHub with the following:

- **Authorization callback URL:** `https://<your-domain>/auth/github/callback`
- **Webhook URL:** not required for the initial architecture
- **Homepage URL:** `https://<your-domain>`

## Permissions requested

- **Contents:** read
- **Metadata:** read
- **Pull requests:** read

Forge reads repository metadata, branches, trees and files through the GitHub
REST and GraphQL APIs. It does not push, merge, or delete.

## User-level tokens

Forge uses a GitHub App with **user-level** access tokens, not a legacy OAuth
App. Each user authorizes the App once; their tokens are encrypted at rest in
Neon and refreshed automatically.

## Session storage

Sessions are **Neon-backed**, not in-memory. The session store is created with
`createNeonSessionStore()` in `src/db/repositories.ts`. Session tokens are
hashed; the plaintext token never reaches the database.

A multi-instance deployment can therefore serve the same session store without
a process-local in-memory fallback.

## State binding

The OAuth `state` is bound to an `HttpOnly` browser cookie set at
`/auth/github/start` and verified at the callback. The cookie carries
`state.verifier` so the PKCE verifier travels with the state. This closes the
login CSRF window: an attacker cannot complete their own authorization and
hand the victim a callback URL.

## Local development

For local work, set `GITHUB_CALLBACK_URL=http://localhost:3000/auth/github/callback`
in `.env`.

## Notes

- GitHub remains the source of truth for repository code.
- The companion is disposable and holds no source.
- Do not install OpenCode or Kilo Code on the companion in the current
  architecture.