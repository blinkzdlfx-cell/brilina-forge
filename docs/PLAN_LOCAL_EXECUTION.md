# Plan — Local Execution via the User's Machine

## Decision and scope

If Forge executes commands, those commands run on the user's own computer through a separate local Node.js companion. The Cloudflare Worker does not run a shell, there is no server-side execution VPS, and the browser is not a terminal.

This document describes the target design, not a claim that the feature is complete. See [Current State and Continuation Plan](CURRENT_STATE_AND_CONTINUATION.md) for implementation evidence.

## Intended topology

```
Browser (React)
  | HTTPS / SSE
  v
Cloudflare Worker
  - auth and ownership checks
  - Agent Controller and typed tool request
  - durable work / approval state in Neon
  - status and event APIs
  |
  | authenticated work assignment and result contract
  v
Local Node.js companion on the user's computer
  - obtains work scoped to its device/user
  - classifies the command
  - requests consent for risky commands
  - runs an approved process locally
  - bounds output and execution time
  - reports exit status and output
```

The companion should start only when execution is requested, not while the AI is only planning. If no companion is available, Forge must report that fact and not silently execute somewhere else.

## Required behavior

### Command classification

Apply policy in this order: **blocked → approval-required → safe**.

- **Blocked:** known destructive or privilege-escalating commands and unsafe command compositions. Consent must not override a block.
- **Approval-required:** writes, installs, network access, repository mutation, long-running or interactive processes, unknown executables and other commands outside the narrow read-only allow-list.
- **Safe:** explicitly allowed, read-only inspection commands only.

The command classifier is currently present in legacy source, but its suitability for a local companion must be verified with tests. A pattern-based classifier is not a full shell parser. Never claim it can safely interpret arbitrary shell syntax.

### Approval

Approval is an explicit decision for a specific pending tool call, not a UI notification. The system must:
1. persist the exact pending call and ownership;
2. show the command and relevant context to the user;
3. accept an authenticated approve/reject decision;
4. audit the decision;
5. execute the approved call at most once, or return a structured rejection;
6. handle duplicate decisions, expiry, cancellation and disconnected devices.

A tool marked `approval-required` currently gets rejected by the controller; there is no complete pause/resume flow. Do not wire risky execution as if this already works.

### Device and work lifecycle

Device identity must be durable and revocable. Do not use a Worker isolate-local map as the source of truth. Work assignment must be authenticated, scoped to the correct user/workspace/run, bounded by expiry, and safe under duplicate delivery. Results must be persisted and idempotent. Include timeout, cancellation, process cleanup, output-size limits, redaction and error reporting.

The repository currently has partial Worker routes and Neon work-result repositories, but no complete local companion has been verified. Fix the request/context contract before treating the command tool as usable; run ID and conversation ID are different identifiers.

## Non-goals for the first version

- No server-side shell or remote VPS executor.
- No browser terminal or terminal WebSocket.
- No installation of Kilo Code/OpenCode inside the companion.
- No claim of sandbox isolation. The companion runs with the user's OS permissions; the policy layer is not equivalent to an OS sandbox.

## Acceptance criteria

- The companion is a separate runnable application with documented setup.
- Device registration and revocation work across Worker isolates and restarts.
- The companion can retrieve only work authorized for that device/user.
- Safe commands run only from the narrow allow-list.
- Risky commands require explicit consent for the exact command.
- Blocked commands remain blocked even if a caller requests approval.
- Each accepted work item executes at most once, with bounded timeout/output and cleanup.
- Result submission is authenticated, durable and idempotent.
- The UI shows pending, approved, rejected, running, completed, failed, timed-out and unavailable states honestly.
- Automated tests cover policy, approval, duplicate delivery, ownership, cancellation, timeout and output limits.
- Live end-to-end verification is recorded separately from unit-test status.
