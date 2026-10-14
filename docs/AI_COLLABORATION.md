# AI Collaboration Handoff

This file coordinates **Kilo Code** and **ChatGPT** on Brilina Forge. The project owner makes final decisions. GitHub is the shared source of truth; ChatGPT cannot inspect Kilo's unpushed local changes.

## Read at every session start

1. [Next Kilo Prompt](NEXT_KILO_PROMPT.md) — the reusable prompt to give Kilo.
2. [Current State and Continuation Plan](CURRENT_STATE_AND_CONTINUATION.md) — evidence-based project status and next stages.
3. [Agent Handoff](AGENT_HANDOFF.md), [Architecture](ARCHITECTURE.md), [Decisions](DECISIONS.md), and [Roadmap](ROADMAP.md).
4. Inspect the actual source and tests relevant to the current task.

## Non-negotiable workflow

- After a model change, context compaction, restart, or long pause, inspect first; do not resume from a remembered assumption.
- Kilo's first action after a context reset is to report branch, HEAD SHA, working-tree status, recent commits, actual implementation/test evidence, documentation conflicts and a proposed next increment. **No edits until the owner approves.**
- Never repeat completed work without checking the repository first.
- Distinguish implemented in code, automated-tested, live-verified, partial, not implemented and blocked.
- Never claim a test passed unless it actually ran. Include exact commands and results.
- Before an implementation increment, state its goal, files, behavior, acceptance criteria, tests, risks and decisions needed.
- Work in small increments. Test, commit and push each reviewable checkpoint; then pause for review.
- Do not silently change architecture, auth, schema, permissions, command policy or execution boundaries.
- Do not overwrite or discard local uncommitted work.
- If ChatGPT directly changes repository files, it must identify the branch and commit SHA. Kilo must pull that branch before continuing.

## Handoff procedure

### Kilo → ChatGPT
1. Inspect status and preserve local changes.
2. Run relevant tests and record exact results.
3. Commit and push the checkpoint.
4. Update the current-state ledger with the checkpoint SHA and verified findings.
5. Report branch, SHA, summary, tests/results, known gaps and proposed next increment. Stop.

### ChatGPT → Kilo
1. Inspect the pushed code and relevant documentation.
2. Classify findings as confirmed defect, documentation conflict, recommendation or owner decision.
3. Make only isolated, safe repository edits; otherwise provide a reviewed plan.
4. Keep [Next Kilo Prompt](NEXT_KILO_PROMPT.md) current so the owner can resume after ChatGPT usage limits or a context reset.

## Current shared checkpoint

- **Branch:** `chatgpt/reconcile-project-state`
- **Latest documentation checkpoint:** `97413a33b69a401f0ff7b91ca1d01cfdc1409e89`
- **Status:** documentation reconciliation committed to this branch; runtime code has not been modified or tested in this checkpoint.
- **Next action:** owner reviews the reconciled docs, then Kilo performs the inspection-only report in `docs/NEXT_KILO_PROMPT.md`. Do not begin implementation before that report is reviewed and a small increment is approved.

## Review priorities

Run claim/dispatch/recovery, SSE reconnect and event replay, isolate-safe device identity, companion work ownership and result persistence, approval/resume, command policy, and honest documentation of tests and live verification.
