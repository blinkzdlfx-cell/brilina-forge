# Brilina Forge — GitHub App Architecture

**Status:** architecture baseline; implementation is sequenced after the identity/session migration gate.  
**Updated:** 2026-10-17  
**Scope:** product-level GitHub App installation, repository authorization, token selection, and immutable run context.

## Decisions

- Use one official Brilina Forge GitHub App for the product. Users and organizations install that same App; do not create an App per user.
- Keep four concepts distinct: Forge user, GitHub login identity, GitHub OAuth connection, and GitHub App installation. An OAuth connection proves the user authorized Forge; an installation grants the App only the repositories and permissions selected by the installation owner.
- OAuth user tokens and installation access tokens are separate credentials with different principals. Never use one as proof of the other.
- All credentials remain server-side and encrypted at rest. Installation access tokens are short-lived and should be minted on demand; do not persist plaintext installation tokens.
- Every tool invocation must resolve the exact Forge user, connection or installation, repository, and branch on the server. Client-supplied IDs are selectors, not authorization.
- A run captures an immutable context snapshot at creation. Switching accounts, installations, repositories, or branches cannot redirect an in-flight run.
- No default-branch writes. Writes are restricted to authorized working branches and must read back the changed files and return commit/diff evidence.

## Data model

1. `github_app_installations`: GitHub installation ID, account ID/login/type, repository-selection mode, granted permissions, suspension/deletion timestamps, timestamps.
2. `github_installation_access`: explicit Forge-user access to an installation, with the identity that established the link and timestamps. Multiple Forge users may have access to an organization installation when independently authorized; one user's connection does not automatically authorize every Forge user.
3. `github_installation_repositories`: installation-scoped repository IDs/node IDs, owner/name/full name, default branch, archived/private flags, last sync time. This is a cache, not the authorization source of truth; the App API remains authoritative.
4. Installation selection on a session/run is stored by ID. Existing `repositories.github_connection_id` remains the OAuth credential relationship for compatibility until repository access has been moved to explicit installation context.
5. Extend run context with connection ID, installation ID, repository full name, and branch. Snapshot fields are immutable once a run starts.

## OAuth and installation lifecycle

1. Continue the current GitHub user authorization flow with one-time state and PKCE to authenticate a Forge user.
2. A signed-in user starts the GitHub App installation flow. Generate a random, short-lived, single-use state bound to the authenticated Forge session; store only its hash server-side.
3. GitHub returns to the setup callback with `installation_id`, `setup_action`, and `state`. Validate state, retrieve the installation through GitHub's API using the App's server-side private key, validate the installation account and permissions, and record/link it.
4. For organization installations, never assume the installer has access to every organization repository from their OAuth identity alone. Verify that the installation and selected repositories are available to the app and explicitly link installation access to the authenticated Forge user.
5. Synchronize repository selection from the installation API and, where configured, installation webhooks for installation created/deleted/suspend/unsuspend and repository added/removed events. A removed or suspended installation immediately blocks new operations even if cached repositories remain.
6. Disconnecting a Forge user's link removes that user's access mapping; it does not uninstall the App for the organization or other Forge users. Uninstall/revoke is an explicit GitHub-side lifecycle event.

## Token policy

- Use an installation token for app-led repository automation and only for repositories/permissions granted to that installation.
- Use a user OAuth token only for operations explicitly performed on behalf of the connected GitHub identity and permitted by that token's scopes.
- Centralize token resolution in a server-side service. No endpoint or tool should independently choose a token based only on the requested owner/repository string.
- Cache installation tokens only in isolate memory with expiry margin; treat cache as an optimization, never as an authorization record.
- Fail closed on missing permissions, suspended/deleted installations, stale repository selection, or unresolved ownership. Redact tokens and authorization headers from errors/logs.

## API and UI contract

- Add authenticated routes for starting installation, processing setup callback, listing linked installations, refreshing repository selection, and disconnecting a user's link.
- Add an account/context panel that shows connected GitHub identities and installations separately, then only repositories authorized by the selected context.
- Every API response should distinguish account connection from App installation and include stable IDs plus display labels.
- Avoid mixing account management with the compact chat composer. Keep selectors in the existing context dialog/panel.
- Installation callbacks and webhook deliveries must be idempotent. Verify webhook signatures and delivery IDs before processing events.

## Required acceptance

- Existing GitHub OAuth login/session and all existing Forge data remain usable after migration.
- Two GitHub identities can be connected to one Forge user without auto-link-by-email; each OAuth refresh updates only the selected connection.
- Install the same Brilina Forge App on a personal account and a test organization with selected repositories; verify only selected repos appear.
- A user without access to an installation cannot enumerate its repositories or mint/use its installation token.
- Attempt cross-user, cross-installation, removed-repository, and suspended-installation operations; all must fail closed.
- Create a run, switch selected account/installation/repository/branch mid-run, and prove the run still uses its original immutable context.
- Run the real AI-to-GitHub acceptance: create/use a non-default working branch, write a test file, read it back, show actual diff/commit, and verify no default-branch mutation.


## Implementation status — 2026-10-17

The initial server-side implementation is in `feat/auth-github-app-complete`: App JWT and installation-token client, session-bound installation state, installation/access/repository persistence, ownership-filtered installation/repository/branch APIs, signed webhook handling, and conversation/run installation context. Account/install selectors have been added to the context dialog. Automated CI and live browser/GitHub acceptance have not yet passed; do not treat the architecture as complete until the recorded acceptance checklist below is demonstrated. The installation cache is never the authorization source of truth: each run rechecks the selected installation and repository authorization before token use.


## Automated verification result — 2026-10-17
CI passed on integration commit `d5ad4e1029e0ea2a3572df698c9ee70624d3ee91`: build, phase-1 typecheck, phase-1 tests, Worker tests, Wrangler dry-run, and dependency security audits. This does not substitute for live GitHub App configuration, installation callback/webhook verification, production schema rollout, or the real AI write/read-back/diff acceptance.


## GitHub App dashboard setup checklist

Before live installation testing, configure the single Brilina Forge GitHub App:

- **Setup URL:** `https://brilina-forge.blinkzdlfx.workers.dev/auth/github-app/callback`
- **Webhook URL:** `https://brilina-forge.blinkzdlfx.workers.dev/api/github-app/webhook`
- **Webhook events:** `installation` and `installation_repositories` (the installation-created delivery is used to verify who installed the App before a new installation is linked).
- **Core permissions:** repository metadata read and contents read/write. Add issues, pull requests, Actions, deployments, or security permissions only when those tool categories are enabled and needed.
- Save the App ID, App slug, generated private key, and webhook secret as Cloudflare Worker secrets/variables: `GITHUB_APP_ID`, `GITHUB_APP_SLUG`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`.
- Keep `GITHUB_MULTI_ACCOUNT_ENABLED=false` until migration 008 is applied and verified.
- Do not commit private keys, webhook secrets, access tokens, or installation tokens into the repository.


### Installation callback verification
A new installation is linked only after a valid signed `installation.created` webhook confirms that the sender GitHub ID matches the GitHub identity bound to the current Forge session. The callback does not trust the `installation_id` query parameter alone. If the webhook has not arrived yet, the state remains unused so the callback can be retried. An `update` callback is accepted only for an installation already linked to the same Forge user. Webhook delivery IDs are idempotent and failed deliveries can be retried.


## Final source/temporary-schema checkpoint — 2026-10-17

The current integration head is `32ba5e8af530f27850002cb5d681860a78251dfe` on `feat/auth-github-app-complete`, PR #14. CI run `39062142344` passed build, typecheck, Phase 1 tests, Worker tests, Wrangler dry-run, and dependency audits. Temporary Neon verification confirmed the staged 006+007 schema preserves the legacy unique constraint and compatibility triggers; the 006–008 schema removes only the legacy single-column uniqueness and retains clean connection/session ownership and run snapshots. Production remains unchanged. Follow the exact staged rollout in `docs/CURRENT_STATE_AND_CONTINUATION.md`; live App setup, callback/webhook, account-switching and real AI write/read-back/diff acceptance are still pending.


### Documentation-head verification — 2026-10-17
The documentation-complete integration head is `f18722e8cb8438a96765da064af7d53be840e2a5`. GitHub Actions run `39063266378` completed successfully on this exact SHA; both `verify` and `security-audit` jobs passed. This is the current source/documentation verification checkpoint. It still does not imply a production merge/deploy or live GitHub App acceptance.
