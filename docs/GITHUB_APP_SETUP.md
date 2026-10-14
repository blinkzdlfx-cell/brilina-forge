# Brilina Forge — GitHub App setup

This file covers the GitHub App specifically. For the full environment-variable checklist, Neon setup, Cloudflare Workers AI setup, deployment configuration, and end-user workflow, read [Phase 1 Setup and User Guide](PHASE_1_SETUP_AND_USER_GUIDE.md).

## App and callback

Use the existing Brilina Forge GitHub App if one already exists; do not create a duplicate unnecessarily.

- **Homepage URL:** the deployed Brilina Forge origin, e.g. `https://brilina-forge.blinkzdlfx.workers.dev`. Confirm the actual hostname in Cloudflare first.
- **User authorization callback URL:** the deployed origin plus `/auth/github/callback`, e.g. `https://brilina-forge.blinkzdlfx.workers.dev/auth/github/callback`.
- **Webhook URL:** not required for the current Phase 1 workflow.

The deployed callback must match `GITHUB_CALLBACK_URL` exactly. Local development uses a different callback URL and must be configured deliberately before local OAuth testing.

## Credentials

In GitHub **Settings → Developer settings → GitHub Apps → Brilina Forge**:

- `GITHUB_CLIENT_ID`: the GitHub App **Client ID**. Do not substitute the numeric App ID.
- `GITHUB_CLIENT_SECRET`: the App's client secret. Store it only in the Cloudflare Worker secret store or a git-ignored local secret file.

Never commit credentials or paste them into chat, logs, screenshots, or tracked documentation.

## Repository permissions

For the intended Phase 1 coding workflow, the App needs:

- **Contents: Read and write** — required to create or update files on the authorized work branch.
- **Metadata: Read-only** — required repository metadata access.

Only add **Pull requests** permission if the implemented workflow needs it. The previous read-only permission list was insufficient for a coding agent that must commit file changes.

Install the App on the GitHub account that owns or can access the test repository. Ensure the repository is included in the installation's repository selection. After changing App permissions, approve the permission update and reauthorize/reinstall if GitHub prompts you to do so.

## Authentication and sessions

Forge uses GitHub App user authorization with a PKCE-bound OAuth state. The Worker exchanges the authorization code, identifies the GitHub user, and stores session/application state in Neon. GitHub tokens are encrypted at rest using `GITHUB_TOKEN_ENCRYPTION_KEY`.

The existence of these code paths does not prove that live OAuth or production session persistence has passed acceptance; those still require a real browser test.

## Local Worker development

The current primary runtime is Cloudflare Workers. `npm run dev` uses Wrangler, normally at `http://localhost:8787`. For local Worker development, configure `PUBLIC_BASE_URL=http://localhost:8787` and `GITHUB_CALLBACK_URL=http://localhost:8787/auth/github/callback` in a git-ignored `.dev.vars` file, and configure the matching callback in the GitHub App if you are testing local OAuth.

The root `.env.example` also contains legacy Node development settings; it is not automatically loaded by Wrangler. Do not commit `.dev.vars`.

## Phase 1 safety rule

Use a non-default work branch for the first write test. Never silently write to the default branch, and do not mark Phase 1 complete until a real frontend request produces a verified GitHub commit, read-back, and reviewable diff.
