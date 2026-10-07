# Phase 4 — Chat UI

## Status

Implemented in code. Browser acceptance has not been performed.

## Purpose

- establish the user-facing Forge workspace contract on top of the provider-neutral Agent Controller
- present run and tool activity clearly enough that a human can tell what the agent did
- keep the UI free of any dependency on a specific AI provider SDK

## Scope

- application shell, navigation, sign-in gate
- conversation list, creation and history
- repository and branch selection bound to GitHub
- run lifecycle presentation over SSE
- tool activity presentation keyed by provider `callId`
- branch comparison diff panel

## Completed

Backend:

- `AgentController` accepts an optional `AgentObserver` and emits `tool.requested`, `tool.started`, `tool.completed`, `tool.rejected` and `approval.required`, each carrying the provider `callId` (`src/agent/types.ts`, `src/agent/controller.ts`).
- The controller injects an "Active development context" system message built from the conversation's repository and branch, so the model knows what it is working on without a tool call.
- The controller records the assistant tool-call turn in context alongside the tool result, which keeps provider message protocols valid across steps.
- The observer is wired to the SSE `RunEventBus` in `src/server.ts`.
- Six GitHub read tools are registered (`src/agent/tools/github-read-context.ts`): `github.get_repository`, `github.get_repository_context`, `github.list_branches`, `github.get_tree`, `github.read_file`, `github.get_diff`. They deny when no repository is bound to the conversation.
- `Phase4DeterministicModel` issues a real tool call when a repository is bound and the message shows inspection intent, then summarizes the tool result instead of looping.
- `GET /api/session` plus `POST /auth/github/logout` support the sign-in gate.
- `GET /api/github/repos/:owner/:repo/compare` and `GET /api/github/repos/:owner/:repo/commits` back the diff panel (`GithubService.compareBranches` / `listCommits`).
- `RunEventBus` caps history at 500 events per run, supports `release(runId)` on completion, and `sweep(ttl)` (default 15 minutes, swept every 5 minutes).

Frontend:

- sign-in gate: unauthenticated visitors see a sign-in card instead of the workspace
- tool activity cards keyed by `callId`, with requested / running / completed / approval-required / rejected states and a reason line for rejections
- streaming cursor while `assistant.delta` events accumulate, committed to history on `assistant.completed`
- branch comparison diff panel showing ahead/behind counts, commits and per-file patches
- persistent conversation history loaded from Neon when reopening a chat
- repository and branch selectors with synchronization into Forge's repository table

## Out of scope

- real AI provider SDKs (Phase 5)
- execution and terminal integration (Phase 6, delivered separately)
- autonomous production coding
- an interactive approval/resume flow

## Acceptance

Automated: `src/agent/controller.observer.test.ts`, `src/phase4/model.test.ts`, `src/phase4/api.test.ts`, `src/security/http.test.ts`.

**Not accepted:** there is no automated UI test and no browser session has been driven through sign-in, run, tool activity, diff and terminal flows.

## Remaining work

- automated UI/API acceptance tests against the built frontend
- remove the hardcoded "Provider-neutral development mode" composer label, which is shown even when a live provider is active
- authenticated production serving and deployment verification
