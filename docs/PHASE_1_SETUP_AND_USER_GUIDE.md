# Brilina Forge — Phase 1 Setup and User Guide

**Last reviewed:** 2026-10-14  
**Current gate:** Phase 1 is still open. Draft PR #7 passed its focused CI checks and dependency audits on commit `b77ed1750f9ce72e8536ad5007b0fb329df8deef` (GitHub Actions run 201). Merge/deploy and live acceptance are still required.

## 1. What Brilina Forge needs

Brilina Forge is a browser-based AI coding workspace. Its intended first workflow is:

1. Sign in with GitHub.
2. Choose a repository and a non-default work branch.
3. Ask a real AI model to inspect and change code.
4. Have Forge write the changes to GitHub, read them back, and show a reviewable diff and commit.
5. Keep the run and conversation history in Neon.

The current production architecture is a Cloudflare Worker with a React frontend, Neon Postgres for app state, GitHub for source code, and an OpenAI-compatible AI provider adapter.

**Implementation status:** the initial source inspection found placeholder write tools and missing registration. Draft PR #7 now implements branch creation plus file create/update/upsert tools and registers them through the repository-tool factory used by the Worker. The focused Phase 1 type-check, tests, Worker tests, frontend build, Wrangler dry-run, and dependency audits passed on commit `b77ed1750f9ce72e8536ad5007b0fb329df8deef` (GitHub Actions run 201). This is not proof of a working production workflow: the change still needs review, merge/deploy, and a real frontend-to-GitHub acceptance test before Phase 1 can close. The broad legacy `npm test` suite also currently fails on pre-existing issues in `src/server.ts` and local-companion tests, so it is not being treated as a passing check.

## 2. Start with one AI provider: Cloudflare Workers AI

Forge currently uses an OpenAI-compatible HTTP adapter. Cloudflare Workers AI provides a compatible Chat Completions endpoint, so a separate provider integration should not be needed for the initial configuration, provided the chosen model returns tool calls in the format the adapter expects.

Cloudflare documentation:
- Workers AI OpenAI-compatible endpoint: https://developers.cloudflare.com/workers-ai/configuration/open-ai-compatibility/
- Workers AI model catalogue: https://developers.cloudflare.com/workers-ai/models/

### 2.1 Create a Workers AI API token

1. Sign in to the Cloudflare dashboard.
2. Open **Workers AI** and select **Use REST API**.
3. Create a Workers AI API token using the provided template.
4. Copy the Cloudflare **Account ID** from that page.
5. Store the token in a password manager or directly in the secret field where it will be configured. Do not put it in GitHub, this document, a screenshot, or a chat message.

If creating a custom token instead of using Cloudflare's template, follow Cloudflare's current Workers AI REST API instructions for the required permissions. The current guide lists **Workers AI - Read** and **Workers AI - Edit** for a custom token.

### 2.2 Initial model settings

Use these initial settings for the generic adapter:

| Forge setting | Initial value |
|---|---|
| `AI_PROVIDER_BASE_URL` | `https://api.cloudflare.com/client/v4/accounts/<CLOUDFLARE_ACCOUNT_ID>/ai/v1` |
| `AI_PROVIDER_MODEL` | `@cf/zai-org/glm-4.7-flash` |
| `AI_PROVIDER_API_KEY` | The Workers AI API token; keep it secret |
| `AI_PROVIDER_TIMEOUT_MS` | `120000` |

Replace `<CLOUDFLARE_ACCOUNT_ID>` with the Account ID from Cloudflare. Do not include angle brackets in the actual value. Do not append `/chat/completions`; Forge appends that path itself.

The suggested model is a starting point, not a guarantee of availability, price, or capacity on every account. Confirm it remains in Cloudflare's model catalogue and supports function calling before relying on it for coding. If it is unavailable, select a currently available Workers AI model that supports function calling and update `AI_PROVIDER_MODEL`.

### 2.3 What the timeout means

`AI_PROVIDER_TIMEOUT_MS=120000` means a single provider request can run for up to 120,000 milliseconds (120 seconds) before the adapter times out. It is not a delay and not a token limit. Start with this value; adjust only if measured requests need it.

## 3. GitHub App setup

Use the existing Brilina Forge GitHub App if it already exists; do not create a duplicate just to follow this guide.

### 3.1 Identify the correct credentials

In GitHub, open **Settings → Developer settings → GitHub Apps → your Brilina Forge app**.

- **Client ID** is the value for `GITHUB_CLIENT_ID`. Do not use the numeric App ID in its place.
- Generate or retrieve the **Client secret** for `GITHUB_CLIENT_SECRET`. Treat it as a password.
- The **User authorization callback URL** must exactly match the callback configured for the environment being used.

For the current Worker deployment, the expected callback is:

`https://brilina-forge.blinkzdlfx.workers.dev/auth/github/callback`

Confirm the actual deployed Worker hostname in Cloudflare before saving this URL. If the Worker uses a different custom domain or workers.dev hostname, use that exact hostname instead. The homepage/public base URL is the same origin without the callback path.

### 3.2 Permissions needed for the intended write workflow

The existing GitHub App setup document previously described read-only access. That is not enough for a coding agent that creates or updates repository files.

For the intended Phase 1 write flow, configure the minimum required repository permissions:

- **Contents: Read and write**
- **Metadata: Read-only** (GitHub requires repository metadata access)

Only add **Pull requests** permission if the implemented product actually needs to read or create pull requests. It is not a substitute for Contents write permission. If the agent is later allowed to modify files under `.github/workflows/`, GitHub also requires the corresponding **Workflows: Read and write** permission.

Install the GitHub App on the account that owns or can access the test repository, and make sure the test repository is included in the installation's repository selection. If you change App permissions, follow GitHub's prompts to approve the permission change and reauthorize/reinstall where required. Never grant broader access than the test needs.

GitHub App documentation: https://docs.github.com/en/apps/creating-github-apps

## 4. Neon Postgres — existing project verified

The existing Neon project was found and a read-only SQL query succeeded during this review.

| Item | Observed value |
|---|---|
| Project name | `Brilina Forge` |
| Project ID | `nameless-haze-58360399` |
| Region | `aws-eu-west-2` |
| Default branch | `production` |
| Database | `neondb` |
| Public application tables | 11 |

The database contains the expected application tables, including `auth_sessions`, `forge_users`, `github_connections`, `workspaces`, `workspace_members`, `repositories`, `conversations`, `conversation_messages`, `runs`, `tool_calls`, and `usage_records`.

A read-only query confirmed that the database responds. No schema change was made. The Neon branch was suspended/archived before the check and became ready when queried.

**What this verifies:** the Neon management connection can reach the existing project/database and execute a read-only query.

**What this does not verify:** that the deployed Cloudflare Worker has the correct `DATABASE_URL` secret or that the full application persistence flow works in production. That still needs to be checked from the running app.

### 4.1 Set `DATABASE_URL`

In the Neon dashboard, open the **Brilina Forge** project → **production** branch → **Connect**. Select the `neondb` database and the correct role, then copy the connection string.

For normal application traffic, prefer the pooled connection string when available (the hostname includes `-pooler`). Keep the entire connection string private because it contains database credentials. Do not paste it into chat or commit it to Git.

## 5. Generate the token-encryption key

Forge requires `GITHUB_TOKEN_ENCRYPTION_KEY`, a Base64-encoded key that decodes to exactly 32 bytes. The application uses it for AES-256-GCM encryption of GitHub authorization tokens stored in Neon.

When you are back at your computer, generate it locally with Node.js:

```sh
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
```

Copy the generated value directly into the secret store. Do not send it to ChatGPT, Kilo, or anyone else. Do not use a normal password, a GitHub token, or the Cloudflare API token for this setting. Keep the same key across deployments; changing it without a planned re-encryption procedure can make previously stored GitHub tokens unreadable.

## 6. Configure the deployed Cloudflare Worker

For the deployed application, configure variables and secrets on the existing **brilina-forge** Worker in the Cloudflare dashboard. Open **Workers & Pages → brilina-forge → Settings → Variables and Secrets** (labels may vary slightly).

### 6.1 Non-secret variables

Set these as ordinary Worker variables:

| Name | Value |
|---|---|
| `PUBLIC_BASE_URL` | The exact deployed app origin, e.g. `https://brilina-forge.blinkzdlfx.workers.dev` |
| `GITHUB_CLIENT_ID` | GitHub App Client ID |
| `GITHUB_CALLBACK_URL` | `https://brilina-forge.blinkzdlfx.workers.dev/auth/github/callback` (confirm the hostname first) |
| `COOKIE_SECURE` | `true` |
| `AI_PROVIDER_BASE_URL` | Cloudflare Workers AI endpoint from Section 2 |
| `AI_PROVIDER_MODEL` | `@cf/zai-org/glm-4.7-flash` |
| `AI_PROVIDER_TIMEOUT_MS` | `120000` |

Use the actual deployed hostname if it differs from the example.

### 6.2 Secrets

Add these as **encrypted secrets**, not plain variables:

| Secret name | Value |
|---|---|
| `GITHUB_CLIENT_SECRET` | GitHub App Client secret |
| `DATABASE_URL` | Neon connection string |
| `GITHUB_TOKEN_ENCRYPTION_KEY` | Locally generated Base64-encoded 32-byte key |
| `AI_PROVIDER_API_KEY` | Cloudflare Workers AI API token |

Do not put secrets in `wrangler.jsonc`, `.env.example`, `.dev.vars.example`, GitHub source files, or chat. After changing deployed variables/secrets, redeploy or restart only if Cloudflare indicates it is needed; then verify the running Worker reads the new values.

The current Worker configuration forwards string environment bindings into the application's runtime configuration. This is why the variable names must match exactly.

## 7. Local development configuration (when you return to your computer)

The current primary runtime is Cloudflare Workers. `npm run dev` runs Wrangler, whose default local URL is usually `http://localhost:8787`. For Worker-local development, use a git-ignored `.dev.vars` file at the repository root. Do not assume that the root `.env.example` is automatically loaded by Wrangler.

Use the same variable names as the deployed configuration, but set:

- `PUBLIC_BASE_URL=http://localhost:8787`
- `GITHUB_CALLBACK_URL=http://localhost:8787/auth/github/callback`
- `COOKIE_SECURE=false`

The GitHub App must accept the callback URL used for local OAuth. Check the app's callback configuration before attempting local login. Keep `.dev.vars` untracked; the repository's `.gitignore` already ignores `.dev.vars*`.

The root `.env.example` also contains settings for migration-era Node development (including port 3000). The current production runtime is the Worker, so follow the Worker instructions above unless deliberately testing the legacy Node server.

## 8. How to verify configuration safely

Never print the values of secrets in logs or screenshots. Check only that each value is present and non-empty.

Before the real coding test, verify:

- [ ] Cloudflare Worker has all seven non-secret variables listed in Section 6.1.
- [ ] Cloudflare Worker has all four secrets listed in Section 6.2.
- [ ] GitHub App Client ID and Client secret belong to the same App.
- [ ] GitHub callback URL exactly matches the deployed origin and GitHub App settings.
- [ ] GitHub App has Contents read/write and Metadata read-only, and the test repository is included in the installation.
- [ ] Neon `DATABASE_URL` is for the existing Brilina Forge project, `production` branch, and `neondb` database.
- [ ] The Cloudflare Workers AI token has the permissions required by Cloudflare's current REST API setup guide.
- [ ] The configured model is available and supports function calling.
- [ ] The Worker has been redeployed if necessary after changing configuration.
- [ ] `/health` returns a healthy response.
- [ ] GitHub sign-in and session persistence work in the deployed app.
- [ ] A real AI-provider request succeeds; a deterministic development response does not count.

There is currently no verified, secret-safe in-app configuration diagnostic for all these settings. Do not claim that configuration is valid solely because the values appear in the dashboard.

## 9. First-time user workflow

Once the implementation is ready:

1. Open the deployed Brilina Forge URL.
2. Choose **Continue to GitHub** and authorize the GitHub App.
3. Select a repository that is included in the App installation and that you are authorized to modify.
4. Use the agent's `github.create_work_branch` operation to create a unique test branch, or select an existing non-default work branch.
5. Start a conversation and describe one small, harmless change to a file.
6. Allow the agent to inspect the relevant files before editing.
7. Review any requested write/approval action shown by the actual UI.
8. Confirm the changed file, diff, branch, and commit on GitHub.
9. Reload the conversation and check that the run/result remains available.

Never use the default branch for the first test. Do not ask Forge to merge or deploy production changes during this test.

**Do not perform this production acceptance test until PR #7 has passed its checks, been merged and deployed, and the Worker configuration is verified.** The branch implementation is not the same as a live end-to-end acceptance result.

## 10. Troubleshooting

- **GitHub sign-in fails:** verify Client ID/secret, callback URL, HTTPS hostname, App installation, and requested permissions.
- **401/403 from GitHub:** check that the App is authorized and installed for the test repository and that Contents write permission is granted.
- **Database error:** verify the deployed `DATABASE_URL` secret and that the Neon branch/compute is ready. Never expose the URL in logs.
- **AI provider authentication error:** check the Cloudflare API token, its Workers AI permissions, Account ID embedded in the base URL, and model ID.
- **Model responds but does not call tools:** confirm that the selected model supports function calling and that Forge sends the tools in the expected OpenAI-compatible format.
- **AI appears to work but no GitHub commit appears:** treat the run as failed/unverified. Do not infer a write occurred from the assistant's text.
- **Timeout/capacity error:** inspect the sanitized provider error and model availability; adjust timeout only when the evidence points to a timeout.

## 11. Phase 1 acceptance checklist

Phase 1 passes only when all of these are true:

- [ ] A real model is configured and called successfully.
- [ ] The frontend request reaches the Agent Controller.
- [ ] The selected repository and non-default work branch are enforced by authorization.
- [ ] The model invokes a registered GitHub write tool.
- [ ] GitHub confirms a real file create/update and commit.
- [ ] Forge reads the file back and shows a reviewable diff plus branch/commit details.
- [ ] The run, tool results, and conversation persist across reload.
- [ ] Automated tests and build checks pass.
- [ ] The owner completes the manual test and reports the result.

Until then, Phase 1 remains open and Phase 2 must not start.
