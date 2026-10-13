# Brilina Forge — Security

Execution runs on the user's own machine through a small local Node companion.
The companion is disposable and holds only temporary execution state and the
per-machine approval store. There is no server-side shell, no VPS cost, and no
browser terminal.

## Layers

The controls apply in this order:

1. **Transport.** `@fastify/helmet` sets `Content-Security-Policy`
   (`frame-ancestors 'none'`, `default-src 'self'`, `script-src 'self'`,
   `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: avatars`,
   `connect-src 'self'`, `object-src 'none'`, `base-uri 'self'`,
   `form-action 'self' https://github.com`), framing `DENY`, `nosniff`, and a
   `Same-Origin` referrer policy. `@fastify/rate-limit` caps requests at 120 per
   minute, keyed by the session cookie and then the IP; `/health` is allow-listed.
   The body limit is 256 KB and `trustProxy` is on.
2. **Request.** State-changing routes (`POST`, `PATCH`, `DELETE`) and the SSE
   stream are origin-checked against `PUBLIC_BASE_URL` and the OAuth callback
   origin. A disallowed `Origin` is a 403.
3. **Identity.** The session cookie is `HttpOnly`, `SameSite=Strict`, and
   `Secure` over HTTPS. Session lookup is server-side in Neon. The OAuth state
   is bound to an `HttpOnly` browser cookie so the callback cannot be forged by
   a third party.
4. **Authorization.** Every conversation, run and message route is scoped by
   user and workspace. A conversation a caller does not own returns 404, never
   another user's data.
5. **Input.** `conversationId` and `runId` must be UUIDs; branch names and
   conversation titles are validated against ref-safe characters so they cannot
   inject into the model's system context. GitHub paths and refs are validated
   before any API call.
6. **Execution.** Commands run on the user's machine, classified by
   `classifyCommand` into light, risky and blocked. Light commands run
   automatically on a verified machine; risky commands require consent; some
   are blocked outright. The companion environment is allow-listed so Forge
   secrets are unreachable from a shell.
7. **Output.** `redactSecrets` and `redactValue` are applied to persisted
   `tool_calls.arguments`, `tool_calls.result`, `tool_calls.error_message` and
   `runs.error_message`. Unexpected failures return `500 { "error": "internal_error" }`
   and are logged server-side only; SSE failure messages are filtered through
   `publicRunFailure`.

## Command policy

Evaluation order is **blocked → risky (ask) → light (allow)**, matching Claude
Code's `deny → ask → allow` and Codex's `forbidden → prompt → allow`.

- **Light** — read-only inspection, runs automatically: `ls`, `cat`, `grep`,
  `git status`, `node --version`, `npm test`, `du`, `df`, `find`, `head`,
  `tail`, `wc`, `diff`, `echo`, `pwd`, `uname`, `whoami`, `which`, `date`.
- **Risky** — requires consent: anything not on the light list, including file
  writes, `npm install`/`pnpm`/`pip`, `git commit`/`git push`, `docker`,
  `curl`/`wget`, `npm run dev`, `ssh`, `kill`, and any executable not on the
  allow-list.
- **Blocked** — never runs, even with consent: destructive filesystem
  operations, disk writes, power-state changes, privilege escalation
  (`sudo`, `su -`), package publication, and the Windows equivalents. Chaining,
  substitution and redirection (`;`, `&&`, `|`, `$()`, backticks, `>`, `<`) are
  also blocked so one classified command cannot smuggle in another.

The model cannot alter its own policy: the policy is applied in the companion,
after authorization, not by the caller.

## Secrets

- GitHub tokens are encrypted at rest with AES-256-GCM; the key is outside
  Neon.
- Session tokens are hashed; sessions are Neon-backed.
- `redactSecrets` covers GitHub tokens, provider keys, database URLs,
  `Authorization` headers, private key blocks, and any `SECRET`/`TOKEN`/
  `PASSWORD`/`API_KEY`/`ENCRYPTION_KEY`/`DATABASE_URL` assignment.
- The AI provider key never appears in an error message: provider failures are
  normalized into `AiProviderError` with a classified `kind` and `retryAfterMs`.

## Device verification

The companion starts only when a command needs to execute. On first use it
registers itself with Forge under the current session in one background call —
no screens, no typing, no ceremony. Forge records the device token; if the
companion is removed, the device stops working. This is "identified, not
paired": the user does nothing, but the machine is a named, revocable identity.

## Remaining risks

- The companion runs as the user with **no sandbox boundary**; the command
  policy layer is the only control.
- Command classification is pattern-based, not a parser (known limitation, same
  as Claude Code, Codex and Gemini CLI).
- Approval-required commands are classified but cannot be approved
  interactively yet; there is no approve/resume flow.
- Security testing is unit/integration level. There is no penetration test and
  no multi-instance deployment test.
- The companion has not been built.