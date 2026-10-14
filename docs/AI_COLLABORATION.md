# AI Collaboration Handoff

This file coordinates Kilo Code and ChatGPT on Brilina Forge. The project owner makes final decisions. GitHub is the shared source of truth; ChatGPT cannot inspect Kilo's unpushed local changes.

## Read at each session start

1. [Roadmap](ROADMAP.md)
2. [Current State and Continuation Plan](CURRENT_STATE_AND_CONTINUATION.md)
3. [Architecture](ARCHITECTURE.md) and [Requirements](REQUIREMENTS.md)
4. [Agent Handoff](AGENT_HANDOFF.md)
5. [Next Kilo Prompt](NEXT_KILO_PROMPT.md)

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