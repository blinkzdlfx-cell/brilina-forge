# Brilina Forge — Testing and Verification

This file describes how to run checks and what they do not prove. Test counts are intentionally not copied into this document because they become stale; record the exact count and output in the checkpoint/current-state report each time the suite runs.

## Commands

Run from the repository root when dependencies and environment are available:

```bash
npm install
npm run build
npm test
npm run build:backend
npm run build:web
```

Check `package.json` before running commands; report the actual scripts and results from the checked-out commit. The CI workflow in `.github/workflows/ci.yml` is also part of the verification path. A passing local build does not prove the deployed Worker or its external integrations work.

## Phase 1 — real GitHub coding

The first end-to-end acceptance test must verify:
- GitHub authentication and repository permissions;
- repository and work-branch binding to the conversation;
- a real provider request and tool-call response;
- successful read of a relevant source file;
- safe GitHub file creation/update using the correct blob SHA;
- rejection of an unbound or wrong repository and unauthorized branch;
- handling of stale SHA/conflict and GitHub API failures;
- changed-file read-back and diff/commit reporting;
- persisted conversation/run/tool results after reload;
- no secret leakage in model context, logs, or browser output.

Use a repository and branch where the owner has explicitly authorized changes. Do not test destructive actions on production code.

## Phase 2 — verification and repair

Test:
- workflow dispatch/inspection and ownership checks;
- status, job/step information, and log retrieval;
- redaction and bounded log input;
- diagnosis of a deliberately failing check;
- bounded correction attempts;
- accurate final success/failure status;
- duplicate stream subscribers, reconnect, cancellation, timeout, failed runs, and recovery.

## Phase 3 — companion

Test device ownership/revocation, command classification, approval persistence, approve/reject resume exactly once, timeout, cancellation, output limits, redaction, duplicate work delivery, disconnected devices, process cleanup, and correct run/conversation association.

## Phase 4 — Cloudflare diagnostics

Test access scoping, supported log retrieval, filtering, secret/PII redaction, source/commit correlation, and a proposed fix verified without automatic production deployment.

## What automated tests do not prove

- Live GitHub App OAuth and real user permissions.
- Live AI provider availability, quotas, or tool-call behavior.
- Live Neon connection and complete browser-to-database workflow.
- Browser acceptance and production Worker routing.
- Cloudflare log permissions and production diagnostics.
- Local companion security or operating-system behavior.
- Team access boundaries in a multi-user environment.

## Verification language

Report each result as one of: **implemented in code**, **automated-tested**, **live-verified**, **partial**, **not implemented**, or **blocked**. Never state that a test passed unless it ran; include the exact command and result.