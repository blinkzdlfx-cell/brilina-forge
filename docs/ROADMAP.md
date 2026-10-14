# Brilina Forge Roadmap

This is the delivery roadmap for the product owner and Kilo Code. Follow the phases in order. Do not build all phases in parallel. Each phase has one user-visible outcome and a completion gate.

**Current priority: Phase 1 — make the existing Forge UI capable of using a real AI to write code through GitHub.** The local companion is not the current priority.

## Product goal

Brilina Forge is a private, browser-based AI coding workspace. GitHub is the source of truth for code; Cloudflare Workers hosts the React static app and API; Neon Postgres stores Forge application state. A user connects GitHub, selects a repository and branch, describes a task, and the AI can inspect, edit, verify, and report changes.

## Architecture decisions that remain in force

- Production API and static site: native Cloudflare Worker + Workers Static Assets.
- Database: Neon Postgres. Do not migrate to D1 as part of this roadmap.
- Source control: GitHub. Do not create a separate canonical code store.
- Model orchestration: provider-neutral Agent Controller and typed, authorized, audited tools.
- Execution: no shell on the Cloudflare Worker and no browser terminal.
- Local commands, when implemented, run only through a separate Node.js companion on the user's own computer.
- No mock data to make incomplete functionality appear real.
- Keep existing UI and infrastructure unless inspection proves a change is necessary.
- No new branch for routine project work unless the owner explicitly asks. Work directly on the agreed branch and preserve any local uncommitted changes.

## Mandatory verification and phase-transition policy

Apply this policy whenever verifying any feature or deciding whether to advance a phase. Verify both **source code/behavior and documentation**; neither can substitute for the other. Inspect the real implementation and registered runtime path, run focused tests/build/type checks, and execute the relevant end-to-end or live integration check when required and possible. Confirm external side effects in the actual service. Only then update roadmap/current-state statuses with the commit SHA, inspected files, exact commands/results, and live-check evidence. If a required check fails or cannot be run, keep the item open and mark it partial, blocked, or unverified. Never infer completion from documentation, comments, type definitions, tool schemas, mock responses, generated code, or the AI's own claim.

**Phase gate enforcement:** do not begin a later phase until the previous phase's acceptance gate has passed with evidence. In particular, Phase 1 stays open while GitHub file writes fail or remain unverified. Reading files or issues does not demonstrate write capability. Phase 1 requires an actual AI-triggered file create/update on an authorized non-default work branch, confirmation in GitHub, read-back, and a reviewable diff/commit visible in the UI. If any part fails, stay on Phase 1 and debug it.

## Before Phase 1 — establish a truthful baseline

This is a checkpoint, not a separate product phase.

- [ ] Pull the current `main` and inspect `git status`; preserve local work.
- [ ] Confirm the deployed Worker configuration and the static-assets/API routing.
- [ ] Run the repository's actual build and test scripts where the environment permits.
- [ ] Record exact commands and results; do not rely on historic test counts.
- [ ] Verify GitHub OAuth, Neon connectivity, and the current UI in a real environment when credentials are available.
- [ ] Fix only confirmed baseline blockers that prevent Phase 1.
- [ ] Keep the current-state document synchronized with evidence.

**Gate:** the owner and Kilo know which existing paths work, which fail, and which have not been tested. Do not start a broad refactor.

## Phase 1 — usable AI coding through GitHub (NOW)

**Outcome:** From the existing web UI, the user can ask a real model to make a useful, reviewable code change in a selected GitHub repository without needing the local companion.

### Scope
1. Verify GitHub sign-in, repository/branch selection, conversation context, Neon persistence, and the real AI provider path.
2. Configure one real provider first. Keep the provider boundary extensible; do not integrate every provider yet.
3. Expand the GitHub service and agent tool registry with controlled write operations:
   - create a working branch when appropriate, or use a clearly selected existing work branch;
   - create or update a file with GitHub's contents API and current blob SHA;
   - apply multiple related file changes safely and sequentially;
   - read back the changed files and produce a diff;
   - commit changes with a clear message;
   - expose the resulting branch/commit and review link to the UI.
4. Keep repository access scoped to the repository bound to the conversation and to the signed-in user's GitHub permissions.
5. Add tool schemas, input validation, authorization, audit events, bounded output, and clear failure handling.
6. Require explicit confirmation for consequential write actions as appropriate. Never silently push to the default branch.
7. Update the UI to show the plan/activity, changed files, diff, success/failure, and next action.
8. Ensure the model receives only relevant files and tool results, not the entire repository by default.

### Phase 1 acceptance test
From the deployed or locally running web app:
- sign in with GitHub;
- select a real repository and non-default work branch;
- ask the AI to make a small, specific change;
- observe it inspect relevant files;
- see the model invoke authorized write tools;
- see the changed file(s), diff, and commit/branch in GitHub;
- reload the app and confirm the result/history remains available;
- confirm errors are visible and no success is claimed when a tool fails.

**Gate:** one real end-to-end code change is completed and reviewed. Reading files or returning suggested code in chat alone does not complete Phase 1.

## Phase 2 — verification and repair loop

**Outcome:** The AI can test a change and use actual results to guide a bounded correction.

- Trigger the repository's configured GitHub Actions workflow or use an existing run.
- Show status, failed job/step, and relevant logs.
- Pass filtered, redacted failure evidence to the model.
- Let the model propose/apply a correction through Phase 1's write tools.
- Rerun checks with a strict attempt limit and clear cost/usage feedback.
- Persist run state and important events so reconnecting does not lose the result.
- Test duplicate SSE subscribers, disconnects, cancellation, timeouts, failed runs, and recovery before claiming the run lifecycle is reliable.
- Do not automatically merge or deploy a fix.

**Gate:** a deliberately failing test/build can be diagnosed and corrected, and the final check result is shown accurately.

## Phase 3 — local Node.js companion

**Outcome:** When the user's computer is available, Forge can run approved project commands locally.

- Build a separate Node.js companion; do not execute shell commands in the Worker.
- Define durable device registration, authentication, ownership, revocation, work delivery, and result submission.
- Fix the run ID versus conversation ID contract.
- Use a narrow safe-command allow-list; classify blocked commands before approval-required commands.
- Persist a specific pending approval and implement authenticated approve/reject plus reliable resume.
- Require explicit consent for installs, writes, network access, Git mutations, unknown commands, and other risky operations.
- Apply working-directory restrictions, timeouts, output limits, redaction, cancellation, and process cleanup.
- Handle duplicate delivery and unavailable devices without silently changing execution location.
- Keep GitHub Actions as the fallback for remote verification.

**Gate:** an approved command runs on the intended computer, returns output and exit code, and the result is correctly associated with the run and conversation.

## Phase 4 — Cloudflare production diagnostics

**Outcome:** Forge can help diagnose an existing Cloudflare deployment using real logs.

- Connect Cloudflare with least-privilege credentials.
- Select a Worker and retrieve supported logs/observability data.
- Filter by time, severity, request, and deployment where supported.
- Redact secrets and personal data before model use.
- Correlate evidence with relevant source files and commits.
- Propose and implement a fix through Phase 1's GitHub workflow.
- Verify through Phase 2.
- Keep production deployment separate and require user approval.

**Gate:** a real error can be traced from evidence to a proposed source fix, and the result is verified without an automatic production deployment.

## Phase 5 — collaboration, providers, and hardening

**Outcome:** Forge is dependable for personal use and a small trusted team.

- Add additional providers (for example Gemini, Grok, Cloudflare Workers AI, or Cerebras) one at a time based on available APIs and quotas.
- Report provider capabilities, failures, and usage accurately; do not assume tool calling or structured output is identical across models.
- Add invited team workspaces, membership roles, and repository-scoped access.
- Separate personal and team provider settings/secrets.
- Harden authentication, authorization, secret handling, auditability, rate limits, and data retention.
- Add UI acceptance tests and end-to-end regression tests.
- Remove legacy Fastify/terminal code only after route parity and production behavior are verified.
- Document backups/recovery and service limits.

**Gate:** a trusted invited user can collaborate without gaining access to another user's repositories or secrets, and core workflows pass the regression suite.

## Working protocol for every increment

1. Inspect current source and tests before changing anything.
2. State one small goal, exact files, acceptance criteria, tests, risks, and any owner decision needed.
3. Implement only that increment.
4. Run relevant checks and report exact commands/results.
5. Review the diff and update this roadmap/current-state document.
6. Commit the checkpoint and stop for review before starting the next increment.

Do not call a feature complete because source code exists. Use these labels consistently: **implemented in code**, **automated-tested**, **live-verified**, **partial**, **not implemented**, or **blocked**.
