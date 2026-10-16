# Next Kilo Code Task — Brilina Forge

**Start with Batch 1 in `docs/IMPLEMENTATION_PLAN.md`: Tailwind CSS + shadcn/ui foundation.** Do not begin the full UI migration, backend reliability work, or later batches in the same increment.

## Read first
1. `README.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/IMPLEMENTATION_PLAN.md`
4. `docs/AGENT_WORKFLOW.md`
5. The relevant source/config/tests and any supporting technical reference needed for Batch 1.

## First response before editing
- Confirm repository, branch, HEAD SHA, and `git status`; preserve all local changes.
- Inspect package.json and lockfile, React/Vite/Tailwind versions, tsconfig aliases, Vite config, current CSS, existing UI components, and build/test scripts.
- Report the smallest safe setup plan, exact files expected to change, compatibility considerations, acceptance criteria, and checks to run.
- Do not assume old documentation accurately describes the current checkout.
- Do not install dependencies or edit files until this inspection and proposed plan are reported.

## Batch 1 implementation goal
Configure Tailwind and shadcn/ui in a way compatible with the actual project. Establish theme tokens, component aliases/directories, and clear frontend organization. Keep global CSS limited to framework directives, theme tokens, and genuinely global rules. Do not use a handwritten styles.css as the styling system.

Do not preserve unapproved styling just because it exists, but preserve existing application functionality. Do not migrate every screen yet. Avoid duplicate styling systems, unnecessary dependencies, and unused components.

## Verification and handoff
- Run the relevant install/lockfile checks, build, typecheck, and available focused tests; fix and retest failures.
- Inspect the final diff for accidental backend changes, unrelated edits, generated artifacts, and secrets.
- Commit and push directly to `main` unless the owner explicitly changes that agreement. Do not deploy production.
- Update `docs/IMPLEMENTATION_PLAN.md` only with evidence actually collected.
- Report starting/final SHA, changed files, exact commands/results, CI evidence, and remaining gaps.
- Stop at Batch 1's acceptance gate. Do not begin Batch 2 until review confirms the foundation build is verified.

Use `docs/AGENT_WORKFLOW.md` for the complete agent contract. Never claim live UI behavior is verified by a build alone.
