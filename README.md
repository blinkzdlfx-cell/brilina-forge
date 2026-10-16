# Brilina Forge

**A private, GitHub-centered AI coding workspace.**

Brilina Forge is a controlled AI software-development workspace for understanding a repository, planning work, making reviewable code changes, running real checks, and presenting evidence of the result. It is not a chatbot with an unrestricted terminal.

## Authoritative project documents

Use these three documents as the source of truth:

1. [Product specification](docs/PRODUCT_SPEC.md) — product behavior, architecture, UI, AI runtime, GitHub, security, and verification requirements.
2. [Unified implementation plan](docs/IMPLEMENTATION_PLAN.md) — ordered batches, known gaps, acceptance gates, and current delivery status.
3. [AI agent workflow](docs/AGENT_WORKFLOW.md) — instructions for Kilo Code and other coding agents, verification, handoff, and owner acceptance.

When older planning documents conflict with these three, the authoritative documents above take precedence. Older documents are retained as supporting technical references/history unless explicitly marked otherwise.

## Confirmed architecture

- **Frontend:** React + Vite.
- **UI system:** Tailwind CSS + shadcn/ui (foundation setup is the next implementation batch; inspect actual package/config state first).
- **Hosted app/API:** native Cloudflare Worker + Workers Static Assets.
- **Application state:** Neon Postgres; no D1 migration is planned.
- **Source of truth for code:** GitHub branches, files, commits, diffs, and pull requests.
- **AI execution:** typed controller, provider-neutral adapter, policy-checked tools, persisted run state, and visible activity.
- **Remote checks:** GitHub Actions.
- **Optional local execution:** separate Node.js companion; no shell in the Worker and no browser terminal.

## Start here

1. Read the three authoritative documents above.
2. Inspect the actual branch, HEAD SHA, and working-tree status; preserve local changes.
3. Follow only the next unaccepted batch in `docs/IMPLEMENTATION_PLAN.md`.
4. Use `docs/NEXT_KILO_PROMPT.md` as the quick Kilo Code entry prompt.
5. Do not mark work accepted until the batch's automated and required live acceptance checks have evidence.

## Local development

Check `package.json` for the exact scripts at the checked-out commit. Typical checks include:

```bash
npm install
npm run build
npm test
npm run dev
```

Use the repository's documented local Worker environment setup. Keep local secret files out of Git; never commit credentials. Report exact commands and actual results. Do not infer live integration or browser success from a passing build.

## Deployment

Check the current scripts and [Cloudflare deployment guide](docs/CLOUDFLARE_DEPLOYMENT.md) before deployment. Do not deploy production without explicit owner authorization. A dry-run is not proof that the production Worker has the latest code.

## Supporting technical references

These remain useful when relevant to the batch, but do not supersede the authoritative documents:

- `docs/ARCHITECTURE.md` — existing architecture reference.
- `docs/SECURITY.md` — security controls and known risks.
- `docs/TESTING.md` — test strategy and verification rules.
- `docs/DATABASE_AND_API_REFERENCE.md` — schema/API reference.
- `docs/CLOUDFLARE_DEPLOYMENT.md` — deployment instructions.
- `docs/GITHUB_APP_SETUP.md` — GitHub App setup.
- `docs/PHASE_1_SETUP_AND_USER_GUIDE.md` and `docs/CLOUDFLARE_WORKERS_AI_TOKEN_SETUP.md` — setup references where still applicable.
- `docs/CURRENT_STATE_AND_CONTINUATION.md` — historical checkpoint/evidence record; refresh against current HEAD before relying on it.
- `docs/UI_BEHAVIOR_CONTRACT.md` — detailed existing UI acceptance matrix, to be reconciled with the product spec during UI implementation.

## Working rule

**Inspect → plan one batch → implement → test → inspect diff → commit/push → record evidence → owner acceptance when required.**

GitHub is the shared source of truth. Do not invent mock integrations, discard local changes, skip a failing gate, or claim unverified functionality is complete.
