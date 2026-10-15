# Brilina Forge — Product Specification

## Product objective

> **Phase numbering note (2026-10-15):** The active proposed phase sequence is defined in [ROADMAP.md](ROADMAP.md) and the [Product Architecture Plan](PRODUCT_ARCHITECTURE_PLAN.md). The sequence has been rebaselined to insert runtime reliability as Phase 2. This proposal is pending owner approval; historical phase records are retained.


Brilina Forge is a private browser-based AI coding workspace for the owner and a small trusted group. It should let a user connect GitHub, choose a repository and work branch, ask an AI to inspect and change code, review the diff/commit, and later verify changes using real test/build results.

This is not just a chatbot with a terminal attached. The system coordinates a controlled software-development workflow.

## Canonical systems

- **GitHub:** source code, branches, commits, diffs, and pull requests.
- **Cloudflare Worker + Workers Static Assets:** hosted React application and API.
- **Neon Postgres:** Forge state, including sessions, conversations, messages, runs, tool audit, usage, and later approvals/device work.
- **AI provider:** model reasoning and tool selection through a provider-neutral adapter.
- **GitHub Actions:** remote test/build execution, starting in Phase 2.
- **Local Node.js companion:** optional local command execution, starting in Phase 3.
- **Cloudflare observability:** production diagnostic evidence, starting in Phase 4.

The Worker does not run shell commands. The browser is not a terminal. Do not migrate to D1 or add new product behavior to the legacy Fastify server as part of this plan.

## Core workflow

1. User signs in through GitHub.
2. User selects a repository and work branch.
3. User describes a task.
4. Agent Controller sends relevant context to one configured real AI provider.
5. The model requests typed tools to read or write files through GitHub.
6. Forge validates authorization/policy, executes the tools, and audits the results.
7. Forge reads back changes and displays a diff, branch, and commit.
8. In Phase 3, Forge runs checks through GitHub Actions and can use real logs for bounded repair attempts.
9. In Phase 4, optional local commands run through a separately authenticated Node.js companion.
10. In Phase 5, supported Cloudflare logs can be correlated with source to diagnose production issues.
11. In Phase 6, Forge expands to additional providers and invited team workspaces.

## Delivery order

Follow [ROADMAP.md](ROADMAP.md) and [PRODUCT_ARCHITECTURE_PLAN.md](PRODUCT_ARCHITECTURE_PLAN.md). The proposed current product phases are:
0. Architecture, baseline and data decision.
1. Reliable core GitHub coding workflow.
2. Autonomous runtime reliability and recovery.
3. GitHub Actions verification and bounded repair.
4. Optional local Node.js companion.
5. Cloudflare diagnostics and production troubleshooting.
6. Providers, collaboration and hardening.

Historical technical Phase 0–7 documents and branches preserve earlier implementation history; they are not the active product roadmap. The new phase sequence is a proposal pending owner approval.

## Phase 1 non-negotiables

- Use one real AI provider first; a deterministic adapter is not a real coding workflow.
- Bind every repository operation to the signed-in user and conversation repository.
- Use a work branch; never silently write to the default branch.
- Use current GitHub blob SHAs and handle conflicts.
- Validate paths and tool arguments; bound file/output size.
- Audit write actions and show failures honestly.
- Read back changes and expose a reviewable diff/commit.
- Do not expose secrets to the browser or model.
- Do not automatically merge or deploy production changes.
- Phase 1 must work without the local companion.

## Completion rule

A feature is not complete just because source exists. Report it as implemented in code, automated-tested, live-verified, partial, not implemented, or blocked. Each phase must pass its acceptance criteria in [ROADMAP.md](ROADMAP.md) before work moves to the next phase.