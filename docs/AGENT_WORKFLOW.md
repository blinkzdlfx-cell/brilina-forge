# Brilina Forge — AI Agent Workflow

**Purpose:** shared execution contract for Kilo Code and other coding agents, with ChatGPT coordinating architecture, scope, review, and acceptance.  
**Authority:** the project owner makes final decisions. PRODUCT_SPEC.md defines what to build; IMPLEMENTATION_PLAN.md defines the current batch and acceptance gate; this file defines how to work.

## 1. Session start
Read in this order:
1. `README.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/IMPLEMENTATION_PLAN.md`
4. `docs/AGENT_WORKFLOW.md`
5. The current batch's relevant source, tests, migrations, and supporting technical references.

Inspect the actual local repository before editing:
- Confirm repository and remote, branch, HEAD SHA, and `git status`.
- Preserve all uncommitted changes. Never reset, clean, overwrite, or discard them.
- Compare local HEAD with GitHub `main`; fetch/pull the agreed current state safely before coding.
- Check package scripts and lockfile before choosing commands or installing dependencies.
- If source/CI evidence conflicts with stale docs, report and reconcile the discrepancy.

## 2. Role boundaries
- **Kilo Code:** main implementation, focused tests, fixes, diff review, and approved commit/push.
- **ChatGPT:** plan and scope coordination, review of pushed source/diffs/evidence, defect/risk identification, next-increment recommendation.
- **Owner:** product/architecture decisions, required account/device/browser consent, and final acceptance.

GitHub is the shared source of truth. ChatGPT cannot see Kilo's unpushed local changes; push a checkpoint before remote review.

## 3. Scope and implementation discipline
Before editing, report current branch/SHA, goal, likely files/areas, acceptance criteria/tests, risks/dependencies, and any owner decision required. Implement related work together as one coherent, bounded batch. Do not start future batches early or make unrelated refactors.

Approved architecture constraints:
- React/Vite frontend.
- Tailwind CSS + shadcn/ui for the modernized UI.
- Native Cloudflare Worker + Workers Static Assets for hosted app/API.
- Neon Postgres remains primary Forge database; no D1 migration.
- GitHub remains canonical code state; preserve current REST/GraphQL service split unless evidence requires change.
- Forge's own catalogued GitHub tools are the production execution path; the official GitHub MCP tool list is a reference inventory, not a production runtime dependency. Track adopted/deferred capabilities in `docs/GITHUB_TOOL_SYSTEM.md`.
- Tool/category preferences may disable tools but cannot bypass mandatory server-side authorization. Uncatalogued `github.*` tools fail closed, and GitHub writes to the repository default branch are prohibited even when it is selected.
- Provider-neutral adapter and typed controller/tool/policy boundaries.
- For AI streaming/search/context work, read docs/AI_PIPELINE_REQUIREMENTS.md. Preserve the existing owner-confirmed working Tavily integration; trace its actual request path rather than concluding it is absent from a text search. Implement only the next unaccepted pipeline batch in docs/IMPLEMENTATION_PLAN.md.
- No shell in Worker and no browser terminal.
- No automatic merge or production deployment.
- No mock data pretending a real integration worked.

Avoid duplicate component systems, unnecessary dependencies, speculative abstractions, and unused components. Global CSS is limited to framework directives, theme tokens, and genuinely global rules. Keep credentials server-side and redact secrets/PII.

## 4. UI component approval rule
1. Inspect package versions, Vite/TypeScript aliases, scripts, CSS, and lockfile.
2. Select Tailwind/shadcn setup compatible with actual installed versions and current setup guidance; do not copy stale configuration blindly.
3. Add dependency/config changes and verify build before migrating screens.
4. Build a compact set of foundational components needed by real screens.
5. Test keyboard access, focus, disabled/loading/error states, responsive behavior, and theme consistency.
6. Present the component review/demo and wait for owner approval before treating components as mandatory patterns for subsequent agents.
7. Do not preserve unapproved styling at the expense of progress, but preserve and retest useful workflows.

## 5. Verification requirements
- Inspect the real implementation/execution path, not just documentation or a type/schema.
- Add/update tests where coverage is missing.
- Run relevant focused tests, typecheck/build, and security checks. Run broader tests/CI where practical and report unrelated legacy failures transparently.
- For GitHub writes, verify actual branch, file content, commit, read-back, and diff—not merely that a tool call was attempted.
- For AI, confirm the real configured provider was used; a deterministic development provider is not live AI verification.
- For database changes, use versioned migrations and test against the supported PostgreSQL/Neon setup.
- Verify deployed behavior when access permits; otherwise mark blocked/unverified.
- Inspect the final diff for unintended changes, secrets, generated artifacts, broken imports, and architecture drift.

Never claim a test passed unless it ran. Record exact commands and results.

## 6. Owner manual acceptance
Run all safe automated checks first. If the owner must test:
- Pause at the batch gate.
- Give one consolidated test card: why owner access is needed, exact starting URL/screen, safe repository/branch, numbered steps, expected results, PASS/FAIL response, and safe-stop instructions.
- Never ask for passwords, tokens, recovery codes, or secrets.
- Wait for the owner's result before recording owner-reported verification or advancing a dependent gate.
- Distinguish owner-reported verification from independently observed live verification.
- If the owner cannot test, keep the gate blocked/unverified.

## 7. Commit and handoff
Unless the owner changes the agreement, work directly on `main`; do not create a branch or PR by default. Do not deploy production or make destructive database changes without explicit authorization.

At batch end, report:
- Repository, branch, starting SHA, final SHA.
- Summary of behavior and exact files changed.
- Commands run and actual results.
- CI run links/status when available.
- Live checks performed and who performed them.
- Known gaps, risks, failed/unrun checks.
- Acceptance gate status and next proposed batch.

Update IMPLEMENTATION_PLAN.md only after collecting evidence. Do not mark a batch accepted based on code presence or a passing build alone. If anything fails, fix and retest the same batch. Stop after the agreed batch and wait for review/owner acceptance.

## 8. Kilo Code task frame
> Work on Brilina Forge. Read README.md, docs/PRODUCT_SPEC.md, docs/IMPLEMENTATION_PLAN.md, and docs/AGENT_WORKFLOW.md. Inspect actual branch, HEAD SHA, and working tree; preserve local changes. Identify the current unaccepted batch in IMPLEMENTATION_PLAN.md. Before editing, report goal, files/areas, acceptance criteria, tests, risks, and any owner decision required. Implement only that batch as a coherent unit. Run relevant tests/typecheck/build/security checks, fix failures and retest, inspect the final diff, and commit/push to the agreed branch (normally main). Record exact SHA, files, commands/results, CI evidence, live checks, and gaps in IMPLEMENTATION_PLAN.md. If owner testing is required, stop and provide one concise test card. Do not begin another batch or claim acceptance without evidence.
