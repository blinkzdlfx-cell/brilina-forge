# Brilina Forge — Unified Implementation Plan

**Status:** Active delivery plan; supersedes overlapping roadmaps and TODO lists for sequencing/status. **Last updated:** 2026-10-17.  
**Delivery rule:** work directly on `main` unless the owner explicitly changes this; one coherent batch at a time; test, inspect the diff, record evidence, and stop at the acceptance gate.

## 1. Baseline and known open work
The repository already contains a React/Vite frontend, native Cloudflare Worker API, Neon schema/persistence, GitHub REST + GraphQL service, provider adapter, controller/tool registry/policy, tests, and partial companion scaffolding. Do not rebuild these from scratch without evidence.

Previously recorded code checkpoint: `a1a7ab7a51f12ca4a5bf587a77b8599b27820d1b` on `main`; the repository's live HEAD must be checked again before implementation. Recorded GitHub Actions run 242 passed build, Phase 1 typecheck/tests, Worker tests, Wrangler dry-run, and dependency audits for that checkpoint. This historical CI evidence does not prove current HEAD, live provider behavior, production deployment, or end-to-end GitHub writes.

Known open/unverified:
- Tailwind CSS v4 and the shadcn-compatible component foundation are installed. Remaining UI work is the staged migration of legacy screen-specific CSS and markup into reusable Tailwind/shadcn patterns; avoid a risky all-at-once rewrite.
- Full deployed UI acceptance (desktop/mobile, sidebar, session, context selectors, compare, composer, keyboard/focus) is owner-dependent.
- A real configured-provider AI tool call that writes on an authorized non-default GitHub branch, reads back, displays actual diff/commit, and survives reload remains a mandatory unverified gate.
- Durable ordered event ledger/replay, full in-flight cancellation, disconnect/resume semantics, and exact-call approval/resume are not established.
- GitHub Actions repair, a secure complete local companion, Cloudflare diagnostics, multiple providers, and teams are later capabilities; companion scaffolding is not proof of a complete companion.
- Do not treat prior CI counts/status as current without checking actual commit and workflow.

## 2. UI progress ledger (updated 2026-10-17)

**Progress metric:** accepted UI modernization batch gates, not subjective visual impressions. There are five planned UI batches (1–5); a batch counts only after its automated gate and required owner/live acceptance evidence are recorded.

- **Accepted UI batches:** 2 of 5 (40% acceptance-gated completion). Batch 1 (Tailwind + shadcn/ui foundation) and Batch 2 (foundational components/theme tokens) were owner-accepted; Batch 2's automated checks passed. Batch 3's workspace-shell/context-panel changes and the reported dialog-alignment correction are implemented in source. Automated checks are passing on the feature commits; owner acceptance remains open because the owner observed a chat-send `Failed to fetch` error. This batch count measures planned modernization gates, not individual CSS tasks.
- **Targeted correction status: owner-reported live verification PASSED on 2026-10-17.** The owner tested the deployed mobile UI and reported PASS for all five checks: hamburger position/drawer, user/assistant alignment, run activity placement, mobile newline, and send button. Automated verification of the latest correction commits remains unconfirmed.
- **Targeted corrections implemented in source:**
  1. Mobile navigation button moved to the left edge of the mobile top bar.
  2. User messages aligned to the right; assistant messages remain left-aligned.
  3. Run activity rendered in the same chronological transcript using run/message timestamps, so the run activity appears before the assistant response produced by that run rather than in a block after all messages.
  4. Mobile Enter inserts a newline; the send icon sends. Desktop Enter sends and Shift+Enter inserts a newline.
- **shadcn/ui status:** Batch 2's reusable Button, Input, Textarea, Field, Card, Badge, Separator, Skeleton, Alert, Dialog, and Sheet components are owner-accepted; `cn()` supports standard `ClassValue` inputs. Semantic light/dark tokens and theme-aware sidebar tokens are in place. The current mobile drawer remains dark by default; `.theme-light` provides contrasting light-sidebar tokens and `.dark` provides a semantic dark palette, but there is no theme toggle and the full screen is not yet dark-mode-ready. Batch 3 now uses shadcn `Button` and `Dialog` in the workspace shell. Legacy screen-specific CSS remains and is being reduced in later UI batches; do not claim the whole screen has been migrated.
- **Source checkpoints:** Batch 2 component checkpoint `2f5657d7a795579fff62320f2b03a2a92c63253a` passed CI run `39034304815`; follow-up documentation checkpoint `fcd4482426ca5599f9da5fd7de6ceb6f26831e51` passed CI run `39034356761`. Batch 3 workspace changes `6656fd8245361a6abadc0435bc86e018dc904c62` (`web/src/App.tsx`) and `e60074a56f98c2d6fbf452eb8da119484b945375` (`web/src/styles.css`) passed CI runs `39036991908` and `39037020937`. The JSX cleanup at `45230012c31494e18d9c68601395a6e37204a6af` passed CI run `39037111846`; the documentation/checklist commits `58eb68dce142bad5a692f91f18d2cb4d16dc870e`, `ed76e9f3fdc1f84c7eadb20e6734d099321989b2`, and `571782936e92884711fede91770a9bef164ecbc0` passed CI runs `39037074404`, `39037130275`, and `39037197197`. The latest dialog-centering change is `ac5b84d0b48576af09d41fcb832bb11da151ddf6`; the chat request-stage diagnostic is `27d1f9878eeb17d1310ba9168daaf46d332667e0`. CI runs `39038153425` and `39038141731` were still in progress when this note was prepared. Public live checks of `/health` succeeded and unauthenticated `/api/session` returned `{\"authenticated\":false}`. No authenticated conversation-create/run request could be reproduced without the owner's session, and no Cloudflare runtime logs were available through the connected tools. The chat-send failure's exact backend cause is therefore not yet established. Desktop keyboard behavior remains owner-unverified.
- **Current implementation batch:** Batch 3 — visible workspace-shell modernization and repository/branch context panel. Automated verification and owner live acceptance are pending.

### Owner test card for the latest corrections
1. Open the deployed Forge on a phone and refresh after the new version is deployed.
2. Confirm the hamburger is at the far left of the top bar and opens/closes the drawer.
3. Open the repository/branch context button. Confirm the panel opens, the repository and branch fields remain readable, Escape and the close button dismiss it, and changing the repository loads its branches without duplicate/stale options.
4. Open Compare inside the panel, choose a different base branch, run the comparison, and confirm the actual diff still appears in the transcript after the panel closes.
5. Send a short prompt. Confirm your bubble is on the right and the assistant response is on the left.
6. During a coding run, confirm run activity appears between your prompt and the AI's response, not after the response. If a run has no tool calls, its run activity may state that no tool activity was recorded; do not expect invented events.
7. In the mobile composer, press Enter once: it should add a new line without sending. Tap the send icon to send.
8. On desktop later, confirm Enter sends and Shift+Enter inserts a new line.
9. At desktop and phone widths, confirm no horizontal page overflow and the header context stays visible while the transcript scrolls.
10. Report each step as PASS/FAIL; include a screenshot for any visual failure. **Owner result (2026-10-17): all five mobile checks PASS.** Desktop Enter/Shift+Enter remains pending an owner desktop test.

## 3. Batch plan and acceptance gates

### Batch 0 — Documentation consolidation and source baseline
**Goal:** one consistent set of project instructions and an evidence-based starting point.  
**Work:** establish PRODUCT_SPEC.md, IMPLEMENTATION_PLAN.md, and AGENT_WORKFLOW.md; update README and Kilo entry prompt; mark overlapping docs as supporting/history; preserve technical setup, security, database, testing, and historical evidence. Check current HEAD/status before code implementation.  
**Gate:** authoritative documents agree, no material owner-approved requirement is lost, and Kilo has one clear entry point.  
**Status:** accepted for documentation scope. Verified the new specification, implementation plan, agent workflow, README, and Kilo entry prompt by reading them back from GitHub. Supporting legacy documents now point to the consolidated sources. Documentation commit sequence: `29f433c` → `5d458d1` → `4a4456a` → `7b35373` → `271845a` → `9f06281` → `e2bf52a` → `8e637c7` → `ab45478` → `802008b`. No application code, dependencies, database schema, or deployment was changed. Next: clone the repository, inspect local HEAD/status, then begin Batch 1.

### Batch 1 — Tailwind + shadcn foundation
**Goal:** establish styling/component foundation without changing product behavior unnecessarily.  
**Work:** Tailwind CSS v4 through `@tailwindcss/vite`; shadcn-compatible `components.json`; semantic CSS variables mapped into Tailwind; `@/*` Vite/TypeScript aliases; shared `cn()` utility; required Radix slot, class variance, class merge, and icon dependencies. Existing screen CSS and behavior remain in place; component migration is deferred until the foundation passes. The dependency lockfile must be generated by npm, not hand-edited.  
**Acceptance:** dependency lockfile updated; build and relevant typechecks/tests pass; app still loads; no accidental backend/config changes; diff reviewed. **Status: owner-accepted** after the owner checked the deployed app. Existing screen behavior was preserved; shared component migration continued in Batch 2.

### Batch 2 — Foundational components and approval
**Goal:** create a coherent, accessible base layer.  
**Work:** build/reconcile buttons, inputs, textareas, selects/comboboxes, dialogs/sheets, tooltips, badges/status, cards, separators, skeleton/loading, dropdown/menu, toast/alerts, and icon patterns only as required by real screens. Avoid unused components.  
**Implemented so far:** `button.tsx`, `input.tsx`, `textarea.tsx`, `field.tsx`, `card.tsx`, `badge.tsx`, `separator.tsx`, `skeleton.tsx`, `alert.tsx`, `dialog.tsx`, and `sheet.tsx`; `cn()` now supports `ClassValue`; sidebar color/background/border/hover/active/card colors use explicit theme tokens; `.dark` semantic palette and `.theme-light` sidebar contrast tokens are prepared. No screen migration or visible theme switch was added.

**Acceptance:** PASSED. CI run `39034304815` passed build, Phase 1 typecheck/tests, Worker tests, Wrangler dry-run, and dependency audits. The owner reviewed and accepted the component layer/theme-token approach. Components may now be reused where they fit actual screens; do not force unused components into features.

### Batch 3 — Workspace shell, navigation, responsive behavior
**Goal:** modernize application layout.  
**Work implemented in source:** modernized the workspace header with a persistent conversation/repository/branch summary; moved repository, working-branch, and compare-base controls into an accessible shadcn `Dialog`; added shadcn buttons and Lucide icons for context/navigation actions; retained the existing desktop collapsible sidebar, mobile drawer/backdrop, independent conversation-list scrolling, account controls, session-resolution states, last-conversation restore, and explicit empty New chat. The mobile hamburger remains at the far left. The context panel is deliberately a control surface, not a theme toggle. Existing run/chat APIs and conversation behavior were not intentionally changed. Following owner feedback, the dialog now explicitly uses fixed positioning, zero inset, and auto margins to center it despite the global reset. The send handler now distinguishes network failures while creating a conversation from failures while starting a run; it also warns that an SSE disconnect may not mean the run stopped.  
**Acceptance:** owner reported that refresh/sidebar and branch loading worked, but the context dialog was left-shifted and sending `hi` displayed `Failed to fetch`. Dialog alignment is corrected in source. `/health` responds publicly, so the Worker is reachable, but the authenticated POST that failed could not be reproduced without the owner's session and its exact cause is not yet proven. After the latest deployment, retry one short message; if it fails, the new error names whether conversation creation or run startup failed. Use that stage plus Cloudflare Worker logs to fix the actual backend failure. Do not mark Batch 3 accepted until the send test succeeds and the dialog is visibly centered. Compare flow, desktop keyboard/focus, and horizontal overflow remain owner-unverified.

### Batch 4 — Conversation and chronological activity system
**Goal:** make each coding run understandable and preserve its history.  
**Work:** user/assistant messages and real activity entries in chronological order; group/associate events by conversation/run/tool call; preserve earlier activity; distinguish plan/request/approval/execution/result/verification/final answer; add expandable details and honest status labels; prevent stale responses corrupting current state. Use existing persisted data honestly until durable event contract exists; never fabricate events.  
**Acceptance:** correct ordering/association under multiple messages and conversation switching; refresh restores available history; gaps from missing durable events are labelled rather than hidden.

### Batch 5 — Repository controls, composer, voice, and review affordances
**Goal:** modernize primary interaction controls.  
**Work:** repository/working branch selectors; compare-base panel/modal; immutable repo/branch context snapshot per run; fixed/growing composer; icon submit; Enter/Shift+Enter; draft retention; jump-to-latest; accessible loading/error states; voice controls only where real functionality exists; review panel for real diff/branch/commit.  
**Acceptance:** selectors resist stale responses, context cannot change an in-flight run, composer works on mobile/desktop, review metadata matches GitHub.

### Batch 6 — Core GitHub coding workflow integration gate
**Goal:** prove the real AI can make a controlled, reviewable code change.  
**Work:** inspect provider configuration, OAuth/session, conversation binding, tool registration, controller, GitHub service, Neon persistence, UI activity/diff; fix smallest missing pieces; ensure writes are branch-scoped, use blob SHA, are bounded/audited, read back, and expose branch/file/diff/commit.  
**Hard acceptance gate:** with an explicitly owner-approved test repository and non-default branch, a real configured provider invokes a file write; GitHub confirms content and commit; Forge reads it back and shows reviewable diff/commit; conversation/run history survives reload; wrong repository/default branch attempts are rejected. No production file/default branch writes. If this fails, fix and retest this batch before claiming core coding complete or moving to dependent autonomy work.

### Batch 7 — Durable orchestration, event persistence, approval, recovery
**Goal:** runs remain correct through disconnects and failures.  
**Work:** versioned Neon migrations for ordered events/approval records; valid transition contract; atomic/idempotent run claim; persist-before-publish event sequence; authenticated replay/reconnect; distinguish disconnect from cancellation; in-flight cancellation; timeouts/retries/stale work; approval bound to exact call; resume at most once; no repeated side effects. Evaluate Cloudflare Workflows only via bounded proof of concept.  
**Acceptance:** automated interruption, duplicate-submit/subscriber, reconnect/replay, approval, cancellation, timeout, and recovery tests prove accurate state and no duplicate completed side effects.

### Batch 8 — GitHub Actions verification and bounded repair
**Goal:** verify actual code changes and optionally repair failures.  
**Work:** inspect/dispatch permitted workflows; show real run/job/step status; retrieve bounded/redacted logs; correlate checks to commit/branch; diagnose and make bounded repair attempts through approved GitHub tools; rerun checks.  
**Acceptance:** a deliberately failing check is diagnosed, repaired, rerun, and reported with real workflow evidence. No automatic merge/deploy.

### Batch 9 — Local companion completion
**Goal:** safe, explicit local execution on the user's computer.  
**Work:** durable device identity/ownership/revocation; authenticated expiring idempotent work/result contracts; execution-time deny/ask/allow policy; exact-call approval/resume; working-directory and command restrictions; time/output/process bounds; redaction, cancellation, cleanup, fail-closed behavior.  
**Acceptance:** only an authorized approved operation runs on the intended device and its result is durably linked to the correct run. No shell in Worker/browser terminal.

### Batch 10 — Cloudflare diagnostics and production hardening
**Goal:** reliable diagnostics and security/regression closure.  
**Work:** least-privilege log access, filtering/redaction, source/commit correlation, rate limits, export/restore rehearsal, accessibility and end-to-end regression, deployment checks, legacy route review.  
**Acceptance:** diagnostic evidence is real and safely scoped; security/regression checks pass; no production deployment without explicit authorization.

### Batch 11 — Provider expansion, teams, and later capabilities
**Goal:** extend only after the core product is reliable.  
**Work:** add providers based on real capability/quota/cost tests; teams/workspaces and roles; per-workspace integration/secret isolation; retention, recovery, usage visibility.  
**Acceptance:** provider-specific and multi-user isolation tests pass. Do not add team features before access boundaries are demonstrated.

## 4. Standard batch cycle
1. Read PRODUCT_SPEC.md and AGENT_WORKFLOW.md, then identify the current batch here.
2. Inspect local branch, HEAD SHA, and working tree; preserve all changes.
3. State goal, scope, affected files, acceptance criteria, tests, risks, and owner decisions.
4. Implement related work as a coherent unit; do not silently expand scope.
5. Run focused tests, typecheck/build, security checks, and CI where applicable.
6. Fix failures and rerun; never advance with a known failing check.
7. Inspect final diff for accidental generated files, secrets, unrelated changes, and architecture drift.
8. Commit/push to agreed branch (normally main) and record SHA, changed files, commands/results, CI evidence, live checks, known gaps, next step.
9. If owner access is required, pause with one consolidated manual test card and wait for the result.
10. Mark the gate accepted only with evidence; otherwise leave it open and fix/retest.

## 5. Deployment and change safety
- Do not deploy production, perform destructive database changes, migrate databases, or alter authentication/security boundaries without explicit owner authorization.
- Do not create a new branch or pull request by default; work directly on main as agreed.
- Never discard or overwrite local uncommitted changes.
- Never invent successful integrations or add mock data to conceal missing functionality.
- If actual repository state conflicts with this plan, report and reconcile before implementation.


## 4. GitHub tool system rollout (2026-10-17)

Production execution uses Forge-owned GitHub tools through the existing REST/GraphQL service. The official GitHub MCP server is a reference catalogue only; its diagnostic/probe routes are no longer exposed by the production Worker. Every adopted or added capability must be logged in `docs/GITHUB_TOOL_SYSTEM.md`.

### Batch A — Source inventory and dependency map
- **Status:** architecture/source map documented; exact upstream catalogue evidence still incomplete.
- The eleven current Forge GitHub tool IDs and their source files are recorded in `docs/GITHUB_TOOL_SYSTEM.md`.
- The original live MCP response reported 46 tools, but its exact names were not preserved in available evidence. Do not fabricate the missing snapshot or claim a definitive one-to-one mapping. Capture the original response if available before expanding the catalogue.

### Batch B — Catalogue, availability, and settings UI
- **Status:** implementation committed; migration and automated verification pending.
- `src/agent/tool-catalog.ts` owns tool metadata, category/risk labels, server defaults, and fail-closed filtering for uncatalogued `github.*` tools.
- `github.push_files` uses GitHub's Git Data API to write up to 25 files in one commit, rejects duplicate paths/default-branch writes, enforces size limits, and reads every file back before reporting success. Automated service/tool tests were added but have not been run in this session.
- `ToolRegistry` applies user availability preferences to both model tool discovery and controller lookup.
- `src/db/github-tool-preferences.ts` persists preferences per Forge user. Authenticated GET/PUT endpoints are at `/api/settings/github-tools`.
- UI placement is the stable **Settings** entry directly below **New chat** in the workspace sidebar, including collapsed and mobile navigation. The Settings dialog contains category toggles and individual tool toggles. This is separate from the repository/branch context dialog.
- Apply `db/migrations/004_github_tool_preferences.sql` to the intended Neon branch before using these endpoints.

### Batch C — Core repository/branch/file/diff capabilities
- **Status:** existing native tools retained; live acceptance pending.
- The current eleven catalogued tools cover repository metadata/context, branches, tree/file reads, diffs, work-branch creation, file create/update/upsert, and `github.push_files` for up to 25 files in one commit with per-file read-back verification.
- Write tools enforce selected-repository scope, reject writes to the current GitHub default branch using live repository metadata, and verify content by reading it back.
- A configured-provider run must still prove branch creation/write, GitHub read-back, commit evidence, and a reviewable diff.

### Batch D — Capability expansion and preference safety
- **Status:** core preferences implemented; new GitHub capability groups intentionally deferred.
- User settings can only restrict the server-catalogued defaults. They cannot enable unknown/server-disabled tools or bypass repository/branch authorization.
- Issue, pull-request, Actions/checks, and release capabilities are not yet implemented as Forge tools. Add them only when a concrete workflow and required GitHub permissions are documented.
- Merge, deployment, and security-administration actions remain excluded from autonomous defaults.

### Batch E — Agent integration, immutable context, and regression
- **Status:** source integration committed; automated verification pending.
- The Worker loads persisted preferences before creating the agent controller; `ModelContext` advertises only available tools and controller lookup rejects disabled/unknown tools.
- `db/migrations/005_run_context_snapshot.sql` adds repository/branch snapshots to runs. Run creation stores the selected context and the event endpoint executes using that snapshot, not the conversation's later context. Apply migration 005 before using this path.
- Run tests, typecheck, Worker tests, and production frontend build against the resulting HEAD. No passing CI/build evidence has been observed in this session.

### Batch F — Cleanup and dependent workflows
- **Status:** MCP route cleanup and source/documentation updates committed; final verification and runtime acceptance pending.
- The official GitHub MCP diagnostic/probe routes were removed from `worker/api.ts`; its diagnostic helper/tests remain isolated and are not imported by the production Worker.
- Preserve the REST/GraphQL division in `src/github/service.ts`.
- After the tool-system acceptance gate passes, continue the dependent workflow work: durable event replay/reconnect, reliable run-history reload, verified write-to-diff presentation, and later UI modernization batches. Do not declare these dependent items complete based only on tool registration.
- No deployment or database migration was performed from this session.

**Current checkpoint:** source changes are committed directly to `main`, including the catalogue, registry filters, preferences repository/API/UI, default-branch write protection, run-context snapshot code, and MCP route cleanup. The additive migrations 004 and 005 are not applied; the exact upstream 46-name snapshot is not available in the retrieved evidence; and automated plus live GitHub acceptance tests remain outstanding. Do not start owner acceptance testing until those preconditions are prepared.

## 5. Authentication foundation and multiple GitHub accounts — priority batch

**Owner decision (2026-10-17):** Sign in to Forge with GitHub first. Add Google and email sign-in later through the same Forge identity/session architecture. A single Forge user must be able to connect multiple GitHub accounts and switch between them without creating separate Forge accounts.

**Current state from source inspection:** the Worker already has GitHub OAuth start/callback/logout routes, an opaque brilina_session cookie, Neon-backed sessions, and encrypted GitHub token storage. However, the current session resolver binds one session to one GitHub user/connection, and createPersistentSession upserts github_connections on user_id; this is a one-connection-per-Forge-user model. The public product architecture must move to a stable Forge identity with separately linked authentication identities, GitHub account connections, and GitHub App installations. Do not assume the existing login flow already supports multiple accounts or the final GitHub App model.

### Auth entry UI — guest shell and login navigation (2026-10-17)
- **Status:** implementation committed to `main`; automated build and live desktop/mobile checks still required.
- Unauthenticated visitors now remain in the chat workspace shell rather than landing on the login card immediately. Guest sidebar content excludes conversation history, repository controls, settings, and account details.
- The sidebar provides a labelled Log in action when expanded and an icon with an accessible label/tooltip when collapsed. On mobile, the drawer contains the labelled action and a separate Log in icon remains visible in the top bar while the drawer is closed.
- Log in opens the dedicated `/login` screen with Continue with GitHub. Guests can compose a draft; sending routes to login and the draft is restored after authentication.
- This is UI routing only; it does not claim to implement multiple GitHub identities or GitHub App installation support. Keep those in the authentication batches below.

### Auth Batch 1 — Database and identity model (current priority)
- Inspect the actual schema, constraints, repository/session queries, and existing tests before designing migrations.
- Preserve existing users, workspaces, sessions, conversations, repositories, and runs. Do not create duplicate Forge users when linking another GitHub identity.
- Introduce versioned, additive Neon migrations for provider identities and multiple GitHub connections/installations. Backfill existing GitHub-only users and their current connections without losing credentials or ownership.
- Remove the github_connections(user_id) uniqueness assumption only after all reads/writes have been updated to address a connection explicitly; add a stable connection identifier and explicit installation/account identifiers where needed.
- Keep secrets encrypted at rest. Session cookies contain random opaque IDs; only hashes of session IDs are stored in Neon.
- Keep migrations in repository files, test on a temporary Neon branch, inspect backfill counts and unresolved rows, then ask before applying to production. Migrations 004 and 005 are still pending on production and must be applied from the provided SQL script before the dependent GitHub-tool settings/run-snapshot path is treated as usable.
- **Acceptance:** migration tests pass on a temporary branch; existing records map deterministically; no duplicated Forge identity/workspace; no credentials exposed; rollback/recovery plan is documented.

### Auth Batch 2 — Session and identity linking
- Keep **Continue with GitHub** as the initial sign-in method, using the GitHub App's user authorization flow with state and PKCE.
- Separate Forge user from authentication-provider identities and repository connections. First sign-in provisions a Forge user; subsequent sign-in from an already-linked GitHub identity returns to that same Forge user.
- Add a safe explicit account-link flow for connecting a second GitHub identity to the signed-in Forge user. Require proof of control; never auto-link solely on matching email.
- Build the identity/provider interface so Google and email can later link to the same Forge user/session contract without redesigning repository access.
- **Acceptance:** sign-in, callback, session restoration, account linking, collision prevention, and error paths have automated tests.

### Auth Batch 3 — GitHub App installation and repository access
- Register the Brilina Forge GitHub App once for the product; each user or organization installs that same app and chooses all or selected repositories in GitHub.
- Model a GitHub account identity separately from app installation. A user may connect multiple personal accounts and organization installations.
- Support public/private repositories when the selected installation and user are authorized. The backend verifies installation scope and permissions for every operation; UI filters are not a security boundary.
- Decide per operation whether to use an installation token (app-led automation) or user access token (on behalf of the authenticated GitHub user). Never conflate the two.
- **Acceptance:** isolation tests prove one connected account/installation cannot read or modify another connection's unauthorized repository.

### Auth Batch 4 — Account UI and lifecycle
- Add an account menu with Forge identity, connected GitHub accounts, Connect another GitHub account, settings, and Sign out.
- Add account selector plus repository/branch context selector. Account changes load only the selected account's authorized installations/repositories and reject stale responses.
- Sign out revokes the Forge session and clears its cookie, but does not silently disconnect accounts or uninstall the GitHub App. Disconnect and uninstall/revocation are separate actions.
- Handle token refresh/expiry, revoked access, removed installations, and unavailable repositories with explicit recovery states.
- Bind each run to an immutable connection/installation + repository + branch snapshot. Switching accounts cannot redirect a running task.
- **Acceptance:** desktop/mobile account switching, logout, reconnection, revoked-installation handling, and in-flight context isolation pass automated and manual checks.

### Required execution order and dependencies
1. Complete schema/source inventory and write the migration design.
2. Apply and verify pending migrations 004 and 005 on production only after the owner runs the supplied SQL in Neon and reports the verification results; do not rerun them if already applied.
3. Implement additive identity/connection migrations on a temporary branch and verify backfills.
4. Implement server-side identity/session and explicit GitHub account linking.
5. Implement GitHub App installation/token resolution and per-operation authorization.
6. Implement account/repository selectors and lifecycle UI.
7. Re-run the GitHub tool system, immutable run context, and core AI-to-GitHub acceptance gates before depending on this architecture for further autonomous workflows.

**Security/rollout constraints:** do not expose tokens to browser storage; do not trust account/repository IDs supplied by the client without server-side ownership checks; do not automatically merge identities based on email; do not delete existing Forge history; do not deploy production or change production schema without explicit authorization and verified migration evidence.
