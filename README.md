# Brilina Forge

**A private, GitHub-centered AI coding workspace.**

Brilina Forge is being built so you can open a browser workspace, connect GitHub, choose a repository, ask an AI to modify code, review the diff, and later verify fixes through automated checks. The project is delivered in five phases so the core coding workflow works before optional execution and collaboration features are added.

## Architecture

- **Frontend and API:** React/Vite hosted with the native Cloudflare Worker and Workers Static Assets.
- **Source of truth:** GitHub repositories, branches, commits, and pull requests.
- **Application database:** Neon Postgres.
- **AI:** provider-neutral adapter; start with one real provider and add others later.
- **Remote verification:** GitHub Actions.
- **Optional local execution:** separate Node.js companion on the user's computer, planned for Phase 3.
- **Production diagnostics:** Cloudflare observability integration, planned for Phase 4.

The Worker does not execute shell commands. Do not add new product behavior to legacy Fastify routes in `src/server.ts`. New Worker API work belongs in `worker/index.ts` and `worker/api.ts`. Neon remains the database; D1 is not part of the current plan.

## The five phases

1. **GitHub coding (current priority):** configure one real model and add safe GitHub write tools so the AI can inspect, modify, diff, and commit code on a work branch.
2. **Verification and repair:** run GitHub Actions, retrieve logs, diagnose failures, and perform bounded correction attempts.
3. **Local Node.js companion:** execute approved commands on the user's own computer with explicit policy, consent, limits, and audit.
4. **Cloudflare diagnostics:** retrieve and redact production logs, correlate errors with source, and verify proposed fixes.
5. **Providers, teams, and hardening:** add other models, invited team workspaces, permissions, and end-to-end regression coverage.

Read [the roadmap](docs/ROADMAP.md) for phase acceptance criteria and [current state](docs/CURRENT_STATE_AND_CONTINUATION.md) for the known gaps.

## Start here

1. Read `docs/AI_COLLABORATION.md` and `docs/CURRENT_STATE_AND_CONTINUATION.md`.
2. Inspect `git status` and preserve any local changes.
3. Follow `docs/ROADMAP.md` in order. Do not work on all phases at once.
4. Use `docs/NEXT_KILO_PROMPT.md` to start a focused Kilo Code session.

## Local development

```bash
npm install
npm run build
npm test
npm run dev
```

Use `.dev.vars` for local Worker secrets and variables; never commit it. Check `package.json` for the exact scripts and report their actual results. The legacy `npm run dev:node` command is for migration-era code only.

## Deployment

```bash
npm run build
npm run deploy:cloudflare
```

See [Cloudflare deployment](docs/CLOUDFLARE_DEPLOYMENT.md). Do not claim deployment or browser acceptance succeeded unless it was actually exercised.

## Documentation map

- [Roadmap and acceptance criteria](docs/ROADMAP.md)
- [Current state and continuation](docs/CURRENT_STATE_AND_CONTINUATION.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Requirements](docs/REQUIREMENTS.md)
- [Agent handoff](docs/AGENT_HANDOFF.md)
- [AI collaboration workflow](docs/AI_COLLABORATION.md)
- [Next Kilo prompt](docs/NEXT_KILO_PROMPT.md)
- [Local execution / companion plan](docs/PLAN_LOCAL_EXECUTION.md)
- [Security](docs/SECURITY.md)
- [Architecture decisions](docs/DECISIONS.md)
- [Testing strategy](docs/TESTING.md)
- [Database and API reference](docs/DATABASE_AND_API_REFERENCE.md)
- [Phase 1 setup and user guide (GitHub, Neon, Cloudflare Workers AI, and first-time use)](docs/PHASE_1_SETUP_AND_USER_GUIDE.md)
- [GitHub App setup](docs/GITHUB_APP_SETUP.md)

## Working rule

**Inspect → plan one increment → implement → test → review diff → record evidence.**

GitHub is the source of truth. Do not create parallel plans, invent mock integrations, or mark unverified features complete.