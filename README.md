# Brilina Forge

**Brilina Forge — AI-Assisted Software Development Workspace**

Brilina Forge is a private, GitHub-centered workspace for controlled AI-assisted software engineering. It combines repository awareness, a provider-neutral Agent Controller, a React chat interface, Neon persistence, and planned AI-provider and disposable execution integrations.

## Source of truth

GitHub is canonical for source code and history. Neon stores Forge application state. The planned E2 worker is disposable and must never be the only copy of source.

## Development rule

**Documentation → architecture decision → implementation → test → verification**

Do not silently replace accepted architectural decisions. Read [Agent Handoff](docs/AGENT_HANDOFF.md) before continuing work.

## Current status

- Phases 0–3 (documentation, GitHub foundation, Neon persistence, Agent Controller): complete.
- Phase 4 (Chat UI): foundation implemented; local acceptance, remaining integration work, and production/deployment verification remain.
- Phase 5 (AI provider abstraction), Phase 6 (E2 execution), and Phase 7 (verification/hardening): not started.
- Phase 4 uses a deterministic development/test model, not a live AI provider.

## Accepted implementation order

1. Phase 0 — Documentation
2. Phase 1 — GitHub foundation
3. Phase 2 — Neon persistence
4. Phase 3 — Agent Controller
5. Phase 4 — Chat UI
6. Phase 5 — AI provider abstraction
7. Phase 6 — E2 execution
8. Phase 7 — Verification and hardening

This follows ADR-011 and supersedes the historical order in earlier documentation.

## Local development

See [Windows PowerShell Local Development](docs/LOCAL_DEVELOPMENT.md) for installation, environment setup, build, and local run instructions.

## Engineering documentation

- [Agent handoff](docs/AGENT_HANDOFF.md)
- [Product & engineering specification](docs/BRILINA_FORGE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Requirements](docs/REQUIREMENTS.md)
- [Roadmap](docs/ROADMAP.md)
- [Security](docs/SECURITY.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Testing strategy](docs/TESTING.md)
- [Database and API reference](docs/DATABASE_AND_API_REFERENCE.md)

## Main commands

From the repository root:

```powershell
npm install
npm --prefix web install
npm run build
npm test
npm --prefix web run build
npm run dev
```

For a separate frontend development server, run `npm --prefix web run dev` in another terminal. See the local development guide for full details.
