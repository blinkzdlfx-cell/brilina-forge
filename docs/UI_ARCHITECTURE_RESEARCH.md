# Brilina Forge UI Architecture Research

**Status:** Research and proposed direction — not an implementation specification yet  
**Scope:** Browser UI for the Phase 1 GitHub-centered AI coding workflow  
**Working branch:** `docs/ui-architecture-research`  
**Rule:** This document records research and recommendations. It does not prove that any product behavior is implemented or live-verified.

## 1. Purpose

Forge should not invent a coding-agent interface without learning from established products. This research examines public product documentation for OpenAI Codex, Anthropic Claude Code, OpenCode, and Google Gemini CLI, then translates reusable patterns into a small, maintainable web UI suited to Brilina Forge.

Forge is a browser-based orchestrator that connects a user, a model provider, and GitHub. It is not itself an AI model. Its UI should make the selected repository, current task, agent activity, real changes, verification evidence, and required user decisions understandable.

This is a pattern study, not a pixel-for-pixel copy of another product. Forge has a different runtime boundary: GitHub is the source of truth, the hosted API runs on Cloudflare Workers, and Neon stores Forge application state. The Worker does not provide a shell or browser terminal.

## 2. Research sources and observed patterns

### OpenAI Codex

Sources:
- [Introducing the Codex app](https://openai.com/index/introducing-the-codex-app/)
- [Work with Codex from anywhere](https://openai.com/index/work-with-codex-from-anywhere/)
- [Codex App Server architecture](https://openai.com/index/unlocking-the-codex-harness/)

Reusable patterns:
- Conversations/tasks are organized into threads and grouped around projects.
- Users can follow a task, review its changes in the thread, inspect diffs, and provide feedback.
- Progress, approvals, diffs, and test results are first-class information rather than hidden implementation details.
- Work isolation prevents one task from silently affecting another.
- The UI can supervise long-running work without forcing the user to watch every low-level operation.

What Forge should take from this:
- Keep task history easy to find.
- Keep progress and result attached to the conversation that produced them.
- Make the diff a review surface, not a decorative afterthought.
- Show clear task status and decision points.
- Translate the isolation principle into Forge's GitHub work-branch boundary; do not assume Forge needs local Git worktrees.

### Anthropic Claude Code

Sources:
- [Claude Code overview](https://code.claude.com/docs/en/overview)
- [Claude Code in VS Code](https://code.claude.com/docs/en/vs-code)
- [Claude Code on the web](https://code.claude.com/docs/en/claude-code-on-the-web)

Reusable patterns:
- The conversation is the main place to direct and refine work.
- Users can inspect proposed or actual changes in a dedicated diff view.
- File-level changes can be reviewed with line-level context and comments.
- Planning can be reviewed before implementation.
- Session history and the ability to continue work are core interaction patterns.

What Forge should take from this:
- Keep the conversation as the primary workspace.
- Make review contextual to the current task.
- Preserve a clear boundary between planning, editing, and reviewing.
- Consider inline diff comments later, after the basic read-back diff and PR flow is reliable.

### OpenCode

Sources:
- [OpenCode Web](https://dev.opencode.ai/docs/web/)
- [OpenCode tools and permissions](https://docs.opencode.ai/docs/tools/)
- [OpenCode permissions](https://dev.opencode.ai/v2/docs/permissions/)
- [OpenCode terminal UI](https://docs.opencode.ai/docs/tui/)

Reusable patterns:
- Sessions can be started, revisited, and switched between.
- The web interface exposes sessions without requiring users to work in a terminal.
- Tool permissions can distinguish allowed, denied, and approval-required actions.
- Tool outputs and session activity are part of the interaction rather than opaque background behavior.

What Forge should take from this:
- Keep sessions/conversations persistent and selectable.
- Present tool activity in a compact, readable timeline.
- Treat permissions and approvals as explicit UI states.
- Do not expose terminal-style controls for capabilities Forge does not actually provide.

### Google Gemini CLI

Sources:
- [Gemini CLI settings](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/settings.md)
- [Gemini CLI Plan Mode](https://github.com/google-gemini/gemini-cli/blob/main/docs/cli/plan-mode.md)
- [Gemini CLI policy engine](https://github.com/google-gemini/gemini-cli/blob/main/docs/reference/policy-engine.md)

Reusable patterns:
- Planning is a distinct, read-only mode.
- Users can review a plan and explicitly approve moving into implementation.
- Approval modes make the action policy visible.
- Session and tool states should communicate whether the agent is working, waiting for a decision, or finished.

What Forge should take from this:
- Provide a clear plan/review/implementation progression when the workflow supports it.
- Do not make approval a vague chat instruction; represent it as a deliberate UI action.
- Make read-only and write-capable states distinguishable.
- Do not add every CLI setting or mode to the first web UI.

## 3. Shared interaction principles

Across these products, the strongest reusable patterns are:

1. **Conversation/task is the center.** The user directs the work in a persistent thread.
2. **Project context is always understandable.** The user can tell which repository and branch the task is using.
3. **Activity is visible but compact.** Tool calls, progress, and verification are summarized and expandable.
4. **Changes are reviewable.** A diff is connected to the task and the source of truth.
5. **Approval is explicit.** Consequential operations have a clear action and confirmation point.
6. **Planning and execution are distinguishable.** A plan is not represented as if code has already changed.
7. **History is recoverable.** Switching conversations should not silently erase or fabricate context.
8. **The interface reports truthfully.** Proposed, written, read-back, verified, and merged are different states.
9. **Complexity is progressive.** Advanced controls appear when relevant, not all at once.
10. **Responsive surfaces preserve the workflow.** Review and approval must remain usable on a phone, not only a desktop.

These are design patterns inferred from public product documentation, not claims about their private implementations.

## 4. Current Forge UI: source inspection baseline

The current default-branch frontend is a React/Vite app under `web/`. The inspected files include:
- `web/src/App.tsx`
- `web/src/styles.css`
- `web/src/main.tsx`
- `web/package.json`

The current implementation already has the beginnings of a recognizable coding workspace:
- a collapsible conversation sidebar,
- a central chat area,
- repository and branch selectors,
- tool activity rows,
- a diff panel,
- session/authentication handling.

Source-level gaps visible during this inspection:
- The current repository picker is a native select rather than a searchable modal.
- The conversation view initializes and falls back to a hard-coded welcome message, including for empty conversation history. That can make an empty conversation look like persisted assistant history.
- The page is implemented largely in one `App.tsx` component, which makes UI responsibilities harder to isolate and test.
- The diff is currently part of the main chat flow rather than a clearly defined contextual review surface.
- Current CSS defines a desktop sidebar/main layout, but responsive and interaction states need explicit acceptance checks.
- Source inspection does not establish whether the deployed app behaves correctly; the Phase 1 live run/write workflow remains a separate verification gate.

This baseline is based on source inspection only. It is not a live browser audit and does not authorize a broad redesign.

## 5. Recommended Forge information architecture

### A. Persistent workspace shell

**Left sidebar**
- Forge mark and workspace identity.
- Primary **New chat** action.
- Searchable or filterable conversation history.
- Selected conversation highlighted.
- Account/session controls near the bottom.
- Collapse on wide screens; become a slide-in drawer on narrow screens.

The sidebar should organize conversations, not become a second dashboard full of unrelated controls. Empty history should show a genuine empty state rather than a fake assistant message.

**Top workspace bar**
- Current conversation title.
- Selected GitHub repository.
- Selected target branch.
- Current working branch when one exists.
- Repository/branch picker controls.
- Contextual actions such as opening the change review or GitHub PR.

Keep the target branch and the agent's working branch distinct. The target defaults to the repository's default branch, but the owner can select another target. Changes are made on a working branch, and a pull request is the default review/merge route.

### B. Main conversation workspace

**Conversation transcript**
- User and assistant messages.
- Markdown and code rendering.
- Copy affordances for code blocks.
- Clear loading, streaming, stopped, and failed states.
- Task progress and tool activity attached to the assistant turn that produced them.
- No invented messages or fake results.

**Agent activity**
- Show concise summaries such as “Reading repository files”, “Creating working branch”, “Updating file”, or “Running checks” only when supported by real events.
- Allow details to expand when useful.
- Show completed, waiting for approval, failed, and cancelled states distinctly.
- Do not display internal chain-of-thought. Show action summaries, relevant tool inputs/outputs, and evidence appropriate for the user.

**Composer**
- Multi-line input anchored at the bottom of the conversation.
- Send/stop behavior that reflects the real run state.
- Repository context visible nearby.
- Disabled or guarded actions when required context is missing.
- On mobile, account for the software keyboard and keep the send/stop control reachable.

### C. Contextual change-review surface

Do not permanently reserve a large empty diff panel. Show the review surface when:
- actual changed-file/diff data exists,
- the user requests it, or
- a review action is available.

On wide screens, use a right-side drawer or split review panel while preserving the conversation. On mobile, use a full-screen sheet/page with an obvious way back to the conversation.

The review surface should include:
- changed-file list,
- added/deleted line counts,
- readable unified diff first, with side-by-side view considered later if useful,
- file status (added/modified/deleted),
- working branch and target branch,
- commit and pull-request links when they exist,
- verification/check status and evidence,
- explicit next action.

Keep these states separate:
1. **Proposed** — the model described a change but it is not written.
2. **Written** — GitHub confirms a write/commit on the working branch.
3. **Read back** — Forge fetched the resulting file/diff from GitHub.
4. **Verified** — named checks actually ran and their results are recorded.
5. **PR opened** — GitHub confirms a pull request exists.
6. **Merged** — GitHub confirms the pull request is merged.

Never infer a later state from an earlier one.

### D. Approval and error surfaces

Use a focused dialog or inline decision card for consequential actions. It should state:
- the action requested,
- repository and branch affected,
- expected external side effect,
- whether checks passed, failed, or were unavailable,
- the explicit choices available.

Merge remains a separate explicit owner action. Passing checks are required by default. If checks fail or are unavailable, any owner override must be a separate, clearly labeled action—not silently bundled with ordinary merge confirmation.

Errors should explain the next useful action without leaking secrets or raw provider credentials. When safe, expose a request/run identifier and sanitized diagnostic details for support/debugging.

## 6. Suggested frontend component boundaries

Keep React/Vite and the current CSS approach for now. Do not introduce a new component library or redesign the entire application before the current run/write path is reliable.

As the UI is incrementally improved, split responsibilities into small components:
- `AppShell` — page structure and responsive layout.
- `ConversationSidebar` — new chat and conversation history.
- `WorkspaceHeader` — title, repository, target branch, working branch, contextual actions.
- `RepositoryPickerDialog` — search/filter repositories and display loading/empty/error states.
- `BranchPicker` — target and working branch choices with clear labels.
- `ChatTranscript` and `MessageBubble` — messages and rendering.
- `Composer` — message entry, send, stop, and disabled states.
- `AgentRunActivity` — truthful progress and tool event summaries.
- `ChangeReviewPanel` — changed files, diff, GitHub references, and check status.
- `ApprovalCard` — explicit consequential-action decisions.
- `StatusNotice` — non-blocking errors and operation feedback.

These are proposed boundaries, not a requirement to create all components at once. Extract a component when doing so isolates a real behavior or makes it testable.

## 7. UI state model

The UI should render from durable API state and typed events, not guess from button clicks or elapsed time.

At minimum, model these concepts separately:
- **Authentication:** loading, signed out, signed in, error.
- **Conversation:** loading, empty/new, loaded, sending, restoring, error.
- **Agent run:** queued, running, awaiting approval, succeeded, failed, cancelled, timed out where supported.
- **Repository context:** unselected, loading, selected, unavailable/error.
- **Branch context:** target branch, working branch, current selection validity.
- **Changes:** none, proposed, written, read back, verified.
- **Pull request:** not created, open/draft, checks pending/passed/failed/unavailable, merged/closed.
- **Transient UI:** dialog/drawer open, toast, composer state.

Do not conflate an SSE stream ending with a successful run. The persisted run result is authoritative. On reconnect or page refresh, the UI should reload the stored conversation/run state instead of manufacturing success or losing the outcome.

## 8. Responsive and accessible behavior

Desktop:
- persistent sidebar,
- compact workspace header,
- centered readable transcript,
- contextual diff drawer or split review view.

Tablet:
- collapsible sidebar,
- tighter header with repository and branch actions grouped in a picker,
- review panel sized to available width.

Mobile:
- drawer for conversation history,
- repository/branch picker in a dedicated modal or full-height sheet,
- composer remains reachable above the software keyboard,
- diff review gets a full-screen view rather than a cramped narrow column,
- buttons have clear text/accessible names and adequate touch targets.

All sizes:
- keyboard focus is visible,
- dialogs manage focus and close predictably,
- color is not the only status indicator,
- loading/empty/error states are explicit,
- reduced-motion preferences are respected,
- long repository names and paths wrap or truncate without hiding identifying information,
- screen-reader labels distinguish target branch from working branch.

## 9. Recommended implementation order

The UI must not be broadly redesigned while the real AI run and GitHub write path is still failing or unverified.

1. **Stabilize and verify Phase 1 behavior.** Fix the current live run failure, prove a real model response, and prove an AI-triggered GitHub file write on an authorized non-default branch with read-back and a reviewable diff.
2. **Correct conversation lifecycle and truthfulness.** Remove fake history fallback, ensure first-message creation/title behavior, restore history accurately, and load persisted run outcomes.
3. **Correct repository/branch state.** Compare GitHub data, API responses, and frontend state before changing the selector.
4. **Extract the minimum UI components needed for safe changes.** Keep visual behavior stable while separating responsibilities.
5. **Implement the repository picker modal and responsive navigation.** Include search, loading, empty, error, keyboard, and mobile states.
6. **Improve activity and change review.** Render actual persisted events and read-back diffs, with the contextual review surface.
7. **Add PR/check/merge decision states.** Respect the existing owner-approved rules: PR by default, explicit merge approval, checks required by default, separate override for failed/unavailable checks.
8. **Run automated and live acceptance.** Record source SHA, exact test/build commands, GitHub side effects, and owner-performed browser evidence when required.

Each step is a checkpoint. If a required test fails, fix it before advancing. Do not claim completion based on this research document.

## 10. Acceptance criteria for the UI architecture

Before calling a UI checkpoint complete, verify all relevant criteria:
- [ ] A new conversation starts empty; no fake persisted assistant message appears.
- [ ] The first user message creates the conversation and the title is generated automatically.
- [ ] Selecting a conversation restores its actual message history and current context.
- [ ] Repository and target/working branch labels are unambiguous.
- [ ] Searchable repository selection works for loading, empty, error, and success cases.
- [ ] Activity summaries correspond to real run/tool events.
- [ ] A failed or incomplete run is never displayed as successful.
- [ ] A changed-file/diff surface appears only when useful and shows data read back from GitHub.
- [ ] Written, verified, PR-open, and merged states are not conflated.
- [ ] Merge requires explicit owner confirmation; failed/unavailable checks require a separate override.
- [ ] Layout and core actions remain usable on a narrow mobile screen.
- [ ] Keyboard focus, labels, dialogs, and status messaging are accessible.
- [ ] Focused tests/builds pass and required live/GitHub checks have recorded evidence.

## 11. Documentation boundary

This document is the UI research and proposed UI architecture reference. It is not the future machine-searchable documentation system.

A later documentation task should create a concise, authoritative Forge platform guide for AI coding tools. That guide should explain Forge's actual runtime boundaries, data ownership, provider/agent flow, tool contracts, event/run lifecycle, repository/branch safety, testing commands, and links to detailed docs. It should live in ordinary repository Markdown first. Any indexed, searchable, or API-served documentation capability should be designed later as a separate task; it is not required for this UI research checkpoint.

## 12. Research limitations

- The research uses public official product documentation, not private source code or claims about hidden implementation.
- UI details change over time; revisit sources before making later product decisions.
- This work is source/research based. No visual prototype, frontend code, automated tests, deployment, or live browser acceptance has been produced by this document alone.
