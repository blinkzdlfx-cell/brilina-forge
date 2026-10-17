# Brilina Forge GitHub Tool System

**Status:** implementation contract and live inventory; update this file whenever a GitHub capability is added, changed, or retired.

## Architecture

`AgentController → ToolRegistry → immutable tool catalog / user availability → mandatory server-side authorization → GithubService → GithubClient → GitHub REST or GraphQL`

- **Catalog:** stable Forge-owned tool IDs, descriptions, categories, risk, and implementation status. The upstream GitHub MCP catalog is a reference, not a runtime dependency.
- **Availability preferences:** users may disable individual tools or categories from the workspace sidebar's persistent **Settings** entry. Preferences are persisted per Forge user in Neon and only reduce the set of tools offered to the model; they never grant permissions. The API sanitizes preferences against the server catalog.
- **Mandatory policy:** repository and branch scope, argument validation, allowed operation, and write verification are enforced server-side on every call. UI settings, model instructions, and tool arguments cannot disable this layer.
- **API layer:** reuse `GithubService` / `GithubClient`; preserve GraphQL for repository identity/default-branch metadata and REST for branches, trees/files, comparisons, commits, branch creation, and writes unless later evidence requires a change.
- **Run context:** each run snapshots repository and branch into the `runs` row at creation. A later UI context change must not retarget a queued/running run. The additive migration is `db/migrations/005_run_context_snapshot.sql`.
- **Rollout:** retain existing tools and paths until replacements pass automated tests and live acceptance. Never represent a tool as verified solely because it is registered.

## Reference inventory: upstream GitHub MCP discovery

The earlier live MCP probe returned 46 tools. Forge is not to import or proxy that server at runtime. The exact upstream 46-name discovery payload must be preserved in the project evidence/source before assigning a definitive one-to-one upstream tool ID; this document deliberately does not invent names from memory. Until that payload is committed, the mappings below are **capability-level mappings**, not claims that an exact upstream name was verified.

Status meanings:
- **Adopted equivalent** — Forge already has a native implementation for this capability.
- **Extend** — partial coverage exists; additional hardening or result shape is needed.
- **Deferred** — no Forge production tool; add only when a real workflow requires it.
- **Excluded** — not appropriate for autonomous coding runs or intentionally outside current product scope.

## Forge tool catalog (source-verified)

| Forge tool ID | Observed upstream MCP reference | Capability | Category | Risk | Status / notes |
|---|---|---|---|---|
| `github.get_repository` | No direct mapping established | Read repository metadata | repository-read | read | Adopted equivalent; conversation-repository scope required |
| `github.get_repository_context` | Forge-native aggregation | Aggregate repository identity, default branch, branches, and tree | repository-read | read | Adopted equivalent; repository is taken from the run principal |
| `github.list_branches` | `list_branches` | List branches | branch-read | read | Adopted equivalent |
| `github.get_tree` | No direct mapping established | Read repository tree at a ref | file-read | read | Adopted equivalent |
| `github.read_file` | `get_file_contents` | Read file contents at a ref | file-read | read | Adopted equivalent |
| `github.get_diff` | Forge-native REST compare | Compare two refs / summarize changed files | diff-review | read | Adopted equivalent |
| `github.create_work_branch` | `create_branch` | Create a working branch | branch-write | write | Adopted equivalent; branch creation must remain scoped to selected repo/base |
| `github.create_file` | Partial file-write overlap; no exact one-to-one mapping recorded | Create file and commit on working branch | file-write | write | Adopted equivalent; reads back content after write |
| `github.update_file` | Partial file-write overlap; no exact one-to-one mapping recorded | Replace file and commit on working branch | file-write | write | Adopted equivalent; reads back content after write |
| `github.write_file` | Partial file-write overlap; no exact one-to-one mapping recorded | Create-or-update file and commit on working branch | file-write | write | Adopted equivalent; overlapping semantics with create/update should be rationalized after regression evidence, not removed blindly |
| `github.push_files` | `push_files` | Atomic multi-file commit on one working branch | file-write | write | Adopted equivalent; verifies every file after the commit |
| Companion execution tool | Not an upstream GitHub MCP tool | Dispatch approved local companion work | local-execution | high | Existing non-GitHub capability; keep separate from GitHub catalog and enforce its own policy |

## Mandatory security invariants

1. Every tool call is validated against its schema and server-side policy.
2. Repository tools must match the repository bound to the run.
3. Writes are limited to the run's selected working branch or a branch created during that run. Default-branch writes are denied by policy, not merely hidden in the UI.
4. Branch and file path inputs are validated before API calls.
5. A write is not reported as verified until Forge reads back the target content and checks it against the requested content.
6. GitHub API credentials remain server-side; logs must not expose tokens, private file contents, or other secrets.
7. User preferences can disable tools but cannot enable a tool blocked by mandatory policy, bypass repository/branch scope, or remove authorization checks.
8. Disabled tools are omitted from the model's advertised tool list and rejected by the controller if the model attempts to call one.
9. A run's repository and branch are immutable snapshots. Context changes only affect a subsequent run.
10. Merge, production deploy, and other high-impact actions remain outside automatic execution unless a separately reviewed approval workflow is implemented.

## Tool categories and initial defaults

| Category | Default | Reason |
|---|---|---|
| repository-read | enabled | Needed to understand the selected project |
| branch-read | enabled | Needed to inspect available branches |
| file-read | enabled | Needed for grounded code changes |
| diff-review | enabled | Needed to review real changes |
| branch-write | enabled | Needed to create isolated work branches, subject to server policy |
| file-write | enabled | Needed for core coding workflow, subject to server policy and read-back verification |
| issue-management | disabled / not implemented | Not required for the core coding loop; requires additional permissions and a real workflow |
| pull-request-management | disabled / not implemented | Add only with explicit review/approval boundaries |
| actions-and-checks | disabled / not implemented | CI visibility is a later dependency; no unverified placeholder tools |
| releases-and-deployments | excluded from autonomous default | High-impact operations need a distinct authorization and approval design |
| security-administration | excluded | Never expose permission/installation administration as model-controlled tools |

These are the initial product defaults. The settings UI and authenticated API are implemented in source; apply `db/migrations/004_github_tool_preferences.sql` before using them against Neon. Apply migration `005` for immutable run context. Database migrations have not been applied by this code-editing session.

## Change log

- 2026-10-17 — Established the Forge-owned inventory and policy contract. Source-verified the ten GitHub tool IDs above in `src/agent/tools/github-read-context.ts` and `src/agent/tools/github-write-tools.ts`. Added the initial availability catalog and registry filtering; uncatalogued `github.*` tools fail closed. Added a server-side check against GitHub's current default-branch metadata to reject file writes to the default branch, including when it is selected in the UI. Automated CI verification is still pending.
- 2026-10-17 — Added per-user preference persistence (`src/db/github-tool-preferences.ts`), authenticated GET/PUT settings endpoints, and the workspace sidebar Settings dialog with category and individual tool controls. Added migrations `004_github_tool_preferences.sql` and `005_run_context_snapshot.sql`, and bound Worker execution to the run's creation-time repository/branch snapshot.
- 2026-10-17 — Removed the official GitHub MCP diagnostic/probe endpoints from the production Worker; native Forge tools remain the execution path. The diagnostic module and its isolated tests remain as historical/reference code but are no longer imported by the Worker.
- Still open: exact original 46-name MCP snapshot was not preserved in available conversation evidence; do not fabricate it. Automated CI/build verification, applying the two additive migrations, and live non-default-branch write/read-back/diff acceptance remain outstanding.
