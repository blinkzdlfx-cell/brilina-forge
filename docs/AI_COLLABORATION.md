# AI Collaboration Handoff

This file is the shared coordination point for **Kilo Code** and **ChatGPT** on Brilina Forge. Read it at the start of each handoff and update it when a review checkpoint is reached.

## Working Agreement

- The project owner is the final decision-maker. Do not make significant architectural changes silently.
- GitHub is the shared source of truth. ChatGPT cannot see Kilo's unpushed local work; push reviewable checkpoints so both can inspect the same code.
- Keep this file short. Put detailed technical decisions in the appropriate architecture/decision documents.
- Never claim a test passed unless it was actually run. Clearly separate implemented, tested, planned, blocked, and superseded work.
- Before starting substantial implementation, state the goal, approach, affected files, risks, acceptance criteria, and unresolved decisions.
- Work in small, reviewable increments. At a checkpoint, report the branch, commit SHA, summary, tests run and results, and known gaps. Then pause for review before the next major phase.

## Handoff Procedure

### Kilo Code → ChatGPT

1. Finish the current safe checkpoint and save all intended changes.
2. Commit and push the checkpoint to GitHub.
3. Pull/fetch the latest shared branch before continuing, especially if another contributor has updated it.
4. Update the **Latest Kilo Checkpoint** section below with the branch, SHA, summary, tests, and questions.
5. Stop before the next major phase so ChatGPT can review the pushed code against the plan and project decisions.

### ChatGPT → Kilo Code

1. Read the latest pushed code, this file, and relevant project documentation before making recommendations.
2. Record concise review findings under **Latest ChatGPT Review**: approved items, issues to fix, recommended improvements, and decisions that require the owner's input.
3. Do not directly overwrite Kilo's active/unpushed work. Make repository edits only when they are clearly isolated and safe, and tell Kilo what changed and the commit SHA.
4. Kilo should read the review, discuss any disagreement or uncertainty with the owner, then implement approved changes and push a new checkpoint.

## Latest Kilo Checkpoint

- **Status:** Awaiting Kilo's next pushed checkpoint.
- **Branch / commit:** Not yet recorded.
- **Summary:** Kilo should update this section after pushing.
- **Tests and results:** Record exact commands and outcomes; state clearly if tests were not run.
- **Questions / known gaps:** List unresolved issues and anything needing owner approval.

## Latest ChatGPT Review

- **Status:** Waiting for the next Kilo checkpoint to review.
- **Review of code:** Pending; do not treat this as an approval of uninspected changes.
- **Findings:** To be added after reviewing a specific pushed commit.
- **Owner decisions needed:** Record only concrete decisions that cannot safely be inferred from existing requirements or decisions.

## Current Review Priority

Review the reliability of run execution and recovery, the local Node.js companion's safe command/process lifecycle, durable and replayable run events, cancellation and retry behavior, duplicate-dispatch protection, and consistency between code and documentation. Treat these as review priorities, not permission to redesign the architecture without presenting the plan to the owner first.
