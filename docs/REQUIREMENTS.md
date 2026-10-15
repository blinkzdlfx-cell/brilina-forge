# Brilina Forge — Product Requirements

> **Phase numbering note (2026-10-15):** The active proposed phase sequence is defined in [ROADMAP.md](ROADMAP.md) and the [Product Architecture Plan](PRODUCT_ARCHITECTURE_PLAN.md). The sequence has been rebaselined to insert runtime reliability as Phase 2. This proposal is pending owner approval; historical phase records are retained.


## Product objective

A private, browser-based AI coding workspace that uses GitHub as the source of truth, Cloudflare Workers for the hosted application/API, and Neon Postgres for durable Forge state. Build incrementally around the owner's personal workflow before expanding to a small trusted team.

## Core GitHub coding requirements (active Phase 1)

- Authenticate through the configured GitHub App/session flow.
- Identify the signed-in user and their permitted repositories.
- Select and bind a repository and branch to each conversation.
- Read relevant repository metadata, tree, files, and diffs progressively.
- Use one configured real AI provider through the provider-neutral model interface.
- Let the model request typed, validated tools through the Agent Controller.
- Create/update files through GitHub with correct current blob SHA handling.
- Apply related file edits safely and sequentially; handle conflicts instead of overwriting silently.
- Scope all reads/writes to the repository bound to the conversation and the user's GitHub permissions.
- Keep changes on a work branch; do not silently write to the default branch.
- Read back changes, display the diff, and report branch/commit/review links.
- Persist conversations, messages, runs, tool calls, and important results in Neon.
- Show tool activity, errors, partial completion, and success honestly in the UI.
- Audit all write operations. Require user confirmation for consequential actions.
- Pass a real end-to-end test in which the AI changes a real file in a selected repository.

## Autonomous runtime reliability and recovery requirements (active Phase 2)

- Persist explicit run, step, event, tool-call and approval state; browser memory and a live SSE connection must not be the only state store.
- Enforce atomic/idempotent run claiming and prevent duplicate execution of the same run or side effect.
- Support ordered event replay after reconnect; distinguish client disconnect from cancellation.
- Define cancellation, timeouts, bounded retries, retryability and evidence-based stale-work detection.
- Resume the exact interrupted/pending operation safely; do not replay completed writes or commands blindly.
- Persist approval requests and decisions, bind them to the exact tool call, audit them, and resume at most once.
- Record correlation IDs, normalized failures, elapsed time, retry counts and usage where available.
- Evaluate Cloudflare Workflows against Worker + Neon with a small proof of concept before choosing it.

**Gate:** tests demonstrate accurate state transitions, reconnect/replay and no duplicate side effect after a controlled interruption.

## GitHub Actions verification and repair requirements (active Phase 3)

- Trigger or inspect GitHub Actions workflows for a selected commit/branch.
- Retrieve workflow/job/step status and relevant logs.
- Filter and redact logs before model use.
- Let the AI diagnose failures and propose/apply bounded corrections through Phase 1 tools.
- Limit retries and persist run state/results.
- Never automatically merge or deploy production changes.
- Verify run claim, reconnect, duplicate subscriber, cancellation, timeout, failure and recovery behavior.

## Local Node.js companion requirements (active Phase 4)

- Separate companion application runs on the user's computer; no shell on the Worker and no browser terminal.
- Authenticate and register devices securely with durable ownership and revocation.
- Deliver work and submit results using authenticated, expiring, idempotent contracts.
- Apply command classification: blocked first, approval-required second, safe allow-list last.
- Persist the exact pending tool call; authenticate/audit approve or reject; resume at most once.
- Restrict working directory, command types, execution time, output size and process lifetime.
- Redact sensitive output; support cancellation and cleanup.
- Never silently switch execution location if the companion is unavailable.

## Cloudflare diagnostics requirements (active Phase 5)

- Connect a Cloudflare account with least-privilege access.
- Select supported Workers/log sources and retrieve relevant diagnostic evidence.
- Filter by available time, severity, request, and deployment dimensions.
- Redact credentials and personal data before model use.
- Correlate evidence with GitHub source/commit.
- Propose a fix through the Phase 1 workflow and verify it through Phase 2.
- Require explicit approval before production deployment.

## Providers, teams, and hardening requirements (active Phase 6)

- Add additional AI providers incrementally, based on real API access, model capabilities, quotas, and costs.
- Report provider errors/usage accurately; do not assume uniform tool calling or structured output.
- Support invited team workspaces and explicit roles.
- Separate personal/team settings and secrets.
- Enforce repository-level access, rate limits, audit trails, secret handling, retention and recovery.
- Add browser acceptance and end-to-end regression tests.

## System boundaries and non-functional requirements

- Cloudflare Worker serves the React app and API; static assets and API routing must not conflict.
- Neon Postgres remains the Forge state database; GitHub remains canonical for repository code.
- The Agent Controller is provider-neutral. Provider-specific code stays behind the AI adapter.
- Typed tools are validated, authorized, policy-checked, bounded and audited.
- Give the model only task-relevant repository context, not the entire repository by default.
- Secrets remain server-side and must not be sent to the model or exposed in browser responses.
- Long-running task state must not exist only in browser memory.
- No mock data to represent successful real integrations.
- No server-side shell, VPS executor, or browser terminal.
- Free-plan usage is a design preference, not a guarantee of unlimited availability; expose limits and avoid unbounded loops.

## Verification labels

- **Implemented in code:** source exists.
- **Automated-tested:** named tests actually ran and passed.
- **Live-verified:** exercised against the real configured environment.
- **Partial:** only some of the required behavior exists.
- **Not implemented:** no complete implementation exists.
- **Blocked:** required access, configuration, or decision is missing.

Do not mark a phase complete until its acceptance criteria in `docs/ROADMAP.md` are satisfied.