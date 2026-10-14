# Brilina Forge Architecture

## Purpose

Brilina Forge is a private, browser-based AI coding workspace. The immediate goal is to let a user connect GitHub, select a repository, ask a real AI to change code, and review the resulting GitHub diff/commit. Automated verification, local execution, production diagnostics, and team features follow in later phases.

## Production topology

```
Browser — React/Vite static app
       | HTTPS / same-origin API / SSE
       v
Cloudflare Worker
  - authentication and session handling
  - Forge API and Agent Controller
  - typed, authorized and audited tools
  - AI provider adapter
  - run status and event delivery
  - Workers Static Assets
       |                 |                 |
       v                 v                 v
    GitHub            Neon Postgres     AI Provider
 source/branches      Forge state       reasoning/tool calls

Later optional execution:
Browser/Worker -> authenticated work contract -> local Node.js companion
GitHub Actions -> remote build/test execution
Cloudflare observability -> production diagnostic evidence
```

## Ownership boundaries

1. **GitHub owns source code.** Branches, file contents, commits, diffs, and pull requests are canonical.
2. **Neon owns durable Forge state.** Store sessions, conversations, messages, runs, tool audit, usage, approvals, device/work records and other application state where required.
3. **Cloudflare Worker hosts the production API.** Entry points are `worker/index.ts` and `worker/api.ts`. Do not add new product behavior to legacy Fastify `src/server.ts`.
4. **The browser is the interface, not a shell.** No shell execution in the Worker and no browser terminal.
5. **The Agent Controller owns orchestration.** It validates model tool requests, enforces policy/authorization, audits execution and uses a provider-neutral interface.
6. **The AI provider is replaceable.** Start with one real provider. Keep provider-specific API handling behind the adapter and verify each provider's tool-calling capabilities.
7. **Context is progressive.** Retrieve only task-relevant files and bounded tool results. Do not dump a full repository to the model by default.
8. **Secrets stay server-side.** Never expose raw GitHub/provider credentials to the browser or model. Redact logs and command output before model use.
9. **Write operations are explicit.** Scope writes to the conversation's repository and selected work branch; use current blob SHAs, handle conflicts, audit actions, and never silently write to the default branch.
10. **Execution is separate.** GitHub Actions runs remote checks. A local Node.js companion, when built in Phase 3, runs commands on the user's computer. The Worker itself never runs shell commands.

## Phase-based architecture

- **Phase 1:** real AI + GitHub read/write tools + branch/commit/diff + usable UI.
- **Phase 2:** GitHub Actions status/log retrieval, diagnosis, bounded repair, and reliable run lifecycle.
- **Phase 3:** authenticated local companion, durable device/work identity, command policy, approval/resume, cancellation and result reporting.
- **Phase 4:** Cloudflare observability/log integration, redaction, source correlation and approved fixes.
- **Phase 5:** additional providers, small-team access controls, regression testing and hardening.

See `ROADMAP.md` for acceptance criteria and `CURRENT_STATE_AND_CONTINUATION.md` for evidence-based status.

## GitHub write-tool contract

The Phase 1 write tools should follow these principles:

- Bind every tool call to the authenticated principal and the conversation's repository.
- Require explicit owner/repo/path and validate path/ref input.
- Never trust model-supplied repository identity without checking it against the conversation context.
- Read the current file/blob SHA before updating; use the SHA expected by GitHub's contents API.
- Serialize updates to the same path and handle conflicts with a fresh read rather than blind overwrite.
- Use a non-default work branch for changes; creating a branch or committing is an auditable action.
- Bound file size and tool output; never pass credentials into generated files.
- Read back the resulting file/diff and return commit/branch metadata to the model/UI.
- Record tool arguments/results and errors in the audit trail, without logging secrets.
- Test permission denial, wrong repository, stale SHA, invalid path, API errors, and successful writes.

## Run lifecycle and reliability

The current Worker pattern creates a queued run in Neon and executes the Agent Controller while an SSE response remains open. That does not by itself prove recovery after disconnects, isolate termination or timeout.

Before Phase 2 is complete, tests must establish an atomic/idempotent run claim, duplicate-subscriber behavior, defined disconnect semantics, cancellation/timeouts, durable result/audit state, recovery for abandoned work, and replay behavior where required. Do not claim durable orchestration until these cases are verified.

## Companion safety

The repository contains partial companion-related Worker/database scaffolding, not a verified complete companion application. Device identity cannot depend on an isolate-local map. Approval must persist the exact pending call, authenticate and audit the decision, and resume the same call at most once. Command policy must block prohibited operations before considering approval, then require consent for risky operations. A pattern-based command classifier is not a full shell parser; restrict commands and clearly communicate the lack of a sandbox.

## Verification language

Use **implemented in code**, **automated-tested**, **live-verified**, **partial**, **not implemented**, or **blocked**. Source inspection and old test counts are not proof of live behavior.