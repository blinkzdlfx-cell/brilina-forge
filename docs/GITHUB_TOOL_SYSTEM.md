# Brilina Forge GitHub Tool System

**Status:** implementation contract and live inventory; update this file whenever a GitHub capability is added, changed, or retired.

## Architecture

`AgentController → ToolRegistry → immutable tool catalog / user availability → mandatory server-side authorization → GithubService → GithubClient → GitHub REST or GraphQL`

- **Catalog:** stable Forge-owned tool IDs, descriptions, categories, risk, and implementation status. The upstream GitHub MCP catalog is a reference, not a runtime dependency.
- **Availability preferences:** users may disable individual tools or categories. Preferences only reduce the set of tools offered to the model; they never grant permissions.
- **Mandatory policy:** repository and branch scope, argument validation, allowed operation, and write verification are enforced server-side on every call. UI settings, model instructions, and tool arguments cannot disable this layer.
- **API layer:** reuse `GithubService` / `GithubClient`; preserve GraphQL for repository identity/default-branch metadata and REST for branches, trees/files, comparisons, commits, branch creation, and writes unless later evidence requires a change.
- **Run context:** bind each run to its repository/branch snapshot. A later UI context change must not retarget a running run.
- **Rollout:** retain existing tools and paths until replacements pass automated tests and live acceptance. Never represent a tool as verified solely because it is registered.

## Reference inventory: upstream GitHub MCP discovery

The earlier live MCP probe returned 46 tools. Forge is not to import or proxy that server at runtime. The exact upstream 46-name discovery payload must be preserved in the project evidence/source before assigning a definitive one-to-one upstream tool ID; this document deliberately does not invent names from memory. Until that payload is committed, the mappings below are **capability-level mappings**, not claims that an exact upstream name was verified.

Status meanings:
- **Adopted equivalent** — Forge already has a native implementation for this capability.
- **Extend** — partial coverage exists; additional hardening or result shape is needed.
- **Deferred** — no Forge production tool; add only when a real workflow requires it.
- **Excluded** — not appropriate for autonomous coding runs or intentionally outside current product scope.

## Forge tool catalog (source-verified)

| Forge tool ID | Capability / equivalent from the reference catalog | Category | Risk | Status / notes |
|---|---|---|---|---|
| `github.get_repository` | Read repository metadata | repository-read | read | Adopted equivalent; conversation-repository scope required |
| `github.get_repository_context` | Aggregate repository identity, default branch, branches, and tree | repository-read | read | Adopted equivalent; repository is taken from the run principal |
| `github.list_branches` | List branches | branch-read | read | Adopted equivalent |
| `github.get_tree` | Read repository tree at a ref | file-read | read | Adopted equivalent |
| `github.read_file` | Read file contents at a ref | file-read | read | Adopted equivalent |
| `github.get_diff` | Compare two refs / summarize changed files | diff-review | read | Adopted equivalent |
| `github.create_work_branch` | Create a working branch | branch-write | write | Adopted equivalent; branch creation must remain scoped to selected repo/base |
| `github.create_file` | Create file and commit on working branch | file-write | write | Adopted equivalent; reads back content after write |
| `github.update_file` | Replace file and commit on working branch | file-write | write | Adopted equivalent; reads back content after write |
| `github.write_file` | Create-or-update file and commit on working branch | file-write | write | Adopted equivalent; overlapping semantics with create/update should be rationalized after regression evidence, not removed blindly |
| Companion execution tool | Dispatch approved local companion work | local-execution | high | Existing non-GitHub capability; keep separate from GitHub catalog and enforce its own policy |

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

These are initial product defaults, not a claim that persistent user settings or the settings screen are complete. Track those implementation states in `docs/IMPLEMENTATION_PLAN.md`.

## Change log

- 2026-10-17 — Established the Forge-owned inventory and policy contract. Source-verified the ten GitHub tool IDs above in `src/agent/tools/github-read-context.ts` and `src/agent/tools/github-write-tools.ts`. The live upstream tool-name snapshot and persistent user preferences remain explicit implementation tasks; no exact upstream names have been guessed.
