# Phase 6 — Execution

## Status

Complete **against a local worker**. The Google Cloud E2 adapter is not implemented.

## Purpose

Give the agent a place to run commands, with a policy boundary that cannot be bypassed by the agent, and an interactive terminal in the browser.

## Scope

- `ExecutionService` contract
- command classification policy
- disposable worker with session lifecycle and resource bounds
- HTTP routes and a WebSocket transport for the terminal
- terminal tools for the Agent Controller
- terminal UI

## Important naming note

Phase 6 delivers execution on a **local** worker. Earlier documentation claimed "E2 execution remains Phase 4", which was wrong — E2 was always Phase 6, and it is not implemented today. The worker implemented here is `LocalExecutionWorker` (`provider: "local-disposable"`) running on the Forge host. See ADR-016.

| Implemented | Not implemented |
|---|---|
| `ExecutionService` contract | Google Cloud E2 adapter |
| Command policy | VM provisioning and teardown |
| Session lifecycle, caps, LRU eviction | Workspace hydration from GitHub |
| HTTP routes, WebSocket transport | True PTY on all platforms |
| Four terminal tools | Durable session or log storage |
| Terminal UI | Interactive approval/resume |

## Module map

| File | Responsibility |
|---|---|
| `src/execution/types.ts` | `ExecutionService`, `TerminalSession`, `TerminalLogEntry`, `ExecResult`, `TerminalCommandClass` |
| `src/execution/command-policy.ts` | `classifyCommand` |
| `src/execution/local-worker.ts` | `LocalExecutionWorker`, `buildWorkerEnv` |
| `src/execution/socket.ts` | `registerTerminalSocket` |
| `src/agent/tools/terminal.ts` | Four terminal tools |

## Command policy

`classifyCommand` returns `safe`, `approval-required` or `blocked` with a human-readable reason.

Evaluation order:

1. Empty command → blocked
2. Longer than 2000 characters → blocked
3. Control characters → blocked
4. Chaining, substitution or redirection (`; & | \` > $( <<`, newline, carriage return) → blocked
5. Block list → blocked
6. Approval list → approval-required
7. Executable not on the read-only allow-list → approval-required
8. Otherwise → safe

Block list covers recursive deletes of `/`, `~` and glob targets, `mkfs`, raw device writes, power-state changes, `git push`, `git reset --hard`, destructive `git clean`, world-writable permission changes on system paths, `sudo`, `su -`, `npm publish`, history and system tampering, plus the Windows equivalents (`Remove-Item -Recurse/-Force`, `rmdir /s`, `format`, `Stop-Computer`, `Restart-Computer`, encoded PowerShell, `Invoke-Expression`/`iex`, `Set-ExecutionPolicy`, `reg add`).

Approval list covers dependency installation, repository mutation, outbound mutation, network fetches, container execution, process termination, long-running dev servers, interactive terminal programs, remote host access, and environment inspection.

The allow-list holds read-only inspection executables only. Anything unrecognised is approval-required, so the policy fails closed.

**Limitation:** this is regular-expression matching, not a shell parser. It raises the cost of a mistake and blocks known destructive shapes; it is not a sandbox.

## Local worker

- One shell-backed session per terminal session (`powershell.exe -NoLogo -NoProfile -NonInteractive -Command -` on Windows, `/bin/bash -i` elsewhere).
- Session directories resolve under the execution root (`EXECUTION_ROOT_DIR`, or a `brilina-forge-worker` directory in the system temp directory). Path segments are sanitized and containment is verified, so a crafted identifier cannot escape the root.
- `exec` writes the classified command followed by a random sentinel, captures output until the sentinel appears, waits a short quiet window for buffered output, then strips the marker and any echoed input.
- Log buffer capped at 256 KB per session; captured output capped at 32000 characters; `truncated` is reported.
- Timeout defaults to 120 s and is clamped to 600 s.
- One command per session at a time; a second returns 409.
- At most 8 sessions; creating a ninth evicts the oldest.
- `buildWorkerEnv` builds the child environment from an allow-list. `DATABASE_URL`, `GITHUB_CLIENT_SECRET`, `GITHUB_TOKEN_ENCRYPTION_KEY` and `AI_PROVIDER_API_KEY` are not present in a terminal session.
- Child processes and stdio are `unref`'d, and `dispose()` kills every session on shutdown.

`ExecutionService.write` exists in the contract but is not reachable from any route or socket message. It bypasses classification by design and is reserved for interactive owner input (ADR-015).

## Transports

| Route | Purpose |
|---|---|
| `GET /api/terminal/sessions` | List sessions in the workspace, optionally filtered by conversation |
| `POST /api/terminal/sessions` | Open a session for a conversation the caller owns |
| `GET /api/terminal/sessions/:sessionId` | Session state |
| `GET /api/terminal/sessions/:sessionId/output` | Buffered output window (`since`, `limit`) |
| `POST /api/terminal/sessions/:sessionId/exec` | Classify and run one command |
| `DELETE /api/terminal/sessions/:sessionId` | Kill the session |
| `GET /api/terminal/sessions/:sessionId/socket` | WebSocket transport |

Every route is scoped by workspace **and** `userId`, so a workspace member cannot read or drive another user's terminal.

WebSocket behaviour: `Origin` checked first (close 4403), then identity (close 4401), then session ownership (close 4403/4404). On success it sends `session.ready`, replays a backlog of the last 200 log entries, then streams live output. It pings every 20 seconds. The only accepted client message is `{ type: "exec", command }`, answered with `exec.completed`. There is no raw-stdin message.

## Terminal tools

| Tool | Policy | Notes |
|---|---|---|
| `terminal.create_session` | approval-required | Currently rejected by the controller |
| `terminal.exec` | approval-required | Currently rejected by the controller; output truncated to 8000 characters for the model |
| `terminal.read` | allowed | Last 200 entries, last 8000 characters |
| `terminal.kill` | approval-required | Currently rejected by the controller |

Because the controller rejects approval-required tools, only `terminal.read` is usable by a model today.

## Frontend

`web/src/TerminalPanel.tsx` opens and closes sessions, streams output over the WebSocket, submits commands over `POST .../exec`, and shows policy rejections inline.

## New dependencies

`@fastify/websocket`, `ws`, `@types/ws`.

## Acceptance

Automated: `src/execution/local-worker.test.ts`, `src/execution/socket.test.ts`, `src/execution/api.test.ts`.

**Not accepted:** no browser has driven a terminal session, and no live WebSocket session has been exercised through a real authenticated browser.

## Remaining work

- Google Cloud E2 adapter implementing `ExecutionService`
- workspace hydration from GitHub into the worker directory
- true PTY support
- durable session and log storage
- interactive approval/resume so `approval-required` becomes a decision rather than a rejection
- decide whether the local worker stays development-only behind a flag or is removed
