# Brilina Forge — Product Specification

**Status:** Consolidated product and architecture source of truth. **Last consolidated:** 2026-10-16.  
**Owner decisions:** React/Vite; Tailwind CSS + shadcn/ui; Cloudflare Worker + Workers Static Assets; Neon Postgres; GitHub as canonical code state; direct-to-main delivery unless the owner explicitly changes it.

## 1. Product definition
Brilina Forge is a private, browser-based AI software-development workspace. A user connects GitHub, selects a repository and working branch, describes a task, watches real AI/tool activity, reviews actual changes, verifies the result, and understands or recovers from failures. Forge is a controlled workflow system, not merely a chat interface with tools. Product success is determined by observed side effects and verification evidence—not by the model's claims.

## 2. Product principles
1. **Evidence over claims:** real GitHub state, tool results, test output, and logs determine status.
2. **Human control:** consequential actions are scoped and approved; review, merge, and production deployment remain explicit boundaries.
3. **Durable state:** browser memory, SSE connections, and Worker isolates are not the only record of a run.
4. **Safe autonomy:** validate and authorize every tool call outside the model; deny prohibited actions and require approval when policy says so.
5. **One source of truth per concern:** GitHub owns code; Neon owns Forge application state.
6. **Replaceable AI providers:** provider-specific formats and errors remain behind an adapter.
7. **No pretend integrations:** do not use mock data to imply real AI, GitHub, tests, deployment, or diagnostics succeeded.
8. **Incremental, verified delivery:** work in coherent batches, test, inspect diffs, and meet acceptance gates.
9. **Cost-aware design:** respect free-tier quotas, bound execution, and report limits clearly.
10. **Preserve useful functionality:** replace UI design where needed without casually removing existing workflows.

## 3. Confirmed technology and architecture
- **Frontend:** React + Vite.
- **Styling:** Tailwind CSS utilities and shadcn/ui components/primitives.
- **Global CSS:** only framework directives, theme tokens, font/base setup, and genuinely global rules. Do not use a handwritten styles.css as the primary styling system.
- **Production hosting/API:** native Cloudflare Worker with Workers Static Assets. Entry points include `worker/index.ts` and `worker/api.ts`.
- **Database:** existing Neon Postgres project. No D1 migration and no second writable database/source of truth in this work.
- **Source-code authority:** GitHub repositories, branches, files, commits, diffs, and pull requests.
- **AI orchestration:** typed Agent Controller, provider adapter, tool registry, policy/authorization layer, run/event persistence, and visible activity.
- **Remote verification:** GitHub Actions.
- **Optional local execution:** separate authenticated Node.js companion on the user's computer; no shell in the Worker and no browser terminal.
- **Diagnostics:** Cloudflare observability/log integration after the core coding and verification loop is reliable.
- **GitHub integration:** Forge owns its production tool catalog and uses `src/github/service.ts` / `src/github/client.ts` directly; the official GitHub MCP server is a reference inventory, not the production execution dependency. Preserve the current division in `src/github/service.ts`: GraphQL for repository identity/default-branch metadata where currently used; REST for repository details, branches, trees/files, comparisons, commits, branch creation, and file writes. See `docs/GITHUB_TOOL_SYSTEM.md` for the tool inventory and adoption log.
- **Legacy Fastify:** do not add new product behavior to legacy Fastify routes. Do not remove legacy paths until route parity and deployed behavior have been checked.

## 4. UI and interaction requirements

### 4.1 Component and code organization
Separate responsibilities clearly into screens/pages, layouts, reusable UI components, hooks, API/service modules, and types. Follow existing conventions where sound; avoid needless abstraction and duplicate frameworks. Build and verify foundational components before treating them as standards for coding agents. Use shadcn/ui source components and underlying primitives where appropriate. Keep component APIs consistent and accessible.

### 4.2 Workspace shell and navigation
- The app shell fits the viewport without competing page-level scroll containers.
- Desktop navigation supports collapse/expand with a persisted preference.
- Mobile navigation is a drawer with backdrop, close button, Escape-to-close, close-on-navigation, focus containment, and focus restoration.
- Conversation list scrolls independently; account/workspace controls remain reachable.
- Authentication/session resolution is explicit. Do not flash the workspace before session state resolves.
- Restore the last conversation on refresh, while preserving an explicitly requested empty New chat.

### 4.3 Workspace context
- Keep signed-in/workspace context and selected repository and working branch visible.
- Put secondary controls (compare-base selection and future repository controls) in an uncluttered panel, toolbar, or modal.
- Keep repository/branch context visible while the transcript scrolls.
- Bind repository and branch context to the conversation and snapshot it immutably for each AI run. Changing UI context must not alter a run already in progress.
- Show loading, empty, disabled, stale, and error states explicitly. Ignore stale async responses after repository/conversation switches.

### 4.4 Conversation and activity timeline
- Present user messages, activity entries, tool requests/results, and assistant responses together chronologically. User message bubbles align to the right; assistant responses align to the left. Run activity appears in the transcript at its chronological position after the triggering user message and before the assistant response generated by that run, not in a separate block below the conversation.
- Preserve each event's conversation, run, step, and tool-call association.
- Distinguish plan/proposal, requested action, permission decision, execution, result, verification, and final response. A plan is not completed work.
- Use real persisted events/results; never invent simulated activity. Preserve prior activity when a new message is sent and restore history after switching, reload, and reconnect.
- Provide expandable details for relevant tool output/errors; bound and redact output.
- Show timestamps/durations, provider/model, retries, changed files, branch, commit, and actual verification state when available.
- Ordinary informational chat must remain distinguishable from coding/action runs.
- Keep streamed output attached to the correct run; prevent stale responses overwriting newer state.

### 4.5 Composer and voice
- Composer is docked at the bottom, grows with input, and respects mobile keyboard/safe-area behavior. On desktop, Enter sends and Shift+Enter inserts a newline. On mobile, Enter always inserts a newline; the visible send button sends the message.
- Use an icon-based submit control with accessible labels, busy state, and correct disabled behavior.
- Retain drafts after failed sends; clear them only after successful send or intentional conversation switch according to the interaction contract.
- Follow streamed output while the user is near the bottom; if they scroll upward, offer Jump to latest.
- Voice controls must show permission, recording, processing, success, and failure states honestly. Do not expose a nonfunctional voice control.

### 4.6 Review and run controls
- Provide changed-file list, actual diff, selected branch, commit details/links, and relevant test results.
- Stop/cancel, retry, continue/resume, and approval controls must reflect the real backend state machine.
- Approval prompts identify the exact action, target, risk, and consequences.
- No automatic merge or production deployment.
- Provide checkpoint/recovery details and safe rollback paths where supported.
- Never label waiting, blocked, partial, failed, interrupted, or cancelled work as success.

### 4.7 Accessibility and responsiveness
Keyboard access and visible focus states; semantic controls and accessible names; focus management, reduced-motion support, adequate contrast; desktop and phone layouts without horizontal page overflow; consistent loading/empty/error/disabled states. Verify the actual deployed interface at desktop and mobile widths; a build alone is insufficient.

## 5. AI run and orchestration contract

### 5.1 Target lifecycle
Persist and validate explicit transitions such as:
`queued → running → waiting_for_approval → running → succeeded | failed | cancelled | interrupted`
The exact allowed transitions must be encoded and tested. Each run, step, tool call, and event needs stable identifiers and timestamps. Terminal state and error must be visible in the database and UI.

### 5.2 Controller and provider adapter
- Controller owns lifecycle, budgets, tool routing, cancellation, retries, resume, and final status.
- Provider adapter normalizes tool-call formats, errors, usage, capability differences, retryability, and limits.
- Begin with one real configured provider. Add providers only after the core path passes live verification.
- Deterministic/development providers must be unmistakably labelled and cannot count as live AI verification.
- Enforce maximum model turns, tool calls, elapsed time, input/output size, retries, and estimated usage.
- Retry only classified transient failures and only when safe to repeat.

### 5.3 Tool registry and policy
Every tool declares a typed schema, capability, risk, scope, output bound, and policy. Execution order:
1. Authenticate and establish user/workspace/repository/branch scope.
2. Validate tool name, schema, arguments, path, ref, and output limits.
3. Deny prohibited actions.
4. Ask for approval where policy requires it.
5. Execute only when authorized.
6. Persist redacted audit evidence and structured result.
7. Return accurate result to controller and UI.
Prompt instructions alone are not a security boundary. Do not expose powerful tools when a run does not need them. User tool/category preferences may disable capabilities but cannot enable a server-disabled capability or bypass authorization. Unknown `github.*` tools must fail closed until catalogued. The server must reject writes to the repository default branch even if that branch is selected in the UI; create/select a separate work branch first.

### 5.4 Durability, reconnect, cancellation, and recovery
- Persist ordered events before or consistently with publishing them.
- Support authenticated replay after reconnect without duplicate side effects.
- Browser disconnect is not automatically user cancellation.
- Run claims and consequential tool actions need atomic/idempotent protection.
- Cancellation must accurately handle queued and in-flight work.
- Timeouts, bounded retries, stale-run detection, and leases/heartbeats must reflect actual execution behavior.
- Persist approval against the exact pending tool call; authenticate/audit the decision and resume at most once.
- Resume from completed steps without blindly repeating writes or commands.
- Evaluate Cloudflare Workflows only through a bounded proof of concept against Worker + Neon; do not adopt it without evidence and an explicit decision.

## 6. GitHub coding and review contract
- Bind operations to the authenticated user and conversation-bound repository.
- Use selected work branch as immutable run context.
- Never silently write to the default branch; reject wrong repository/ref and unauthorized writes.
- Validate paths and input sizes; use current blob SHA for updates and handle stale-SHA conflicts with a fresh read.
- Serialize conflicting writes to the same file.
- Keep tool outputs bounded and redact credentials.
- Read changes back from GitHub after writes.
- Show actual changed-file contents/diff and branch/commit metadata.
- Persist audit records for consequential operations.
- Required core coding acceptance: a real AI-triggered file change on an explicitly authorized non-default branch, confirmed in GitHub, read back, shown as a reviewable diff/commit, and preserved after reload. Reading files, registering a tool, generating a patch, or returning an AI claim is not proof that writes work.

## 7. Persistence and data ownership
- **GitHub:** canonical source files, branches, commits, diffs, pull requests.
- **Neon:** users/sessions, workspace/repository bindings, conversations/messages, runs, ordered events, tool calls/results, approvals, usage, and integration metadata as needed.
- Store large artifacts externally only when demonstrated need exists; keep bounded summaries and references in Neon.
- Keep schema changes in versioned migrations. Never make undocumented production-only schema edits.
- Maintain and test a repeatable database export/restore procedure before relying on it.
- Define retention for conversations, tool outputs, logs, artifacts, and audit records separately.
- No second writable source of truth for code or run state.

## 8. Security and operational requirements
Authorize by user, workspace, repository, and branch. Deny unknown/high-risk capabilities by default. Require explicit approval for consequential operations. Protect sessions, OAuth state, secrets, and origins; apply rate limits and abuse controls. Keep provider/GitHub credentials server-side; never send secrets to the model or browser. Redact secrets/PII from logs, persisted tool output, model context, and diagnostics. Bound input/output, file sizes, log retrieval, retries, execution time, and model/tool loops. No Worker shell, browser terminal, automatic merge, or automatic production deploy. Treat free-tier limits as operational constraints and report quota states clearly. Use stable correlation IDs and structured redacted logs.

## 9. Verification and completion definitions
- **Not implemented:** no functional implementation exists.
- **Implemented in code:** source exists, but correctness is not established.
- **Automated-tested:** named checks actually ran and passed at a known SHA.
- **Owner-reported live-verified:** owner tested the live system and reported the result.
- **Live-verified:** live integration was independently exercised and evidence recorded.
- **Partial:** only part of the requirement is met.
- **Blocked/unverified:** evidence or access is missing.

Never infer completion from documentation, source presence, a mock, a passing typecheck, a read-only operation, or a model claim. Every batch records SHA, changed files, exact commands/results, live checks, known gaps, and next step.
