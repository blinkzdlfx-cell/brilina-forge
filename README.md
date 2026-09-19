# Brilina Forge

**Brilina Forge — AI-Assisted Software Development Workspace**

Brilina Forge is a private, GitHub-centered development workspace for controlled AI-assisted software engineering.

It combines:
- GitHub repository awareness and controlled source changes
- an Agent Controller for model/tool orchestration
- multiple AI providers behind one abstraction
- a disposable Google Cloud E2 execution environment
- persistent terminal sessions
- Neon Postgres for application state and audit history
- a ChatGPT-style development interface built only after the backend contracts are proven

## Source of truth

GitHub is the canonical source of repository code and history.

Neon stores Forge application state. E2 is a disposable execution environment and must never become the only copy of project source.

## Development rule

**Documentation → architecture decision → implementation → test → verification**

The agent must not silently replace an accepted architectural decision.

## Initial implementation order

1. GitHub authentication and authorization
2. GitHub REST + GraphQL service
3. Repository context retrieval
4. Neon schema and persistence
5. Agent Controller and tool interface
6. E2 terminal connection
7. AI provider abstraction
8. Chat UI

See `docs/BRILINA_FORGE.md` for the expanded product and engineering specification.
