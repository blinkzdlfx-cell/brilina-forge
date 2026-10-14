# Plan — Local Execution via the User's Machine

**Roadmap position: Phase 3.** Do not prioritize this work until Phase 1 (AI coding through GitHub) and Phase 2 (verification and repair) meet their acceptance criteria. This plan preserves the intended architecture so companion work is not lost.

## Decision and scope

If Forge executes commands, those commands run on the user's own computer through a separate local Node.js companion. The Cloudflare Worker does not run a shell, there is no server-side execution VPS, and the browser is not a terminal. Phase 1 must work without the companion.

## Intended topology

```
Browser (React)
  | HTTPS / SSE
  v
Cloudflare Worker
  - auth and ownership checks
  - Agent Controller and typed tool request
  - durable work and approval state in Neon
  - status and result APIs
  |
  | authenticated, expiring work assignment
  v
Local Node.js companion on the user's computer
  - authenticates device/user
  - receives work scoped to the user/workspace/run
  - applies command policy and consent
  - runs an approved process locally
  - bounds output and execution time
  - reports exit code and output
```

If no companion is available, Forge must say so and use only an explicitly supported alternative, such as GitHub Actions. It must not silently execute elsewhere.

## Required safety contract

Apply policy in this order: **blocked → approval-required → safe allow-list**.

- Block prohibited destructive or privilege-escalating commands; approval cannot override a block.
- Require fresh consent for writes, installs, network access, Git mutation, unknown executables, interactive processes and commands outside the narrow read-only allow-list.
- A pattern-based classifier is not a full shell parser. Do not treat arbitrary shell strings as safe. Prefer structured executable/argument requests and avoid shell interpretation where possible.
- Persist the exact pending tool call, owner, run, conversation, arguments, expiry and state.
- Authenticate approve/reject actions, audit who decided and when, and resume the same call at most once.
- Restrict execution to a user-selected project directory; never silently expand file-system access.
- Use bounded time and output, cancellation, process cleanup, redaction, duplicate-delivery protection and idempotent result persistence.
- Device identity must be durable, owned, and revocable; an isolate-local map is not authoritative.
- Keep run ID and conversation ID as distinct identifiers.

## Existing partial work

The repository contains companion-related Worker routes, a command-dispatch tool, and Neon work-result persistence. This is scaffolding, not evidence of a complete usable companion. The device identity, approval/resume and run/context contracts require verification before the tool is wired into ordinary runs.

## Phase 3 completion gate

From the Forge UI, request a command; see its exact command and risk classification; approve it when required; execute it on the intended local machine; receive output and exit code; and confirm the result is tied to the correct run/conversation. Test rejection, timeout, cancellation, disconnection, duplicate delivery, blocked commands and result persistence.