# Brilina Forge

**A private, GitHub-centered AI coding workspace.**

Brilina Forge is being built so you can open a browser workspace, connect GitHub, choose a repository, ask an AI to modify code, review the diff, and verify changes through real checks. The target is a controlled, recoverable coding workflow—not a chatbot with an unrestricted terminal.

## Architecture

- **Frontend and API:** React/Vite hosted with the native Cloudflare Worker and Workers Static Assets.
- **Source of truth:** GitHub repositories, branches, commits, diffs and pull requests.
- **Application database:** Neon Postgres (D1 was evaluated in the product architecture plan; migration is not currently recommended).
- **Agent runtime:** typed controller, provider-neutral adapter, policy-checked tools, durable run/event state and visible activity.
- **Remote verification:** GitHub Actions.
- **Optional local execution:** separate Node.js companion on the user's computer; the Worker does not execute shell commands.
- **Production diagnostics:** Cloudflare observability integration.

## Planning and phases

The active roadmap is in [`docs/ROADMAP.md`](docs/ROADMAP.md). The reference comparison, proposed target architecture, Neon-versus-D1 evaluation, free-tier constraints, recovery design and rebaselined phases are in [`docs/PRODUCT_ARCHITECTURE_PLAN.md`](docs/PRODUCT_ARCHITECTURE_PLAN.md).

The proposed product phases are:
0. Architecture, baseline and data decision.
1. Reliable core GitHub coding workflow.
2. Autonomous runtime reliability and recovery.
3. GitHub Actions verification and bounded repair.
4. Optional local Node.js companion.
5. Cloudflare diagnostics and production troubleshooting.
6. Providers, collaboration and hardening.

**The rebaseline is a proposal pending owner approval.** Historical technical Phase 0–7 documents and old branches are preserved as history; they are not automatically the current product roadmap.

## Start here

1. Read `docs/PRODUCT_ARCHITECTURE_PLAN.md`, `docs/ROADMAP.md`, `docs/CURRENT_STATE_AND_CONTINUATION.md`, and `docs/AI_COLLABORATION.md`.
2. Inspect `git status` and preserve local changes.
3. Work on one increment at a time and follow the active phase gate.
4. Use `docs/NEXT_KILO_PROMPT.md` to start a focused Kilo Code session.

## Local development

```bash
npm install
npm run build
npm test
npm run dev
```

Use `.dev.vars` for local Worker secrets and variables; never commit it. Check `package.json` for exact scripts and report their actual results. The legacy `npm run dev:node` command is for migration-era code only.

## Deployment

```bash
npm run build
npm run deploy:cloudflare
```

See [Cloudflare deployment](docs/CLOUDFLARE_DEPLOYMENT.md). Do not claim deployment or browser acceptance succeeded unless it was actually exercised.

## Documentation map

- [Product architecture and phase rebaseline](docs/PRODUCT_ARCHITECTURE_PLAN.md)
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
- [Phase 1 setup and user guide](docs/PHASE_1_SETUP_AND_USER_GUIDE.md)
- [Cloudflare Workers AI API token setup and verification](docs/CLOUDFLARE_WORKERS_AI_TOKEN_SETUP.md)
- [GitHub App setup](docs/GITHUB_APP_SETUP.md)

## Working rule

**Inspect → plan one increment → implement → test → review diff → record evidence.**

GitHub is the source of truth. Do not create parallel plans, invent mock integrations, or mark unverified features complete.
