# Phase 1 Hardening

Status: **accepted**

## Scope

Phase 1 hardening closes the main development-foundation gaps without moving durable state into Neon.

### Authentication
- PKCE (S256) added to the GitHub App web authorization flow.
- OAuth state expires after 10 minutes and is consumed after callback.
- Expiring GitHub user access tokens are captured.
- Refresh tokens and expiration timestamps are held by the development session.
- Access tokens are refreshed automatically when within 60 seconds of expiry.
- Expired/unrefreshable authorization invalidates the session and requires sign-in again.
- In-memory sessions expire after 24 hours.

GitHub user access tokens normally expire after 8 hours and refresh tokens after 6 months when expiring tokens are enabled. GitHub rotates the refresh token when a refresh occurs, so the replacement is stored in the session.

### GitHub API safety
- REST and GraphQL errors are normalized.
- Rate-limit metadata and Retry-After are preserved.
- GitHub response bodies are sanitized before being exposed through API errors.
- Repository/owner/ref/path inputs are validated.
- Repository pagination parameters are validated.
- Directory responses are rejected by the file endpoint.
- Recursive tree results are capped at 20,000 entries while preserving GitHub's own truncated signal.

### Explicit non-goals
- Durable GitHub credential storage remains Phase 2/Neon work.
- Token encryption at rest remains a Phase 2 persistence concern.
- Full repository context is not sent to an AI model; progressive context assembly remains an Agent Controller concern.
- Production deployment hardening is Phase 7.

## Acceptance checklist

Run:
- npm test
- npm run build

Then manually:
1. Open /auth/github/start and complete GitHub authorization.
2. Confirm the callback reports authenticated=true and includes tokenExpiresAt.
3. Call /api/github/me and verify the authenticated GitHub account.
4. Call /api/github/repos and verify repositories are returned.
5. Call /api/github/repos/blinkzdlfx-cell/brilina-forge and verify GraphQL metadata.
6. Call /api/github/repos/blinkzdlfx-cell/brilina-forge/branches and verify main is present.
7. Call /api/github/repos/blinkzdlfx-cell/brilina-forge/context and verify defaultBranch=main, a commit SHA exists, and tree.truncated=false.
8. Read README.md through the file endpoint and verify the decoded content contains Brilina Forge.
9. Verify invalid requests:
   - missing tree ref -> 400
   - page=0 -> 400
   - file path containing ../ -> 400
10. Log out and confirm GitHub API endpoints return 401.
11. Sign in again. Do not expose any access or refresh token in chat, logs, screenshots, or GitHub.

## Token refresh test

For local development only, temporarily set the authenticated session's expiresAt to less than 60 seconds in the future, then call /api/github/me. The server should refresh the token and continue successfully.

Do not commit token values or test modifications.

If the refresh token is expired or revoked, the expected behavior is a 401 requiring GitHub sign-in again.

## Completion gate

Phase 1 hardening is complete when:
- npm test passes.
- npm run build passes.
- The real OAuth acceptance path passes.
- Invalid-input checks pass.
- Logout/re-authentication passes.
- Token-refresh behavior is verified locally.
- No secrets are exposed in responses or repository files.

Acceptance gate passed on 2026-09-22. Phase 2 Neon implementation may begin.
