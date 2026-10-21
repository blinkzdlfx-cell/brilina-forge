# AI Pipeline Delivery Plan — Three Batches

**Status:** Approved execution sequence. The nine requirements in `docs/AI_PIPELINE_REQUIREMENTS.md` remain the acceptance baseline.
**Order:** Batch 1 → acceptance gate → Batch 2 → acceptance gate → Batch 3 (Tavily last).
**Production rule:** Do not deploy production without explicit owner authorization.

## Why three batches

The original five implementation stages are grouped into two core engineering batches, while Tavily is deliberately isolated as the final third batch. This keeps the existing working search integration untouched while the stream/context foundations and general reliability work are implemented and verified.

## Batch 1 — Native end-to-end streaming

**Includes original stage 1 only.**

- Forward provider-generated text through provider adapter → agent model/controller → Worker SSE → frontend as it arrives.
- Stop splitting a fully generated answer into artificial UI chunks.
- Preserve run identity, event order, tool-call assembly and validation, usage metadata, final persistence, and accurate terminal/error states.
- Handle provider errors, cancellation, and disconnect cleanup; keep fallback only for providers without streaming support.

**Acceptance gate:** automated tests prove first text arrives before provider completion, chunks are ordered, tool calls are not executed from partial/invalid arguments, errors/cancellation do not report success, and the final assistant message is persisted once. Run focused tests, typecheck, build, Worker tests, and available CI. No production deployment.

## Batch 2 — Bounded context pipeline, reliability, observability, and image intelligence

**Combines original stages 2, 3, and 5. Tavily-specific changes are excluded.**

### Context and payload processing
- Add bounded logical chunking for existing non-Tavily tool results/documents and future image collections.
- Filter/deduplicate irrelevant material before model-context construction while retaining source provenance and critical evidence.
- Batch related analysis inputs within verified provider/model limits; preserve ordering, source identity, uncertainty, and partial-failure markers.
- Bound buffers, concurrency, per-run work, and payload sizes. Avoid silent prefix-only truncation and preserve the immutable run repository/branch snapshot.

### Reliability and observability
- Add explicit bounded retry/timeout/cancellation behavior and safe error classification.
- Limit concurrency and total work; respect rate limits and Retry-After.
- Record redacted stage timings, payload sizes, attempts, outcomes, provider/model and available usage. Separate Worker CPU time from elapsed request/provider latency.
- Test timeouts, 429s, 5xxs, malformed responses, partial failures, cancellation, and duplicate-side-effect prevention.

### Image intelligence
- Confirm image inputs, desired output, and provider/model contracts before implementing routing.
- Support the agreed Groq vision models and Cloudflare Workers AI vision model only after current limits are verified.
- Batch images within verified limits, preserve image-index/source provenance, combine findings, and represent partial failures.
- Keep credentials server-side and avoid redundant inference. Add a separate Worker/Service Binding only if measurements and architecture justify it; Worker count does not multiply account-level quotas.

**Acceptance gate:** bounded chunk/batch/concurrency tests pass; provenance and partial failures are preserved; logs are redacted and distinguish CPU from latency; model limits are documented from authoritative provider contracts; existing chat, tools, GitHub context, and streaming regressions pass. No production deployment.

## Batch 3 — Tavily search integration (last)

**Original stage 4, deliberately isolated.**

- Trace the real request/configuration/runtime path of the owner-confirmed working Tavily integration.
- Preserve its current behavior and credentials; do not replace it, duplicate it, or infer it is absent from a text search.
- Apply bounded normalization, deduplication, chunking, filtering, provenance, safe retries, and explicit partial-result behavior around the existing integration.
- Test successful results, malformed/oversized payloads, rate limits, provider errors, partial results, and source URL preservation.

**Acceptance gate:** existing Tavily search behavior is regression-tested; failure and oversized-result handling is bounded; URLs and provenance survive processing; no duplicate provider or exposed key is introduced. No production deployment without explicit authorization.

## Cross-batch rules

- Check the current `main` SHA and working tree before each batch; preserve unrelated changes.
- Work on one batch at a time. Do not start the next batch until the current acceptance gate has evidence and a handoff note.
- Keep existing Tavily functionality untouched in Batches 1 and 2.
- Do not add dependencies, create new Workers, change database schema, or change deployment settings without evidence and approval where needed.
- Record exact changed files, commit SHA, commands/results, CI evidence, live-check status, and unresolved issues.
- Do not claim the CPU incident was CPU exhaustion without runtime evidence.
