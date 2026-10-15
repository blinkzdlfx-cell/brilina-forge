# Orchestrator, Project Memory, Workspace UI, and Session Reliability Plan

**Status:** owner-approved requirements baseline; implementation and live acceptance remain open.  
**Recorded:** 2026-10-15  
**Working rules:** retain Neon, work directly on `main`, test each bounded increment before proceeding, and rely on the configured automatic deployment triggered by pushes to `main`. Do not claim production success without evidence.

This document captures the owner's requested behavior and is a working source of truth for the next increments. It supplements, rather than replaces, [ROADMAP.md](ROADMAP.md), [CURRENT_STATE_AND_CONTINUATION.md](CURRENT_STATE_AND_CONTINUATION.md), and [PRODUCT_ARCHITECTURE_PLAN.md](PRODUCT_ARCHITECTURE_PLAN.md).

## Product principle

Brilina Forge must behave as an AI coding workspace and orchestrator, not a generic chatbot with tools attached. The UI must expose and support real task execution, selected repository/branch scope, progress, review, interruption, and recovery.

Use a **Claude Code-style conversation and task-progress experience** as the primary UI reference: a readable conversation with a compact, expandable/collapsible activity surface showing what the agent is currently doing and what it did. Keep the experience focused; do not add complexity just for visual novelty.

## 1. Project-aware memory and compaction — design first

The owner proposes a lightweight, repository-specific context file in the **selected GitHub repository only**, created or updated when a coding/action workflow starts—not for ordinary informational chat. The proposed filename is not finalized; use a provisional name such as `.brilina-forge-context.md` only after reviewing the design with the owner.

### Intended behavior
- Scope all project memory to the exact selected repository and selected branch/ref. Never write project memory to an unrelated repository or silently switch scope.
- On the first eligible coding task, create the file only if it does not exist; on later tasks, update it safely rather than overwriting useful context blindly.
- Keep the file concise and durable. It should capture project purpose and structure, important files, confirmed conventions, decisions and rationale, completed work, known issues, current objective, next steps, and relevant verification evidence. Distinguish verified facts from hypotheses.
- Do not put secrets, access tokens, personal data, or unredacted sensitive logs in project memory.
- Do not read the entire file on every ordinary chat turn. Load it for coding/action tasks when relevant, then select only useful sections.
- Pair GitHub's project-level memory with Neon conversation/run state. GitHub is durable project knowledge; Neon remains the source for conversation messages, task/run lifecycle, tool results, approvals, and audit. Define a synchronization/version/conflict policy before implementation.
- Use caching where useful to avoid repeated GitHub reads, with invalidation based on repository, branch/ref, file SHA or updated version. Cache is an optimization, not the source of truth.
- Evaluate vector retrieval only if measured needs justify it. Start with structured sections, bounded retrieval, and token-aware context selection; do not add a vector database or extra infrastructure by default.
- Build compaction inspired by OpenCode's approach: summarize older conversation/task history when approaching the model's context budget, retain recent turns and essential decisions, and prune or summarize oversized tool outputs. Preserve enough traceability to recover what was actually done.
- The memory file must be maintained from confirmed state and evidence, not fabricated by the model. Avoid duplicate updates and conflicting concurrent writes.

### Design questions to settle before coding this feature
1. Final filename and format.
2. Exact trigger: which tool/action categories count as a coding workflow.
3. Required sections and how summaries are updated and validated.
4. Whether memory changes should be committed to the selected branch with code changes or as a distinct, reviewable change.
5. How to handle read-only branches, permissions, conflicts, deletion, and branch changes.
6. Cache lifetime/invalidation and how Neon run state references a memory version/SHA.
7. Compaction thresholds, summary quality checks, and recovery behavior after interruption.

**Acceptance:** ordinary chat does not create or update the file; a coding task scopes it to the selected repository/ref; repeated tasks reuse and update it without losing confirmed decisions; context is bounded and relevant; secrets are excluded; and the UI/audit can identify the memory version used.

## 2. AI orchestrator behavior

For every coding/action task, the orchestrator should:

1. Understand the current conversation, relevant prior turns/compacted summary, selected repository, selected branch, and applicable project memory.
2. Confirm the active scope before repository operations; never silently use a different repository or branch.
3. Inspect repository metadata and relevant files before proposing or making changes. Base claims on actual GitHub/tool evidence.
4. Make a bounded plan for multi-step tasks, with clear steps and completion states.
5. Use registered tools for repository inspection, edits, branch operations, verification, and review instead of answering as a generic chatbot when tools are required.
6. Track tool arguments/results, errors, completed steps, remaining steps, and evidence. Keep the run record and user-visible explanation consistent.
7. Report exactly what was changed, where, and how it was verified, including branch, file paths, diff and commit details when available.
8. Report tool/provider/permission/approval/test failures honestly. Never claim a tool ran, a file changed, or a check passed without evidence.
9. Respect authorization, safe branch rules, bounded tool calls/output/context, sequential writes where needed, and explicit approval gates for risky actions.
10. Support stop/cancel and continuation. Stopping must halt further work safely and persist the plan, completed steps, pending step, and known tool outcomes. “Continue” should resume from durable state without repeating completed side effects. Do not present this as complete until interruption/recovery tests prove it.

## 3. Workspace UI redesign

Redesign the UI around task execution and review, using the Claude Code-style interaction pattern. Preserve existing useful functionality and avoid a purely cosmetic redesign.

### Sidebar, conversations, and workspace
- Clear conversation history and workspace navigation.
- Support useful conversation labels/tags and distinguish conversations by repository/project where applicable.
- Make selected repository and branch visible and unambiguous.
- Keep conversation history navigable and restore prior messages and run activity when reopened.

### Main conversation and composer
- Improve message hierarchy, spacing, readable AI responses, tool/result summaries, code and error presentation.
- Provide a capable message composer with clear send, stop, and continue controls and visible disabled/loading states.
- Keep normal informational chat distinct from tasks that actually execute tools.

### Expandable run activity
- Show current activity compactly with a clear way to open/close the detailed activity panel/surface.
- Preserve each run's activity across later messages, conversation changes, page reloads, and reconnects.
- Show planned steps, running/completed/failed/cancelled/approval-needed states, tool names, bounded useful output, timestamps, and actionable errors.
- Make event ordering and durable replay/recovery explicit in the underlying architecture; reconstructing partial activity from tool-call audit rows alone is not sufficient for full acceptance.

### Repository and review controls
- Make repository and branch selectors functional and display the active values.
- Load branch choices for the selected repository; allow selecting a branch and refresh choices after branch creation. The agent must receive the same repository/ref selected in the UI.
- Support creating a work branch when authorized, with clear base-branch choice and error handling.
- Provide a review panel for changed files, readable diffs, and commit/branch metadata. Clearly separate proposed changes from changes confirmed by GitHub.
- Never imply a change was committed if the commit was not confirmed.

### Interaction quality
- Consistent buttons, menus, focus states, keyboard behavior, loading and empty states, errors, spacing, and responsive behavior.
- Accessible status communication and controls.
- Keep the activity panel useful on narrow screens and avoid blocking the conversation.

## 4. Branch selector defect

Owner-reported issue: repository selection lists repositories, but branch selection does not work reliably even though the agent can report branch names.

Investigate the complete path, not just the dropdown appearance:
- Frontend selected repository/ref state and component events.
- API request/response shape and error/loading states.
- GitHub branch-list tool/API behavior and pagination.
- Persistence/restoration of repository/ref per conversation.
- The repository/ref passed into every agent run and GitHub tool.
- Refreshing branch options after creating a branch, and stale cache invalidation.
- Default branch handling, empty/error states, and permissions.

**Acceptance:** for a repository with multiple branches, the user can select each available branch, the UI visibly reflects the choice, the agent and tools use that exact branch, the choice survives reload where intended, and a newly created branch becomes selectable. Verify with a real authorized repository and record evidence.

## 5. Stop, continue, and durable run state

- Add a visible stop control for an active run.
- Stop must cancel/interrupt execution safely, prevent additional steps from starting, and persist the run's actual terminal/interrupted state.
- Preserve the plan, completed work, pending work, tool results, and idempotency information.
- Provide a continue/resume action that reuses durable state and avoids repeating completed writes or other side effects.
- Distinguish user cancellation, provider failure, tool failure, timeout, approval-required, and recoverable interruption.
- Test stop during planning, between tools, during a long-running tool, and after a tool has completed but before the next step. Test reload/reconnect and duplicate continue requests.

## 6. GitHub session expiry and reconnection — after core UI/orchestrator work

Owner-reported issue: after the first login, logout/relogin was not available as expected and session expiry behavior was unclear.

After the orchestrator and UI work above, inspect authentication/session behavior and implement a clear, polished expired-session state:
- Detect an expired/invalid GitHub session from authoritative API responses; do not infer expiry from a generic network error.
- Show a dedicated “Session expired” message with a clear **Reconnect to GitHub** action.
- Preserve safe conversation/run context locally or in Neon so reconnecting does not silently discard the user's work.
- Do not continue privileged GitHub actions until authentication is restored.
- Handle reconnect success, cancellation, revoked authorization, and transient network failures.
- Add a visible sign-out/logout action and verify the complete sign-out → sign-in/reconnect lifecycle.
- Do not expose tokens or session secrets in the UI or logs.

**Acceptance:** a controlled expired/revoked session produces a clear reconnect screen/state, protected actions pause, reconnection restores authorized access and the prior workspace safely, and logout works deliberately.

## 7. Delivery sequence and verification gates

Work in bounded increments, directly on `main`, and test each increment before moving to the next. Pushes to `main` trigger the owner's configured deployment; do not add a manual deployment step. A successful CI build is not proof that the production UI works.

Recommended sequence:
1. Audit current docs/source/tests and convert these requirements into a source-linked implementation checklist.
2. Reproduce and fix repository/branch selection and scope propagation.
3. Improve orchestrator task planning, relevant-file inspection, evidence-based tool reporting, and run/result handling.
4. Implement durable ordered run events plus safe stop/continue/replay behavior needed by the activity UI.
5. Redesign the frontend around the Claude Code-style conversation and expandable task-activity experience, repository controls, and review panel.
6. Design and then implement project memory/cache/compaction after the design questions above are resolved.
7. Implement session-expiry/reconnect/logout UX after the core orchestrator and UI work.
8. Run focused tests, typecheck, production build, Worker tests, security checks, and safe end-to-end checks for each increment. Then perform owner-assisted browser acceptance where required.
9. Update this plan, roadmap, and current-state ledger with exact commit SHAs, tests, failures, and what is or is not live-verified.

Do not mark any item complete because the document or UI exists. Use the repository's evidence/status rules. Keep all gates open until their acceptance criteria pass.
