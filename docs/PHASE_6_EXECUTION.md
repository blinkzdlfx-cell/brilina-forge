# Brilina Forge — Phase 6 local execution

Status: **not started**

The previous Phase 6 scope (a server-side execution worker with a browser
terminal) was superseded. Execution now runs on the user's own machine through
a small local Node companion. See [Plan — Local execution](PLAN_LOCAL_EXECUTION.md).

## What the companion does

- starts only when a command actually needs to execute, never when the AI is
  just planning
- verifies the machine on first use: one background call to Forge under the
  current session, no pairing ceremony
- runs light read-only commands automatically on a verified machine
- asks the user before risky commands
- blocks destructive commands outright, even with consent
- streams output back to the browser over SSE

## Command classification

Evaluation order is **blocked → risky (ask) → light (allow)**.

- **Light** — read-only inspection, runs automatically: `ls`, `cat`, `grep`,
  `git status`, `node --version`, `npm test`, `du`, `df`, `find`, `head`,
  `tail`, `wc`, `diff`, `echo`, `pwd`, `uname`, `whoami`, `which`, `date`.
- **Risky** — requires consent: file writes, `npm install`/`pnpm`/`pip`, `git
  commit`/`git push`, `docker`, `curl`/`wget`, `npm run dev`, `ssh`, `kill`, and
  any executable not on the allow-list.
- **Blocked** — never runs: destructive filesystem operations, disk writes,
  power-state changes, privilege escalation (`sudo`, `su -`), package
  publication, and the Windows equivalents. Chaining, substitution and
  redirection are also blocked.

The companion environment is allow-listed so Forge secrets are unreachable
from a shell.

## Not built

- the companion service itself
- device verification
- per-machine approval store
- per-command consent prompts
- output streaming over SSE

## Honest caveats

- The companion has not been built.
- No live verification has been performed.
- The companion runs as the user with **no sandbox boundary**; the command
  policy layer is the only control.