# Brilina Forge — Architecture Decisions

This file preserves architectural decisions and their history. The current delivery order is defined by [ROADMAP.md](ROADMAP.md). Historical ADR phase numbers are not the current product roadmap.

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

**Current decision (2026-10-14):** the delivery order is the five phases in `docs/ROADMAP.md`. Phase 1 is real AI-assisted GitHub code writing and review. Phase 2 is GitHub Actions verification/repair; Phase 3 is the local companion; Phase 4 is Cloudflare diagnostics; Phase 5 is provider/team expansion and hardening.

This supersedes earlier delivery-order notes that prioritized the chat UI, provider adapter, or companion as standalone milestones before the user could complete a real GitHub coding task. It does not delete the historical implementation work or change the production architecture.

Phase 1 must not depend on the companion. GitHub writes must be typed, validated, scoped to the conversation repository and a work branch, SHA-aware, audited, bounded, and reviewable. Do not automatically merge or deploy production changes.