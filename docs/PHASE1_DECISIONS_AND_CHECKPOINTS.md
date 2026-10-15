# Phase 1 — Owner Decisions, Working Agreement, and Checkpoints

**Status:** Planning baseline; implementation has not started from this document.
**Current phase:** Phase 1 — real AI coding through GitHub.
**Source of truth:** This document records owner-approved product decisions and the staged execution process. Update it as decisions are made. Do not treat a planned capability as implemented or verified.

## 1. Owner-approved decisions

### D-001 — Conversation titles

**Decision: Approved.**

- A new chat starts with an empty conversation view and ready-to-use composer.
- The first submitted user message creates the conversation.
- Forge generates a concise title from that first message automatically; the user is not required to name the conversation.
- The title is saved and appears in the conversation list.
- Title generation must not invent task details. The first version may use a deterministic title derived from the user's message.

### D-002 — Inspect, plan, work on a branch, review, and merge only after confirmation

**Decision: Approved. Branch, pull-request, and verification rules are specified below.**

The intended workflow is:

1. The AI may inspect the selected repository and relevant files.
2. The AI prepares and explains a plan before applying file changes.
3. File changes must not be written directly to the repository's default branch.
4. Forge uses the repository default branch as the target by default, while allowing the user to choose a different target branch. Changes are made on a separate working branch based on that target branch.
5. Forge reads the changed files back and makes the real branch, changed-file list, diff, and available verification evidence reviewable.
6. The user can inspect the proposed work and perform or request verification.
7. Forge opens a pull request from the working branch into the selected target branch by default. It must not merge until the user explicitly confirms the specific pull request and merge.
8. If the user declines, the work remains unmerged and the UI explains the available next steps.

**Safety invariants:**

- No silent writes to the default branch.
- No automatic merge based only on the model's confidence or a successful tool call.
- A successful write is not the same as a successful verification.
- A visible diff must correspond to actual GitHub changes, not model-generated text presented as a completed edit.
- Merge confirmation must clearly identify the source branch, target branch, and change being merged.
- Failed or incomplete work must never be represented as successfully completed.

**Verification and merge policy:** required checks must pass before merge is enabled by default. Forge must diagnose and attempt to fix failures. If checks remain failing or cannot run, Forge must clearly explain the evidence and allow the owner to explicitly override the verification block; that override must never be inferred from general approval or hidden in the UI. The merge confirmation must identify the PR, source branch, target branch, and verification status. An unmerged branch remains available for review or follow-up; it is not treated as merged.

### D-003 — Staged implementation and owner approval

**Decision: Approved.**

- Document findings, decisions, checkpoints, and tests in the repository.
- Work on one checkpoint at a time.
- Do not begin the next checkpoint while the current checkpoint has an unresolved required failure, missing evidence, or an unapproved decision.
- Inspect the implementation and gather evidence before proposing a fix.
- Make the smallest justified change for the current checkpoint.
- Run the relevant automated tests and build/type checks.
- Deploy and perform live verification when the checkpoint requires it.
- Record the commit SHA, exact tests/results, deployment evidence, remaining gaps, and owner test results.
- Present the checkpoint outcome to the owner and wait for confirmation before proceeding.
- If testing reveals another issue in the current checkpoint, document and resolve it before advancing.
- Never mark a checkpoint complete from code inspection or a successful build alone when live behavior is part of its acceptance criteria.

### D-004 — Diff and change-review UI

**Decision: Context-sensitive UI, not a permanently visible diff panel.**

- The diff UI should appear when there are actual changes to review, when the user requests a diff, or when a relevant review action is available.
- A normal conversation that does not involve code changes should not be dominated by an empty or permanently open diff panel.
- When code changes exist, the user must be able to open the real diff and inspect the associated files, branch, commit, and verification status.
- The UI may use a contextual panel, tab, drawer, or other appropriate presentation; the exact interaction and layout remain open for owner review before UI implementation.
- The interface must distinguish proposed changes from changes actually written to GitHub and from changes that have been verified or merged.

## 2. Current evidence and known issues

These are observations to investigate, not assumed root causes:

1. The owner reports that a simple chat run now ends with a generic message similar to 'Agent run did not complete', despite a successful Cloudflare deployment after the SSE framing fix.
2. The latest known main commit at planning time is 2e7c785b467c000843733d57b9c27d9dce0bc1de ('Fix server-sent event framing for chat runs'). Deployment success alone does not establish that the real AI run works.
3. Conversation records and message persistence paths exist, but the complete user experience for automatic titles, reopening messages, restoring repository/branch context, and supplying previous messages to the model must be tested and reconciled.
4. The repository selector uses a native dropdown; the owner wants a polished sliding/modal repository picker.
5. The owner reports that only one branch appears. The backend requests up to 100 branches, but the actual GitHub response, Forge API response, and frontend state must be compared before diagnosing the cause.
6. The existing chat UI needs refinement, but visual redesign must not precede the functional checks that establish correct run, history, and repository state.
7. A real AI-triggered GitHub file change on a non-default working branch has not yet been demonstrated end to end in the current live workflow.

## 3. Checkpoints and gates

### Checkpoint 0 — Planning and evidence baseline

**Purpose:** Establish an agreed scope and truthful starting point before implementation.

- [x] Record owner-approved conversation title behavior.
- [x] Record the branch-based edit/review/explicit-merge requirement.
- [x] Record the staged checkpoint/approval process.
- [x] Record context-sensitive diff behavior.
- [x] Resolve target-branch selection: default branch by default, with user-selectable target.
- [x] Resolve merge mechanism: pull request by default; merge only after explicit confirmation.
- [x] Resolve failed verification policy: passing checks required by default, with an explicit, clearly presented owner override.
- [ ] Record the current live run's sanitized diagnostic evidence if available.
- [ ] Confirm the test commands and baseline results from the repository's current source.
- [ ] Owner approves this planning baseline before Checkpoint 1 implementation.

**Gate:** Owner approves the planning baseline and the scope of Checkpoint 1.

### Checkpoint 1 — Diagnose and make a simple real AI run reliable

**Scope:** Run diagnostics, provider selection, provider request/response handling, agent-controller result/error handling, SSE delivery, and regression tests directly related to a simple chat run.

**Out of scope until this checkpoint passes:** broad UI redesign, conversation feature expansion, and unrelated refactoring.

**Acceptance criteria:**

- [ ] The actual configured real AI provider is confirmed in the deployed execution path.
- [ ] A simple prompt returns a real model response; no deterministic canned response or mock is used as proof.
- [ ] The run reaches and persists the correct terminal status.
- [ ] The browser receives the response and displays it.
- [ ] Provider/controller/tool errors are logged with useful sanitized diagnostic context.
- [ ] The browser receives a clear failure state if a run fails; no false success is displayed.
- [ ] Regression tests cover the confirmed failure and the corrected behavior.
- [ ] Focused tests and build/type checks pass.
- [ ] The deployed application is tested and evidence is recorded.
- [ ] The owner reviews the evidence and confirms the checkpoint before work advances.

### Checkpoint 2 — Conversation lifecycle and context

**Scope:** Empty new chat, first-message conversation creation, automatic title, message persistence, conversation list ordering, history restoration, repository/branch context restoration, and previous-message context passed to the model.

**Gate:** Multi-message conversation survives switching conversations and page reload; follow-up questions can use prior context; owner approves evidence.

### Checkpoint 3 — Repository and branch correctness

**Scope:** Diagnose the one-branch report across GitHub, backend API, and frontend state; fix the proven cause; test repository binding and branch restoration.

**Gate:** The displayed branch list matches the API/GitHub response, branch selection persists correctly, and owner approves evidence.

### Checkpoint 4 — Repository picker and chat workspace UX

**Scope:** Sliding/searchable repository picker, improved branch selector, responsive layout, Markdown/code blocks, accurate streaming/tool activity, and contextual diff/review UI.

**Gate:** UI states reflect actual backend results; no mock repositories, fake progress, or fabricated diffs; owner approves the design and tested behavior.

### Checkpoint 5 — Controlled AI coding workflow

**Scope:** Inspect and plan; create/use a working branch; apply authorized writes; read back changes; show actual diff and verification evidence; obtain explicit merge confirmation; perform the approved merge through the agreed mechanism; persist the result.

**Gate:** A real AI-triggered file change is confirmed in GitHub on a non-default branch, reviewed through the UI, and merged only after explicit owner confirmation. Unapproved work remains unmerged. Owner approves evidence.

### Checkpoint 6 — Run recovery and Phase 1 final acceptance

**Scope:** Relevant disconnect/reconnect, reload, timeout, failure, cancellation, duplicate subscription, and final state recovery tests; reconcile documentation and remaining risks.

**Gate:** Phase 1 acceptance requirements in docs/ROADMAP.md are met with evidence. Do not begin Phase 2 before the owner confirms the Phase 1 completion review.

## 4. Required record for every checkpoint

Before implementation:
- Observed problem and reproduction steps.
- Source/API/log evidence.
- Confirmed facts versus hypotheses.
- Root cause, only after evidence supports it.
- Proposed minimal fix and affected files.
- Owner decisions required.

After implementation:
- Branch and commit SHA.
- Exact files changed.
- Exact automated commands and pass/fail results.
- Build/type-check results.
- Deployment result, if applicable.
- Manual test card: URL, steps, expected result, what the owner should report, and safe stop condition.
- Actual owner-reported result; never infer it.
- Remaining gaps and checkpoint status.
- Owner's explicit decision to pass, revise, or hold the checkpoint.

Use these status labels consistently: **Implemented in code**, **Automated-tested**, **Live-verified**, **Partial**, **Not implemented**, **Blocked**, and **Owner-approved**. These labels are separate; for example, a feature may be implemented and automated-tested but not live-verified or owner-approved.

## 5. Next action

Product decisions affecting branch selection, merge mechanism, and failed verification are now resolved. Next, review this updated planning baseline and reconcile the roadmap. Do not implement Checkpoint 1 until the owner approves the updated planning baseline and its scope. After approval, investigate the failed agent run, collect evidence, propose the smallest fix, and wait for the owner's checkpoint decision before making changes.
