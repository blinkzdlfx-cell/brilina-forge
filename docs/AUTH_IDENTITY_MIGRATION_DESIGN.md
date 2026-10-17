# Brilina Forge — Authentication Identity Migration Design

**Status:** Design checkpoint; not an applied migration.  
**Updated:** 2026-10-17  
**Scope:** Authentication foundation, steps 1–5. GitHub App installation architecture follows this foundation and is tracked separately.

## Goal

Keep one stable Forge user while allowing that user to authenticate with linked providers and connect multiple GitHub accounts. Preserve existing workspaces, conversations, repositories, runs, sessions, and encrypted credentials. Do not change production schema until the source changes and migration have passed temporary-branch verification and the owner explicitly authorizes production application.

## Verified current schema and behavior

- `forge_users.github_user_id` is currently `BIGINT NOT NULL UNIQUE`; `github_login` is `TEXT NOT NULL`. This makes the GitHub account the Forge identity.
- `github_connections` stores encrypted access/refresh-token components and has `UNIQUE(user_id)`, enforcing one GitHub connection per Forge user.
- `createPersistentSession` upserts the Forge user by GitHub ID, upserts the personal workspace using `personal-<github-user-id>`, upserts the connection by `user_id`, and then creates a session.
- `getPersistentSession` joins a session to a connection by Forge `user_id`, so removing the unique connection constraint before changing this query would make the selected token ambiguous.
- `updatePersistentSessionCredentials` updates all connections for a Forge user under the current schema; this must be changed to target one explicit connection before multi-account support.
- The session cookie is opaque; Neon stores its SHA-256 hash. GitHub credentials are encrypted with AES-256-GCM.
- Existing conversations and repository records are keyed to Forge user/workspace IDs, so those IDs must remain stable.

## Target model

1. **Forge user:** stable internal identity; not equivalent to a GitHub login.
2. **Authentication identity:** a verified external subject linked to one Forge user. Use a unique provider + provider-subject pair. GitHub user ID is an immutable subject; do not use login or email as the identity key.
3. **GitHub connection:** one separately addressable credential connection for a GitHub account, linked to the matching GitHub authentication identity. Multiple connections may belong to one Forge user. Encrypt all tokens at rest.
4. **Forge session:** belongs to a Forge user and stores only an opaque session-token hash in Neon. It must carry an explicit active GitHub connection ID when an operation requires one; a future Google/email-only session can exist without a GitHub connection.
5. **GitHub App installation:** separate model introduced in the later GitHub App architecture batch. A GitHub identity/connection is not an installation, and neither alone grants repository access.

## Migration and source-change strategy

Do not drop the current unique constraint or make the current GitHub profile columns nullable in isolation. First update code to use explicit identity and connection IDs, then add an additive migration with the following ordered operations:

1. Create `auth_identities` with UUID primary key, `user_id` FK, constrained provider name, immutable `provider_subject`, profile metadata, timestamps, and unique (`provider`, `provider_subject`). Add a unique composite key for identity ID + user ID where needed for ownership-safe foreign keys.
2. Backfill one GitHub identity for every existing Forge user with a non-null GitHub ID. Use the numeric GitHub ID string as `provider_subject`. The migration must be idempotent or explicitly guarded against duplicate application.
3. Add `auth_identity_id` to `github_connections`, backfill it through the existing Forge user's GitHub ID, validate that every existing connection maps to exactly one identity, and add the foreign key.
4. Add an explicit active-connection reference to `auth_sessions` using an ownership-safe composite foreign key. Backfill each existing session to its current GitHub connection before any account can be switched.
5. Add the unique `(id, user_id)` key needed for the ownership-safe connection reference, then remove `github_connections(user_id)` uniqueness only after all reads/writes use explicit connection IDs.
6. Only after provider-identity reads/writes no longer depend on the legacy columns, make `forge_users.github_user_id` and `github_login` nullable so future Google/email-first identities can exist. Keep legacy profile columns during the compatibility window; do not drop them in this migration.
7. Preserve all existing workspace and conversation IDs. Do not delete or duplicate users, workspaces, sessions, repositories, or run history.

The exact SQL migration will be committed only after the repository source and test inventory confirms the final FK names and query requirements. The migration must include assertions/preflight queries and a documented rollback/recovery procedure. If a migration has partially run, stop and inspect the live schema rather than blindly rerunning it.

## Required implementation sequence (five foundation steps)

1. **Inventory and design:** inspect schema, constraints, OAuth routes, session repositories, ownership checks, tests, and deployment assumptions. Record migration/backfill/rollback design. (Current checkpoint.)
2. **Additive schema and backfill:** implement migration files and automated migration assertions; validate on a temporary Neon branch and compare row counts/orphan counts. Do not apply to production yet.
3. **Explicit connection-scoped session model:** update OAuth persistence, session reads/refresh/logout, and GitHub service creation to select the active connection explicitly. Keep current behavior for existing users.
4. **Safe identity linking:** implement GitHub identity lookup and explicit “connect another GitHub account” flow. Require authenticated Forge session plus proof of control of the additional GitHub identity. Never link by email match alone.
5. **Acceptance and hardening:** test existing-user login/session continuity, multi-account connection and switching, collision/replay/error cases, authorization boundaries, token refresh/revocation, and preservation of conversation/repository/run history. Record build, tests, and evidence before declaring the foundation complete.

## After the five steps: GitHub App architecture

The next major stage is the GitHub App integration: app registration/configuration, installation callback and installation records, installation-token acquisition, repository selection/authorization, per-operation token choice, and isolation tests. It builds on—but is not the same as—the user OAuth/account-linking foundation. The account UI/lifecycle and immutable run-context integration then connect the user’s selected identity/installation/repository/branch to each run.

## Security and rollout rules

- Never send GitHub tokens to the browser or store them in browser storage.
- Never trust a client-supplied connection, installation, repository, or branch without server-side ownership and authorization checks.
- Never merge Forge identities automatically based on matching email addresses.
- Never delete or recreate existing Forge users to simulate linking.
- Keep run context immutable: a run must capture the selected connection/installation, repository, and branch at creation.
- Do not deploy or mutate production database schema without explicit owner authorization and verified temporary-branch results.
