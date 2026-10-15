# Brilina Forge Roadmap

This is the active product delivery roadmap. Follow phases in order; do not build all phases in parallel. The reference comparison, target architecture, database evaluation and detailed acceptance criteria are maintained in [Product Architecture Plan](PRODUCT_ARCHITECTURE_PLAN.md).

**Planning status (2026-10-15):** a proposed architecture and phase rebaseline has been documented for owner review. Phase 0 is not complete until the owner approves the plan and the baseline audit is recorded. No application code or database schema migration is authorized by this planning document alone.

## Product goal

Brilina Forge is a private browser-based AI software-development workspace. A user connects GitHub, selects a repository and work branch, asks an AI to perform a task, watches real tool activity, reviews changes, verifies them and can recover from interruptions. The product must be a controlled workflow system, not a chatbot with a terminal attached.

## Architecture baseline

- **UI and hosted API:** existing React/Vite application served by the native Cloudflare Worker + Workers Static Assets.
- **Canonical source code:** GitHub branches, files, commits, diffs and pull requests.
- **Forge state:** existing Neon Postgres project; proposed recommendation is to keep it and not migrate to D1 unless measured evidence justifies the migration.
- **Agent runtime:** a small typed controller, provider adapter, tool registry, policy layer and durable run/event lifecycle.
- **Verification:** GitHub Actions.
- **Optional execution:** separate local Node.js companion; no shell in the Worker and no browser terminal.
- **Production diagnostics:** Cloudflare observability/log integration.
- **Working rule:** inspect → plan one increment → implement → test → review diff → record evidence.

Do not add new product behavior to the legacy Fastify server. Do not add a second writable source of truth for code or run state. Do not automatically merge code or deploy production changes.

## Phase 0 — architecture, baseline and data decision (planning gate)

**Outcome:** one agreed target architecture and an evidence-based understanding of what already works.

- Review [Product Architecture Plan](PRODUCT_ARCHITECTURE_PLAN.md), including reference patterns from OpenAI, Anthropic, Google ADK, Cline, OpenCode and Kilo Code.
- Inspect current source, tool registration, run lifecycle, Neon schema, provider configuration, UI event handling and existing tests.
- Record the exact main SHA, build/test status, and live checks that are passed, failed, blocked or not yet run.
- Compare Neon Postgres with Cloudflare D1 and decide whether to keep Neon. The current proposal is to keep Neon; no migration should start without a separate approved migration plan.
- Review free-tier constraints, export/restore procedure and the possible use of Cloudflare Workflows for durable execution. Workflows remains a candidate until a measured proof of concept supports a decision.
- Preserve the historical technical Phase 0–7 records and older branches; do not delete or merge them blindly.

**Gate:** owner approves the architecture direction and database choice; the baseline ledger includes source SHA, exact checks and verified gaps. No broad refactor before this gate.

## Phase 1 — reliable core GitHub coding workflow

**Outcome:** one real model can make a useful, reviewable code change from the web UI.

- Verify GitHub authentication, repository/branch binding, provider configuration and Neon persistence.
- Use one real provider first, behind the provider-neutral adapter.
- Complete scoped GitHub read/write tools: work branch, create/update file, current blob SHA/conflict handling, read-back, diff and commit metadata.
- Require a non-default work branch; audit writes and keep the model/user-visible result honest.
- Build the essential task UI: conversation history, run activity, changed files, diff, branch/commit and clear failure states.
- Persist runs, tool calls/results and important events. Include minimum protections for duplicate run claims, bounded turns/tool calls and safe cancellation/timeout behavior.

**Gate:** a real AI-triggered file change is confirmed in GitHub on an authorized non-default branch, read back, shown as a reviewable diff/commit and still visible after page reload. Reading files or returning suggested code is not sufficient.

## Phase 2 — autonomous runtime reliability and recovery

**Outcome:** an interrupted or reconnecting task does not lose its state or repeat a completed side effect.

- Formalize run/step/tool state transitions and ordered event history.
- Support reconnect and event replay; define disconnect versus cancellation behavior.
- Add idempotency, safe retries, timeout/cancellation, stale-work detection based on observed behavior, and durable approval/resume for the exact pending tool call.
- Add correlation IDs, normalized failures, per-run limits and usage visibility.
- Evaluate Cloudflare Workflows against the existing Worker + Neon design using a small proof of concept before adopting another runtime.
- Test duplicate submissions/subscribers, provider/tool failures, interrupted work and recovery.

**Gate:** controlled failure/reconnect tests prove the run reaches an accurate state and already-completed side effects are not repeated.

## Phase 3 — GitHub Actions verification and bounded repair

**Outcome:** Forge uses real checks to diagnose and correct a code change.

- Dispatch or inspect real GitHub Actions workflows.
- Show job/step status and bounded, redacted logs.
- Let the model diagnose failures and apply corrections through Phase 1 tools.
- Cap repair attempts and report provider/usage limits.
- Never automatically merge or deploy.

**Gate:** a deliberately failing test/build is diagnosed, corrected, rerun and reported accurately.

## Phase 4 — optional local Node.js companion

**Outcome:** approved commands can run on the intended user's computer.

- Durable device identity, authentication, ownership and revocation.
- Authenticated, expiring and idempotent work/result contracts.
- Deny/ask/allow command policy, working-directory restriction, approval, exact-call resume, timeout, cancellation, output limits, redaction and cleanup.
- Do not silently change execution location if the companion is unavailable.

**Gate:** an approved command runs on the intended device and the correct result is associated with its run and conversation.

## Phase 5 — Cloudflare diagnostics and production troubleshooting

**Outcome:** a real production error can be connected to source evidence and a reviewable fix.

- Least-privilege Cloudflare account connection and supported log/observability sources.
- Filter and redact evidence before model use.
- Correlate diagnostic evidence to source files/commits.
- Propose a fix through Phase 1 and verify it through Phase 3.
- Keep production deployment separate and approval-gated.

**Gate:** a real error is traced to a proposed source fix and the fix is verified without automatic production deployment.

## Phase 6 — providers, collaboration and hardening

**Outcome:** the core workflow is dependable for personal use and a small trusted team.

- Add providers one at a time after real capability, quota, error and tool-call testing.
- Add invited workspaces, roles, repository-level authorization and separated personal/team settings.
- Complete security, rate limits, audit, retention, export/restore, accessibility, browser acceptance and end-to-end regression tests.
- Remove legacy paths only after route parity and production behavior are verified.
- Monitor free-tier quotas and show blocked/limited states rather than allowing unbounded loops.

**Gate:** invited users cannot access each other's repositories or secrets, and the core regression suite passes.

## Mandatory phase-transition policy

- A phase stays open until its gate passes with evidence.
- Verify both source/runtime behavior and documentation; neither substitutes for the other.
- Record the checked commit SHA, files inspected, exact commands/results and live-check evidence.
- Use only these status labels: **implemented in code**, **automated-tested**, **live-verified**, **partial**, **not implemented**, or **blocked**.
- If a required check cannot be run, mark it blocked/unverified. Never infer success from comments, mock data, type definitions, old test counts or an AI's claim.
- No PR is merged, production data changed, database migrated, or production deployment performed without the relevant explicit authorization.
