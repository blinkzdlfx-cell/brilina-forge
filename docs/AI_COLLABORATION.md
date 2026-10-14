# AI Collaboration Handoff

This file coordinates Kilo Code and ChatGPT on Brilina Forge. The project owner makes final decisions. GitHub is the shared source of truth; ChatGPT cannot inspect Kilo's unpushed local changes.

## Read at each session start

1. [Roadmap](ROADMAP.md)
2. [Current State and Continuation Plan](CURRENT_STATE_AND_CONTINUATION.md)
3. [Architecture](ARCHITECTURE.md) and [Requirements](REQUIREMENTS.md)
4. [Agent Handoff](AGENT_HANDOFF.md)
5. [Next Kilo Prompt](NEXT_KILO_PROMPT.md)

## Mandatory verification rule for every session and checkpoint

Before saying a task is done, deciding a feature works, checking off a roadmap item, or moving to another phase, verify both the code and the documentation:

- Inspect the actual implementation, runtime route, tool registration, authorization, external API call, persistence, and UI result for the behavior in question.
- Run relevant focused automated tests and build/type checks. Add tests when coverage is missing.
- For GitHub operations, verify the actual GitHub side effect (file contents, branch, commit, and diff), not merely that a tool call was attempted or the model returned success.
- Perform live/end-to-end verification when the acceptance criteria require it and access is available. If not possible, explicitly mark it blocked/unverified.
- Update the roadmap and current-state ledger only after the evidence is collected. Include SHA, files inspected/changed, exact commands/results, and live-check evidence.
- Documentation alone, code presence alone, a mock, a type/schema, a read-only success, or an AI claim never proves completion. Missing or failing evidence keeps the item open.

**Phase 1 is still in progress until the real AI GitHub file-writing flow passes end to end. Do not skip to Phase 2 while file writes fail.** An authorized non-default work-branch write must be confirmed in GitHub, read back, and shown as a reviewable diff/commit in the UI. Reading source files or issues is not a substitute for writing files.

## When the owner must perform a manual check

If verification requires the owner's browser/account/device, a live deployed UI, or a permission/consent step unavailable to Kilo, complete safe automated checks first and then pause at a checkpoint. Give the owner a test card containing the reason, exact URL/screen and safe work branch, numbered actions, expected result, what to report (PASS/FAIL and exact error; sanitized screenshot/details if useful), and safe stop instructions. Never ask for passwords, tokens, or secrets. Wait for the owner's response before recording owner-performed evidence or passing a gate. Label it **owner-reported manual verification**, not independently observed verification. If the owner cannot run it, leave the item blocked/unverified. Batch related checks and do not delegate checks that can safely be automated.

## Working protocol

- Inspect branch, HEAD SHA, and working-tree status before acting. Preserve uncommitted work.
- Work on the agreed current branch; do not create a new branch unless the owner explicitly asks.
- Kilo implements code; ChatGPT helps with architecture, scope, review, and sequencing.
- Work on one small increment at a time. State the goal, affected files, expected behavior, acceptance criteria, tests, risks, and decisions needed.
- Do not repeat work without inspecting current code.
- Distinguish implemented in code, automated-tested, live-verified, partial, not implemented, and blocked.
- Never claim a test passed unless it actually ran. Include exact commands and output.
- Do not silently change auth, database schema, permissions, execution boundaries, or command policy.
- Do not overwrite or discard local changes.
- Do not add mock data to make a feature look complete.
- After a checkpoint, record its SHA and actual verification evidence in the current-state document.

## Handoff: Kilo to ChatGPT

1. Report branch, SHA, working-tree status and changed files.
2. Run relevant tests and record exact commands/results.
3. Summarize the diff and any security or architecture decisions.
4. Update the current-state ledger and roadmap if the status changed.
5. Stop and report the next proposed increment.

## Handoff: ChatGPT to Kilo

1. Inspect the pushed code and documentation.
2. Separate confirmed defects from recommendations and owner decisions.
3. Provide one small implementation task or make a narrowly scoped documentation change.
4. Keep the next Kilo prompt current.

## Current shared checkpoint

The documentation reconciliation branch `chatgpt/reconcile-project-state` was fast-forwarded into `main` on 2026-10-14. Its changes were documentation-only. The roadmap is now organized around five product phases, with Phase 1 (real AI coding through GitHub) as the immediate priority. No application code or tests were changed/run by that documentation merge.

## Priority

Do not work on all phases simultaneously. First make a real model write a reviewable change to a selected GitHub work branch. Then add GitHub Actions verification, the companion, Cloudflare diagnostics, and finally team/provider expansion.