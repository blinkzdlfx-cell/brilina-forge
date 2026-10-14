# Brilina Forge — Phase 1 read-only hardening

**Status of the read-only hardening sub-scope:** completed in code on 2026-09-22, subject to current live verification.  
**Status of the full Phase 1 AI coding workflow:** **OPEN / NOT COMPLETE**.

This document originally described the authentication and read-only GitHub foundation. It must not be interpreted as evidence that AI-driven GitHub writes work.

## Read-only foundation

The original hardening scope covered:

- GitHub App authorization flow with PKCE
- account identification and workspace provisioning
- repository discovery and branch listing
- repository context retrieval
- file reads through the read-only GitHub interface
- expiring authorization handling
- malformed request handling

The source code contains the foundation for these behaviors, but live OAuth, production persistence, and browser acceptance must be verified before they are described as live-verified.

## Full Phase 1: usable AI coding through GitHub

**Outcome:** From the existing web UI, the user can ask a real model to make a useful, reviewable code change in a selected GitHub repository without needing the local companion.

Source inspection on 2026-10-14 found placeholder write implementations and missing registration. Draft PR #7 now implements `github.create_work_branch`, `github.create_file`, `github.update_file`, and `github.write_file`, and includes them in the tool factory used by the Worker execution path. The implementation is still **pending targeted type-checks, automated tests, merge/deploy, and live acceptance**; do not treat it as production-verified.

### Required scope

1. Verify GitHub sign-in, repository/branch selection, conversation context, Neon persistence, and the real AI provider path.
2. Configure one real provider first. Cloudflare Workers AI can be used through the existing OpenAI-compatible adapter when a supported tool-calling model is configured. Other providers are deferred until Phase 1 works.
3. Implement and register controlled GitHub write operations:
   - create a working branch when appropriate, or use a clearly selected existing work branch;
   - create or update a file with GitHub's current blob SHA;
   - apply multiple related file changes safely and sequentially;
   - read back the changed files and produce a diff;
   - commit changes with a clear message;
   - expose the resulting branch/commit and review link to the UI.
4. Scope repository access to the repository bound to the conversation and the signed-in user's GitHub permissions.
5. Add tool schemas, input validation, authorization, audit events, bounded output, and clear failure handling.
6. Never silently write to the default branch.
7. Update the UI to show activity, changed files, diff, success/failure, and next action.
8. Ensure the model receives only relevant files and tool results, not the entire repository by default.
9. End-to-end test a small real change using an authorized repository.
10. Persist conversation/run/tool results after reload.
11. Confirm the model wrote a real GitHub file change and the diff/commit can be reviewed in GitHub.

For setup instructions, see [Phase 1 Setup and User Guide](PHASE_1_SETUP_AND_USER_GUIDE.md).

## Mandatory gate

**Phase 1 is not complete and Phase 2 must not start** until the real AI-to-GitHub write path succeeds on an authorized non-default work branch: the tool call creates or updates a file, GitHub confirms the change, the file is read back, and the UI presents a reviewable diff plus branch/commit details. Reading files or creating tool definitions does not prove writing works.
