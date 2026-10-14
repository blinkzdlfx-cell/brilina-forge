# Next Kilo Prompt — Brilina Forge Phase 1

Use this prompt in Kilo Code after pulling the latest `main`. The goal is to make the existing Forge UI usable for real AI-assisted code changes through GitHub. Do not begin the local companion yet.

---

You are working on Brilina Forge. The owner uses Kilo Code for implementation and ChatGPT for architecture orchestration. GitHub is the source of truth. The app is hosted as a native Cloudflare Worker serving the React static site and API; Neon remains the database.

## Read first

1. `README.md`
2. `docs/ROADMAP.md`
3. `docs/CURRENT_STATE_AND_CONTINUATION.md`
4. `docs/ARCHITECTURE.md`
5. `docs/REQUIREMENTS.md`
6. `docs/AI_COLLABORATION.md`
7. Relevant implementation and test files.

## Mandatory verification rule — do not infer completion from docs

Every time you assess whether a feature or phase is complete, verify BOTH the implementation and the documentation. Inspect the actual source path and registered tool, run focused tests/build checks, and perform a real integration check where possible. A roadmap checkbox, status label, prompt, type/schema, mock, or successful read operation is not proof that a write operation works. Update status documents only after collecting evidence. Record exact files, commit SHA, commands/results, and live-check evidence. If a required check fails or cannot be run, mark the feature partial/blocked/unverified and keep the phase open.

**Phase 1 hard gate:** do not proceed to Phase 2 until an actual AI tool call successfully creates or updates a file in an authorized GitHub non-default work branch, reads the file back, and exposes a reviewable diff and commit/branch details in the UI. Inspect the GitHub repository itself to confirm the result. Reading files, reading issues, generating suggested code, or documentation-only changes do not pass this gate. If writing currently fails, debug and fix the Phase 1 write path; do not skip ahead.

## First response: inspect and report

Before editing:
- Confirm branch, HEAD SHA, and `git status`; preserve all local work.
- Inspect the real GitHub OAuth -> repository/branch -> conversation -> AI run path.
- Inspect the tool registry, GitHub service, AI provider adapter, run persistence, and UI diff/result handling.
- Identify the smallest Phase 1 coding path and missing pieces with exact file paths.
- Run available build/tests if the environment permits; give exact commands and results.
- Distinguish implemented, automated-tested, live-verified, partial, and unverified behavior.
- Do not assume that a configured provider key proves tool calling works.
- Do not change architecture or start the companion during this inspection.

## Phase 1 implementation target

After the inspection report, implement one small, reviewable increment at a time, starting with the missing GitHub write-tool contract. The complete Phase 1 path must eventually support:

1. One real configured AI provider, verified against the actual provider API.
2. Repository context bound to the authenticated user and selected repository/branch.
3. Typed create/update-file tools that use GitHub's current blob SHA and handle stale-SHA conflicts.
4. Branch-scoped changes; never silently write to the default branch.
5. Safe sequencing for multiple file updates, path/input validation, bounded file/output sizes, audit events, and clear errors.
6. Read-back and diff generation so the model and user can inspect what changed.
7. UI feedback for tool activity, changed files, commit/branch, and failure states.
8. An end-to-end test for a small real change using a repository where the owner has authorized access.

Before coding, report the exact files, goal, tests, risks, and acceptance criteria for the first increment. Wait for owner approval if a schema, authentication, permissions, production execution, or major architecture decision is required.

## Constraints

- Keep the native Worker runtime; do not add new behavior to legacy Fastify routes.
- Keep Neon; no D1 migration.
- Do not create a new branch for this task unless the owner asks. Work on the agreed current branch and commit small checkpoints.
- Do not overwrite local changes.
- Do not add mock data to simulate successful GitHub writes or AI calls.
- Do not run shell commands in the Worker or build a browser terminal.
- Do not start implementing the companion, Cloudflare log integration, multiple providers, or team features before Phase 1 acceptance passes.
- Never commit secrets or expose tokens to the browser/model.
- Do not auto-merge code or deploy production changes.
- Run relevant tests and report actual results; do not claim success based only on source inspection.

## Required completion report

- Branch and SHA
- Changed files and behavior
- Tests run and exact results
- Live checks actually completed
- Known gaps/risks
- Evidence that the model wrote a real GitHub file change and the diff/commit can be reviewed
- Recommended next single increment

Stop after one increment and wait for review.