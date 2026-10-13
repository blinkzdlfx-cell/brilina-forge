# Plan — Local Execution via the User's Machine

## Decision

Execution leaves the server. There is **no server-side shell, no browser terminal, and no VPS cost**. The AI's commands run on the user's own computer through a small local companion. GitHub stays the source of truth; the browser stays the interface.

## Architecture

```
Browser (React)
   |
   v
Forge server (Fastify + Neon)        <-- no execution, no child_process
   |-- authentication, conversations, runs, GitHub reads
   |-- Agent Controller
   |-- typed tools
   |-- AI provider adapter
   |
   v
Local companion (Node, on the user's machine)
   |-- runs cmd / powershell
   |-- streams output back to the browser over SSE
   |-- holds the device identity and the per-machine approval store
```

The companion is **not always running**. It starts only when a command actually needs to execute — never when the AI is just planning.

## The three paths

| Situation | What happens |
|---|---|
| Planning, no command needed | AI works entirely in the browser. No companion. |
| Light command (read-only allow-list) | Companion starts, device is verified, command runs, output streams back. No user prompt. |
| Risky command (writes, installs, network, git commit/push, destructive) | Companion starts, device is verified, **user is prompted to approve**, then it runs. |

On a phone or a machine with no companion: the AI keeps iterating using logs and verification output, and hands the user the result to apply on their computer.

## Command acceptance model

Two lists, already implemented in `src/execution/command-policy.ts`:

**Light — runs automatically** (read-only inspection):
`ls`, `cat`, `grep`, `git status`, `node --version`, `npm test`, `cat package.json`, `rg pattern`, `du`, `df`, `find`, `head`, `tail`, `wc`, `diff`, `echo`, `pwd`, `uname`, `whoami`, `which`, `date`, `true`, `false`, `test`, `sort`, `uniq`, `cut`, `jq`, `sed`, `awk`, `env` (inspection only).

**Risky — requires consent**:
Anything not on the light list: file writes, `npm install`/`pnpm`/`pip`, `git commit`/`git push`, `docker`, `curl`/`wget`, `npm run dev` (long-running servers), `ssh`, `vim`/`nano` (interactive), `kill`/`pkill`, `env` (full dump), and any executable not on the allow-list.

**Blocked — never runs, even with consent:**
`rm -rf /`, `sudo`, `curl ... | sh`, `git push`, `dd of=/dev/...`, `mkfs`, `shutdown`, `powershell -enc`, `Invoke-Expression`, `Remove-Item -Recurse -Force`, plus chaining/substitution/redirection (`;`, `&&`, `|`, `$()`, backticks, `>`, `<`).

Evaluation order: **blocked → risky (ask) → light (allow)**. This matches Claude Code's `deny → ask → allow` and Codex's `forbidden → prompt → allow`.

## Device verification (no pairing ceremony)

1. The companion starts the first time a command needs to run.
2. It registers itself with Forge under the current session in one background call — no screens, no typing, no ceremony.
3. Forge records the device token. If the companion is removed, the device stops working.
4. Every subsequent command on that device is authorized against the stored token.

This is "identified, not paired": the user does nothing, but the machine is a named, revocable identity rather than an anonymous localhost.

## Approvals are per-machine, not per-session

Stored on the companion, like Claude Code's `.claude/settings.local.json`:
- A light command auto-approves once, then stays approved on that machine.
- A risky command asks every time, unless the user approves it for that machine ("approve for this machine").
- Denials are remembered — a denied command asks again rather than silently retrying.

## What is deliberately not built

- **No sandbox.** The companion runs as the user. The policy layer is the only boundary. (Codex's sandbox is a future hardening option, not a first-version requirement.)
- **No browser terminal.** Removed entirely. The browser never holds a shell.
- **No server-side execution.** `src/execution/`, the terminal tools, the terminal HTTP/WebSocket routes, `@fastify/websocket`, `ws`, and `web/src/TerminalPanel.tsx` are removed.
- **No pairing flow.** Device verification is automatic.

## Verification limits (state plainly)

- No live AI provider key, no GitHub OAuth app, and no Neon-backed path have been exercised end to end.
- The companion, device verification, and the approval UI are not yet built.
- The command policy is pattern-based, not a parser (known limitation, same as the other tools).