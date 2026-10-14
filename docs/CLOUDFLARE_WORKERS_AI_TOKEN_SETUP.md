# Cloudflare Workers AI Token Setup for Brilina Forge

**Purpose:** Configure the Cloudflare credential that Brilina Forge uses to call Workers AI through its OpenAI-compatible Chat Completions adapter.

**Status:** This document describes the configuration procedure. Creating a token or adding dashboard variables does not by itself prove that the production AI integration works. Complete the verification steps before treating the provider as operational.

## 1. Where to create the token

1. Sign in to the Cloudflare dashboard for the account that hosts the `brilina-forge` Worker.
2. Open **Workers AI**.
3. Select **Use REST API**.
4. Select **Create a Workers AI API Token**.
5. Review the prefilled token settings and the account resource. Make sure the selected account is the account where Brilina Forge's Workers AI requests should run.
6. Select **Create API Token**.
7. Copy the token when Cloudflare displays it, and store it securely. Treat it like a password.

Cloudflare's template is preferred over creating a broad, general-purpose API token. If a custom token is necessary, Cloudflare's Workers AI REST API documentation currently specifies both **Account → Workers AI → Read** and **Account → Workers AI → Edit** permissions. Use only the account scope needed for this deployment.

Official documentation: [Workers AI REST API — Get started](https://developers.cloudflare.com/workers-ai/get-started/rest-api/).

## 2. Get the Account ID

On the same **Use REST API** page, copy the value under **Get Account ID**. The Account ID is not the API token and must not be entered as the token value.

Brilina Forge uses the Account ID in `AI_PROVIDER_BASE_URL`. Use the exact Account ID shown for the account where the token was created.

Expected format:

```text
https://api.cloudflare.com/client/v4/accounts/YOUR_CLOUDFLARE_ACCOUNT_ID/ai/v1
```

Replace `YOUR_CLOUDFLARE_ACCOUNT_ID` with the real Account ID. Do not include angle brackets or append `/chat/completions`; the Forge adapter is responsible for the chat-completions path.

## 3. Save the token as a Cloudflare Worker secret

1. In the Cloudflare dashboard, open **Workers & Pages → brilina-forge**.
2. Open **Settings → Variables and Secrets** (the exact label can vary slightly with dashboard updates).
3. Add a variable with this exact name:

   `AI_PROVIDER_API_KEY`

4. Paste the copied Workers AI API token into the value field.
5. Choose the **Secret** type or enable the **Secret** option.
6. Save the secret.

Do not put the token in `wrangler.jsonc`, source code, a committed `.dev.vars` file, README files, issues, screenshots, or chat messages. Cloudflare dashboard secrets are for production; use an untracked local `.dev.vars` file for local development and never commit it.

## 4. Related Brilina Forge provider settings

The production Worker also needs the following provider configuration. Set non-secret values as ordinary text variables and the API token as a secret.

| Name | Value / handling |
| --- | --- |
| `AI_PROVIDER_BASE_URL` | `https://api.cloudflare.com/client/v4/accounts/YOUR_CLOUDFLARE_ACCOUNT_ID/ai/v1` |
| `AI_PROVIDER_MODEL` | `@cf/zai-org/glm-4.7-flash` is the configured starting model; verify its current availability and tool/function-calling support before relying on it |
| `AI_PROVIDER_TIMEOUT_MS` | `120000` (120 seconds) |
| `AI_PROVIDER_API_KEY` | Cloudflare Workers AI API token; **Secret** |

Also ensure `PUBLIC_BASE_URL`, `GITHUB_CLIENT_ID`, `GITHUB_CALLBACK_URL`, `COOKIE_SECURE`, the GitHub client secret, the GitHub token-encryption key, and the Neon `DATABASE_URL` are configured as described in [Phase 1 Setup and User Guide](PHASE_1_SETUP_AND_USER_GUIDE.md). Do not copy secret values into this document.

## 5. Verify the configuration

After saving the secret and related variables:

1. Confirm the variable names are spelled exactly as shown. Do not reveal or copy the secret value while checking.
2. Confirm the Account ID in `AI_PROVIDER_BASE_URL` matches the account in which the token was created.
3. Redeploy or create a new Worker deployment/version if the dashboard requires it for the updated configuration to take effect.
4. Open the deployed Forge URL and check the Worker health endpoint:
   `https://brilina-forge.blinkzdlfx.workers.dev/health`
5. Test GitHub sign-in and then run a small, non-destructive AI request through the actual Forge interface.
6. Review Cloudflare Worker logs for provider errors. Do not log authorization headers, API tokens, database URLs, OAuth secrets, or encryption keys.

A successful health response only confirms the health endpoint is responding; it does not prove that AI authentication, model availability, tool calling, or GitHub writes work. Mark the provider operational only after a real AI request succeeds. Separately test that the selected model emits tool calls in the format expected by Forge before relying on it to modify repositories.

## 6. Troubleshooting

- **401 / authentication error:** confirm `AI_PROVIDER_API_KEY` contains the newly copied token, not the Account ID, and that the token belongs to the correct account.
- **403 / permission error:** review the token's Workers AI permissions and account resource. For a custom token, confirm Workers AI Read and Edit are granted.
- **404 / model or endpoint error:** confirm the Account ID, base URL, and model ID. Check the current [Workers AI model catalogue](https://developers.cloudflare.com/workers-ai/models/).
- **Timeout:** inspect Worker logs and confirm `AI_PROVIDER_TIMEOUT_MS` is set to `120000`. Increasing the timeout does not fix authentication or model incompatibility.
- **The model replies but coding actions do not work:** verify the model supports the required tool/function-calling behavior and inspect the adapter's response parsing. A normal text response is not proof of tool-call compatibility.

## Security checklist

- [ ] Token created from the Workers AI REST API page or with the documented minimum permissions.
- [ ] Correct Cloudflare account selected.
- [ ] Token stored as the Worker secret `AI_PROVIDER_API_KEY`.
- [ ] Token is absent from source control and logs.
- [ ] Production AI request tested without exposing credentials.
- [ ] Model tool/function-calling compatibility checked before enabling repository-writing workflows.
