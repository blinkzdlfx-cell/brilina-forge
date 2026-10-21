# Next Kilo Code Task — AI Pipeline Batch 1: Native End-to-End Streaming

**Task:** Implement only Batch 1 in `docs/AI_PIPELINE_BATCH_PLAN.md`. This is the first of three batches. Do not implement context chunking/filtering/batching, general reliability/observability work, image intelligence, or Tavily changes in this batch.

## Read first
1. `README.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/IMPLEMENTATION_PLAN.md`
4. `docs/AI_PIPELINE_REQUIREMENTS.md`
5. `docs/AI_PIPELINE_BATCH_PLAN.md`
6. `docs/AGENT_WORKFLOW.md`
7. Relevant provider, controller, Worker SSE, frontend stream-consumer, persistence, and test files.

## Owner clarification
Tavily is already integrated and working. Preserve it. Do not trace, replace, duplicate, or change its request/configuration path in Batches 1 or 2. Tavily is Batch 3 and must remain last.

## Before editing
- Confirm repository, branch, HEAD SHA, and git status; preserve all local changes.
- Trace the current provider adapter → agent model/controller → Worker SSE → frontend and persistence path.
- Confirm event names, run/conversation association, tool-call handling, cancellation/error behavior, and tests.
- State the smallest safe implementation plan, exact files expected to change, acceptance criteria, risks, and tests before editing.
- Do not add dependencies or create a separate Worker unless evidence proves it is necessary and the owner approves the architectural change.

## Batch 1 goal
Forward provider-generated text incrementally through the existing pipeline instead of waiting for the full response and splitting completed text into artificial chunks.

Requirements:
- Reuse the existing provider streaming interface where supported.
- Preserve event ordering and correct run/conversation association.
- Assemble streamed tool-call fragments fully; parse and validate completed arguments before executing a tool.
- Preserve usage metadata and final assistant-message persistence.
- Handle provider failure, cancellation, disconnect, and cleanup without false success.
- Keep a clear fallback only for providers that cannot stream.
- Keep existing search/Tavily behavior unchanged.
- Do not implement the later context-processing pipeline or image worker in this batch.

## Verification
- Add/adjust tests proving the first text event is delivered before the mocked provider finishes generating.
- Test ordered chunks, completion/error states, fragmented and invalid tool calls, cancellation/cleanup, and final persistence.
- Run focused tests, typecheck, build, Worker tests, and available CI. Fix failures and rerun.
- Inspect the final diff for regressions, accidental scope expansion, and secrets.
- Do not claim the original incident was CPU exhaustion unless actual runtime evidence proves it.
- Do not deploy production without explicit owner authorization.

## Handoff
Record starting/final SHA, exact changed files, commands and results, CI evidence, live-check status, and unresolved issues in `docs/IMPLEMENTATION_PLAN.md` and the batch plan. Stop at Batch 1's acceptance gate. Do not begin Batch 2 or Batch 3 until Batch 1 has verification evidence.
