# Brilina Forge — product specification

Brilina Forge is an AI-assisted software development workspace. It is not
simply a chatbot with a terminal attached. It is a controlled engineering
workflow for the owner and a small trusted group.

## What it is

- GitHub is the source of truth for repository code, branches, commits and
  pull requests.
- Neon Postgres stores Forge application state.
- The browser is the interface. The AI plans, writes code, runs it, and
  iterates — all on the user's own machine through a small local companion.
- Commands never run on the Forge server. There is no server-side shell, no VPS
  cost, and no browser terminal.

## What it does

1. Authenticate with GitHub through a GitHub App.
2. Discover repositories, branches and the repository context.
3. Create conversations with a bound repository and branch.
4. Send a message. The Agent Controller invokes a provider-neutral model,
   which may request typed tools.
5. GitHub read tools fetch metadata, context, branches, trees, files and diffs.
6. When a command needs to execute, the companion starts, verifies the machine
   on first use, runs light commands automatically and asks before risky
   ones, and streams output back over SSE.
7. The AI iterates using the output until the run completes.

## Scope

In scope:

- GitHub-centered AI-assisted development
- Conversations, messages and runs persisted in Neon
- Provider-neutral AI runtime with an OpenAI-compatible adapter
- Local execution through the companion with a command policy boundary

Out of scope:

- A server-side shell
- A browser terminal
- Multi-tenant sharing beyond the owner and a small trusted group
- Any execution that costs money on infrastructure

## Architecture

See [Architecture](ARCHITECTURE.md), [Plan — Local execution](PLAN_LOCAL_EXECUTION.md)
and [Security](SECURITY.md).

## Rules

- GitHub is canonical; the companion is disposable (ADR-001).
- The backend owns orchestration; no coding-agent framework on the companion (ADR-002).
- High-impact operations require policy checks and human control.
- Do not install OpenCode or Kilo Code on the companion in the current
  architecture.

## Status

Phases 0 through 5 are complete in code. Phase 6 (local execution via the
companion) and Phase 7 (verification and hardening) are not started. Live
verification is outstanding: no provider key, no GitHub OAuth app, and no
Neon-backed end-to-end run have been exercised.