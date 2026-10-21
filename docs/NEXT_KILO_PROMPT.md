# Next Kilo Code Task — Brilina Forge AI Pipeline Batch 1

**Task:** Implement only Pipeline Batch 1 — Native end-to-end streaming, as defined in docs/IMPLEMENTATION_PLAN.md and docs/AI_PIPELINE_REQUIREMENTS.md. Do not begin context-processing, Tavily reconciliation, observability, or image-worker implementation in this batch.

## Read first
1. README.md
2. docs/PRODUCT_SPEC.md
3. docs/IMPLEMENTATION_PLAN.md
4. docs/AI_PIPELINE_REQUIREMENTS.md
5. docs/AGENT_WORKFLOW.md
6. Relevant provider, controller, Worker SSE, frontend stream-consumer, persistence, and test files.

## Owner clarification
Tavily is already integrated and working. Preserve it. Its source/runtime path must be traced in its own planned batch; do not replace it, duplicate it, or report it as absent based only on text search.

## Before editing
- Confirm repository, branch, HEAD SHA, and git status; preserve all local changes.
- Trace the current path from provider adapter through model/controller and Worker SSE to frontend and message persistence.
- Confirm which code paths call the provider's native stream method versus its non-streaming completion method.
- Identify current event names, run/conversation identifiers, tool-call handling, cancellation/error behavior, and tests.
- Report the smallest safe implementation plan, exact files expected to change, acceptance criteria, risks, and tests before editing.
- Do not add new dependencies or create a separate Worker unless evidence proves it is necessary and the owner approves that architectural change.

## Batch 1 goal
Forward provider-generated text incrementally through the existing pipeline instead of waiting for the full response and splitting completed text into artificial chunks.

Requirements:
- Reuse the existing provider streaming interface where supported.
- Preserve event ordering and correct run/conversation association.
- Assemble streamed tool-call fragments fully; parse and validate before executing.
- Preserve usage metadata, final response persistence, and accurate terminal/error states.
- Handle provider failure, cancellation, disconnect, and cleanup without false success.
- Keep a clear fallback only for providers that cannot stream.
- Do not implement the later chunk/filter/batch pipeline or image worker in this batch.

## Verification
- Add/adjust tests proving the first text event is delivered before the mocked provider finishes generating.
- Test ordered chunks, completion/error states, fragmented tool calls, invalid tool arguments, cancellation/cleanup, and final persistence.
- Run focused tests, typecheck, build, Worker tests, and available CI. Fix failures and rerun.
- Inspect the final diff for regressions, accidental scope expansion, and secrets.
- Do not claim the original incident was CPU exhaustion unless actual runtime evidence proves it.
- Do not deploy production without explicit owner authorization.

## Handoff
Record starting/final SHA, exact changed files, commands and results, CI evidence, any live checks, and unresolved issues in docs/IMPLEMENTATION_PLAN.md. Stop after Pipeline Batch 1; do not begin Batch 2 until the gate is reviewed.
