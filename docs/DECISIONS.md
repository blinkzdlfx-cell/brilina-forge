# Brilina Forge — Architecture Decisions

This file preserves architectural decisions and their history. The active delivery order is defined by [ROADMAP.md](ROADMAP.md). Historical ADR phase numbers are not the current product roadmap.

## ADR-001 — GitHub is canonical; execution is on the user's machine

GitHub owns source code. Neon owns Forge state. Local command execution, when implemented, runs on the user's machine through a separate companion. The companion is disposable and is not the canonical source store. Do not install Kilo Code or another coding-agent framework on the companion in the initial architecture.

## ADR-002 — Execution is not an agent host

The companion runs approved commands, not an agent framework. The AI orchestration remains in Forge.

## ADR-003 — One GitHubService

Application code uses the shared `GithubService` abstraction rather than scattering raw GitHub API calls.

## ADR-004 — Progressive task-relevant context

The model receives bounded, task-relevant context. It does not receive a full repository dump by default. A conversation without a bound repository cannot use repository tools.

## ADR-005 — Neon is the durable store

Neon Postgres stores Forge state through the serverless driver and a small raw-SQL repository layer. Do not add an ORM without justification.

## ADR-006 — Small typed controller

The Agent Controller is small and typed, with explicit tool contracts, policies and audit rather than a large agent framework without a concrete need.

## ADR-007 — No Git CLI requirement initially

GitHub APIs are the primary repository interface. The companion does not require Git CLI for the initial architecture.

## ADR-008 — GitHub App user authorization

Authorization uses a GitHub App with user-level tokens rather than a legacy OAuth App.

## ADR-009 — Neon serverless driver, raw SQL

The backend uses `@neondatabase/serverless` with raw SQL.

## ADR-010 — Provider-neutral controller

The Agent Controller does not depend directly on a provider SDK. Provider-specific code lives behind the adapter in `src/ai/`.

## ADR-011 — React + Vite + TypeScript

The frontend lives in `web/` and uses React, Vite, and TypeScript.

## ADR-012 — SSE for run events; no browser terminal

Chat/run events use SSE. The browser does not hold a shell. Do not add a terminal WebSocket or server-side shell as a shortcut.

## ADR-013 — OpenAI-compatible adapter is key-gated

The existing OpenAI-compatible adapter is activated only when its required provider configuration is present; otherwise the deterministic development adapter may be active. A deterministic response is not proof of real model reasoning. Verify a live provider request before claiming the AI coding workflow works.

## ADR-014 — Native Cloudflare Worker is production runtime

The production API and static frontend are served by the native Cloudflare Worker and Workers Static Assets. Keep Neon. Do not add new product behavior to legacy Fastify routes.

## ADR-015 — GitHub coding is the first user-visible delivery goal

The delivery order was previously set to five product phases: Phase 1 GitHub coding, Phase 2 GitHub Actions verification/repair, Phase 3 local companion, Phase 4 Cloudflare diagnostics, and Phase 5 providers/teams/hardening. This records the historical decision and is superseded by the phase rebaseline proposed in ADR-017 and described in `docs/ROADMAP.md`.

Phase 1 still requires a real AI-triggered GitHub file write on an authorized non-default work branch, read-back, and a reviewable diff/commit. Do not automatically merge or deploy production changes.

## ADR-016 — Database platform evaluation (proposed 2026-10-15)

**Status: APPROVED by the owner on 2026-10-15.**

Recommendation: retain the existing Neon Postgres database for Forge's core state and do not migrate to Cloudflare D1 as part of the current rebaseline.

SQL is a language, not a single database product. PostgreSQL uses SQL; D1 is built on SQLite and follows SQLite SQL semantics. D1 is more directly integrated with Workers, but the current Free plan limits, per-database size limit, SQL compatibility differences and migration cost do not establish a clear benefit over the already configured Neon project. Neon is currently small relative to its announced Free storage allowance, but quotas must be checked in the account and monitored.

No dual-write architecture. Any future D1 migration requires a separately approved plan covering schema conversion, versioned migrations, data export/import, content/row-count verification, integration tests, rollback and restore evidence.

## ADR-017 — Product architecture and phase rebaseline (proposed 2026-10-15)

**Status: proposal documented for owner review; not yet owner-approved.**

The new proposed sequence is:
0. Architecture, baseline and data decision.
1. Reliable core GitHub coding workflow.
2. Autonomous runtime reliability and recovery.
3. GitHub Actions verification and bounded repair.
4. Optional local Node.js companion.
5. Cloudflare diagnostics and production troubleshooting.
6. Providers, collaboration and hardening.

This rebaseline adds an explicit runtime reliability phase before automated repair and moves provider/team expansion to the final hardening phase. It incorporates established patterns from OpenAI Agents, Anthropic session/event flows and permissions, Google ADK resumability, Cline checkpoints/tasks, OpenCode tool permissions/provider abstraction, and Kilo Code autonomous modes/snapshots. It does not authorize a broad rewrite or adoption of a new agent framework.

See [Product Architecture Plan](PRODUCT_ARCHITECTURE_PLAN.md) for the comparison, target boundaries, free-tier evaluation, database analysis and phase gates.


## ADR-018 — Direct-to-main, test-before-advance workflow (approved 2026-10-15)

**Status: APPROVED by the owner.**

For this personal project, implementation work is committed directly to `main`; pull requests are not the default delivery mechanism. The safety mechanism is small increments plus mandatory tests and recorded evidence, not skipping verification.

For each increment:
1. Inspect the current code, tests and current `main` SHA before editing.
2. State one bounded goal and observable acceptance criteria.
3. Change only what is needed for that increment.
4. Run relevant unit/integration tests and build checks; run live checks when the behavior requires them.
5. Inspect the diff and fix any failures. Do not advance while the increment is failing or unverified.
6. Commit the successful increment to `main` and record SHA, files, commands, results and remaining limitations in the roadmap/current-state log.

Do not create a PR as the default. Do not bypass tests, claim a live check that was not performed, or bundle multiple unverified changes together. Production deployments, destructive data changes and database migrations remain separate approval-gated actions.

## ADR-019 — Future customer-controlled data and backup options (deferred)

The longer-term product direction may allow customers to own/control their own database and connected services, including optional personal integrations. A separate backup database or backup layer may also be considered for resilience. Neither is part of the current implementation scope. First make the Neon-backed primary path reliable and define backup/restore objectives; later design customer ownership and backup isolation deliberately. Do not implement dual writes or imply that a second database automatically provides a tested backup.

## ADR-020 — Streaming-first, batch-aware AI pipeline (approved requirements baseline, 2026-10-21)

**Status:** Requirements accepted for documentation and planning. Implementation and runtime verification remain pending.

- Preserve the current working Tavily search integration. Trace and test its actual runtime path; do not replace or duplicate it without a separate owner decision.
- Complete the existing provider streaming path end to end before introducing more Workers: provider adapter → controller → Worker SSE → frontend. Do not wait for the full completion and then split it into artificial UI chunks where native streaming is available.
- Process large search results, documents, and images in bounded logical chunks; filter/deduplicate before constructing model context; batch related findings within verified provider limits; preserve provenance and explicit partial-result status.
- Bound buffering, concurrency, model/tool work, retries, and payload sizes. Never assume arbitrary chunking or additional Workers automatically resolves CPU or latency errors.
- Add stage-level, redacted measurements for CPU time, wall-clock duration, provider latency, payload sizes, retries, and failure categories. Diagnose CPU-limit failures only from runtime evidence.
- Preserve the original user request, conversation context, immutable run repository/branch snapshot, tool-call pairing, and source evidence across all processing stages.
- Keep image intelligence routing as a later bounded stage after the existing streaming and context-processing path is reliable; verify model limits rather than guessing.

The full nine-requirement contract and five-stage implementation sequence are in [AI Pipeline Requirements](AI_PIPELINE_REQUIREMENTS.md). The product specification and unified implementation plan remain authoritative for product behavior and batch acceptance. This ADR does not authorize production deployment or claim any implementation has passed tests.
