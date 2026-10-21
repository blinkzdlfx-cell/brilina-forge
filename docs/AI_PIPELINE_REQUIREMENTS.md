# Brilina Forge — Streaming, Search, and Context Pipeline Requirements

**Status:** Approved requirements baseline; implementation not yet claimed by this document.  
**Owner clarification:** Tavily is the existing, working web-search integration. Preserve it; do not replace it with a newly invented search provider or create a duplicate search integration.  
**Scope:** AI response streaming, search/document/image processing, context preparation, reliability, and observability.

## 1. Goal

Build a streaming-first, batch-aware AI pipeline in which each stage processes only the data it needs, large inputs are handled in bounded units, and the coding model's output is delivered as it is generated. Improve reliability and diagnosability without confusing provider latency with Cloudflare Worker CPU time or assuming that adding Workers automatically removes limits.

This is a requirements document. It does not claim that the requirements below have been implemented or verified.

## 2. Nine mandatory requirements

### R1 — Stream generated output incrementally

Connect the provider adapter's streaming interface through the agent model/controller, Worker response, SSE event contract, and frontend. Forward text as it arrives rather than waiting for the full answer and then splitting the completed text into artificial chunks.

- Preserve run/conversation association and event ordering.
- Handle stream completion, provider errors, client disconnects, and cancellation explicitly.
- Accumulate tool-call fragments until a complete call is available; validate the completed arguments before executing a tool.
- Preserve usage metadata and final-message persistence.
- Keep a deliberate fallback for providers that cannot stream, clearly separated from the native streaming path.

**Acceptance:** a test proves that the first text event is forwarded before provider generation completes; later chunks arrive in order; completion and error states are accurate; tool calls are never executed from partial arguments.

### R2 — Chunk large search results, documents, and image collections

Process large inputs in logical, bounded units rather than treating each payload as an indivisible string.

- Preserve semantic boundaries where possible: headings/paragraphs for documents, functions/classes for source code, and supported image groups for vision requests.
- Define per-stage limits for bytes, characters/tokens where available, item count, and total work.
- Carry source IDs, URLs, file paths, page/section labels, or image indices through every chunk.
- Avoid silent prefix-only loss when a result exceeds a limit. Return an explicit partial/truncated status when content cannot be fully processed.
- Use bounded concurrency rather than launching unbounded parallel work.

**Acceptance:** tests cover oversized inputs, boundaries, ordering, partial failures, and traceability from combined findings back to their sources.

### R3 — Filter irrelevant information before model-context construction

Reduce noise before calling the coding model.

- Deduplicate repeated search results and overlapping passages.
- Rank/select task-relevant material while retaining provenance and important counter-evidence.
- For repository tasks, retrieve targeted files and relevant ranges instead of sending an entire repository tree or unrelated file contents by default.
- Keep the original source retrievable when the model needs to verify a summary.
- Never use an unverified summary as the only basis for a consequential code change when source inspection is required.

**Acceptance:** fixtures show duplicate and irrelevant material is reduced while required evidence, source references, and critical details remain available.

### R4 — Buffer intelligently and bound memory

Do not accumulate an entire generated response or oversized upstream payload merely to deliver it in chunks later.

- Stream generated text through the Worker to the frontend where supported.
- Keep only the incomplete protocol frame, currently required tool-call fragments, bounded context, and data needed for persistence/recovery.
- Avoid concatenating unbounded response buffers; define maximum line/frame and payload sizes and handle malformed or oversized frames safely.
- Persist final messages efficiently; use checkpoints only where recovery requirements justify them rather than writing every token to Neon.
- Ensure cancellation releases stream readers and stops unnecessary downstream work when safe.

**Acceptance:** tests demonstrate incremental forwarding, bounded frame parsing, cleanup on cancellation/error, and no requirement to hold the full answer in memory before the first event.

### R5 — Batch related findings before passing them downstream

Batching is for analysis and context preparation; it must not unnecessarily delay interactive output.

- Batch related search passages, document chunks, or images according to the provider's verified request limits.
- Combine batch findings into a compact, structured result with provenance, uncertainty, and explicit partial-failure markers.
- Keep original source references and allow targeted follow-up retrieval.
- Do not send the same image or search payload to multiple providers redundantly unless fallback or cross-checking is required.
- Do not invent provider limits; verify the current model/provider contract before selecting batch size.

**Acceptance:** tests verify batches respect configured limits, combined results preserve source identity, and partial failures do not silently erase successful findings.

### R6 — Limit concurrency and total work

Protect provider quotas, Worker subrequest/connection limits, memory, and user latency.

- Set explicit concurrency limits per provider and workload type.
- Apply per-run budgets for tool calls, batches, model turns, elapsed time, input/output size, and estimated usage.
- Respect provider rate limits and retry-after guidance.
- Avoid retry storms and unbounded fan-out; make concurrency configurable and observable.
- Treat interactive tasks differently from large background jobs.

**Acceptance:** concurrency tests prove the configured maximum is respected and overload/rate-limit responses remain bounded and understandable.

### R7 — Recover from timeouts, rate limits, and partial failures

Use explicit error classification and safe recovery.

- Distinguish retryable provider failures from authentication, validation, quota, and permanent errors.
- Apply bounded exponential backoff/jitter where appropriate and respect Retry-After.
- Retry only operations that are safe to repeat; prevent duplicate tool side effects.
- Preserve completed batch results when another batch fails and identify incomplete stages to the caller.
- Define timeout, cancellation, disconnect, and resume semantics; never report partial work as full success.
- Use fallback providers only when configured, compatible, and safe; record which provider/model produced each result.

**Acceptance:** deterministic tests cover timeout, 429/rate limit, 5xx, malformed response, failed batch, cancellation, and duplicate-side-effect prevention.

### R8 — Observe CPU, latency, sizes, and stage-specific failures

Add structured, redacted observability across the pipeline.

- Record correlation ID, run ID, stage, provider/model, attempt, outcome, duration, payload size, batch count, and available usage metadata.
- Capture Worker CPU time separately from total request duration and upstream provider latency wherever Cloudflare exposes those metrics.
- Record search, vision, model-generation, tool-execution, context-preparation, persistence, and stream-delivery timings separately.
- Normalize errors into safe categories; do not log API keys, authorization headers, raw secrets, or unnecessary personal data.
- Make diagnostics sufficient to distinguish CPU exhaustion from provider latency, provider timeout, quota/rate limit, payload rejection, and frontend/network failure.
- Never claim a CPU-limit root cause without corresponding runtime evidence.

**Acceptance:** tests assert required fields and redaction; a diagnostic trace identifies the stage and failure category for simulated errors.

### R9 — Preserve context, provenance, and task identity

Chunking, batching, summarisation, retries, and provider fallback must not cause the model to lose the user's intent or act on a different repository context.

- Preserve the original user request and applicable conversation history.
- Preserve the immutable per-run snapshot of Forge user, GitHub connection/installation where applicable, repository, and branch.
- Maintain source provenance for search results, document passages, files, and images.
- Keep tool-call/result pairing and chronological run events intact.
- Distinguish evidence from inference and mark omitted, truncated, uncertain, or failed inputs.
- Retain access to original source data for targeted verification where necessary.
- Summaries and compact context must not bypass tool authorization or approval policy.

**Acceptance:** regression tests prove context identity and provenance survive chunking, batching, retries, and partial failure; repository/branch switches cannot redirect an in-flight run.

## 3. Existing Tavily search integration

Tavily is the current search integration and is reported by the owner as working. It is part of the target pipeline, not a new provider to be introduced.

Required approach:
1. Preserve existing Tavily configuration, request behavior, and user-visible functionality.
2. During implementation, locate and trace the actual Tavily request path and its current runtime configuration; do not infer its location from search results alone.
3. Apply bounded result normalization, deduplication, chunking, filtering, and provenance preservation around the existing integration.
4. Keep provider keys server-side and redact them from logs.
5. Add tests for provider errors, rate limits, oversized responses, malformed results, partial results, and source URL preservation.
6. Do not replace Tavily or add another web-search provider without a separate owner decision.

The prior source-only audit did not locate Tavily by text search. That search result is not evidence that the live integration is absent. Runtime/configuration tracing is an implementation investigation item.

## 4. Streaming versus batching

These mechanisms serve different purposes and must not be conflated:

- **Streaming** improves time-to-first-token and incremental delivery of the coding model's response.
- **Chunking** makes large inputs manageable and traceable.
- **Batching** groups related inputs for efficient analysis.
- **Buffering** holds only the bounded data needed to parse, combine, persist, or recover.
- **Asynchronous processing** is for work that should outlive a single interactive response or needs durable background execution.

For an interactive coding task, prepare the necessary context first, then stream the coding response immediately. Do not wait for all unrelated optional analysis to finish if the workflow can safely proceed without it. For large research or image collections, process bounded batches and clearly report progress/partial completion.

## 5. Cloudflare Worker and CPU constraints

- Cloudflare Free Worker CPU limits apply to CPU consumed by the Worker code, not simply to elapsed time spent waiting for an external provider response.
- Measure CPU time and wall-clock/provider latency separately.
- Separate Workers and Service Bindings may isolate responsibilities, but they do not automatically increase the CPU budget for an individual request or multiply account-level Workers AI quotas.
- Offload only work that benefits from isolation, concurrency, or asynchronous execution. Avoid adding Workers as a substitute for profiling and optimizing the current pipeline.
- Use a durable asynchronous mechanism only when the task lifecycle requires work to survive the interactive request; select it through measured evidence and the existing architecture decisions.

## 6. Intended implementation sequence

The implementation plan tracks these as five bounded stages, in this order:

1. **Native streaming path:** connect provider streaming to the controller, Worker SSE, and frontend; preserve tool-call correctness and persistence.
2. **Context processing:** add bounded logical chunking, filtering, batching, provenance, and explicit partial-result handling for existing tool results and Tavily results.
3. **Reliability and observability:** bounded concurrency, retry/timeout/cancellation behavior, structured timings and payload metrics, and regression tests.
4. **Tavily verification and integration reconciliation:** trace the existing working request path and configuration, add focused tests and result processing without replacing the integration.
5. **Image Intelligence Worker:** only after image upload/model requirements are agreed; add verified Groq/Cloudflare model routing, batching, and partial-failure behavior without changing the existing core worker unnecessarily.

These are implementation stages, not claims of completed work. Each stage must have its own acceptance gate and should not begin until the preceding stage's required tests pass.

## 7. Verification checklist

Before marking any stage complete:
- Inspect current main SHA, actual implementation, tests, provider configuration shape, and existing Tavily path.
- Add tests for normal, oversized, malformed, delayed, failed, rate-limited, cancelled, and partial-result cases as relevant.
- Run focused tests, typecheck, build, Worker tests, and CI where available; record exact commands and results.
- Inspect the diff for security, context-loss, duplication, and architecture regressions.
- Test real provider behavior only where credentials/environment are available; never print secrets.
- Distinguish source inspection, automated testing, owner-reported live verification, and independently observed live verification.
- Do not deploy production without explicit owner authorization.
