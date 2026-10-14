# Brilina Forge — Phase 1 hardening

Status: **complete**

Accepted on 2026-09-22.

## Completed

- GitHub App authorization flow with PKCE
- account identification and workspace provisioning
- repository discovery and branch listing
- repository context retrieval
- file reads through the read-only GitHub interface
- expiring authorization handling
- malformed request handling

## Acceptance

> Forge can authenticate, identify the account, discover repositories, inspect
> branches, retrieve repository context and read files while handling expiring
> authorization and malformed requests safely.

## Notes

- The Phase 1 hardening (read-only capabilities, authentication, repository discovery,
  and file read operations) is complete.
- **GitHub write tools** (create, update, commit with blob SHAs, scoped to conversation
  repository, and diff/commit presentation) have been implemented and are ready for
  Phase 1 verification.

## Known engineering risks to keep visible

- ...

## Current priority: Phase 1 — usable AI coding through GitHub (NOW)

**Outcome:** From the existing web UI, the user can ask a real model to make a useful, reviewable code change in a selected GitHub repository without needing the local companion.

### Scope

1. Verify GitHub sign-in, repository/branch selection, conversation context, Neon persistence, and the real AI provider path.
2. Configure one real provider first. Keep the provider boundary extensible; do not integrate every provider yet.
3. Expand the GitHub service and agent tool registry with controlled write operations:
   - create a working branch when appropriate, or use a clearly selected existing work branch;
   - create or update a file with GitHub's current blob SHA;
   - apply multiple related file changes safely and sequentially;
   - read back the changed files and produce a diff;
   - commit changes with a clear message;
   - expose the resulting branch/commit and review link to the UI.
4. Keep repository access scoped to the repository bound to the conversation and to the signed-in user's GitHub permissions.
5. Add tool schemas, input validation, authorization, audit events, bounded output, and clear failure handling.
6. Require explicit confirmation for consequential write actions as appropriate. Never silently push to the default branch.
7. Update the UI to show the plan/activity, changed files, diff, success/failure, and next action.
8. Ensure the model receives only relevant files and tool results, not the entire repository by default.
9. End-to-end test for a small real change using a repository where the owner has authorized access.
10. Persist conversation/run/tool results after reload.
11. Confirm the model wrote a real GitHub file change and the diff/commit can be reviewed in GitHub.

## Gate

**Phase 1 gate is mandatory:** if the actual GitHub file write fails or is unverified, Phase 1 is not complete and Phase 2 must not start. Continue debugging the Phase 1 write path; do not skip ahead.