# Brilina Forge — requirements

## Functional

- Authenticate with GitHub through a GitHub App with user-level tokens.
- Identify the account and provision a workspace.
- Discover repositories, branches and repository context.
- Create conversations with a bound repository and branch.
- Persist conversations, messages and runs in Neon.
- Stream run events to the browser over SSE.
- Invoke a provider-neutral model through the Agent Controller.
- Expose typed GitHub read tools: `get_repository`, `get_repository_context`,
  `list_branches`, `get_tree`, `read_file`, `get_diff`.
- Run commands on the user's machine through a local companion.
- Classify commands into light, risky and blocked.
- Stream command output back to the browser.

## Non-functional

- GitHub is canonical for source; Neon is canonical for Forge state.
- The companion is disposable and holds no source.
- The backend owns orchestration; no coding-agent framework on the companion.
- The Agent Controller is provider-neutral; provider SDK code lives only in
  `src/ai/`.
- GitHub REST and GraphQL are hidden behind one `GithubService`.
- The model receives bounded, task-relevant context; never a complete repo dump.
- Sessions are durable in Neon; GitHub tokens are encrypted at rest.
- Application state survives restarts.
- Commands never run on the Forge server. There is no server-side shell, no VPS
  cost, and no browser terminal.

## Out of scope

- A server-side shell.
- A browser terminal.
- Multi-tenant sharing beyond the owner and a small trusted group.
- Any execution that costs money on infrastructure.
- A sandbox around the companion.

## Status

Phases 0 through 5 are complete in code. Phase 6 (local execution via the
companion) and Phase 7 (verification and hardening) are not started. Live
verification is outstanding.

## Verification limits

No live provider key, no GitHub OAuth app, and no Neon-backed end-to-end run
have been exercised. The companion, device verification, and the approval UI
have not been built.