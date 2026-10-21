# Next Kilo Code Task — AI Pipeline Batch 2: Context, Reliability, Observability, and Image Intelligence

**Task:** Implement Batch 2 from `docs/AI_PIPELINE_BATCH_PLAN.md`. Batch 1 native streaming is implemented and its CI verification job passed. Keep Tavily completely unchanged; it remains Batch 3 and must be last.

## Read first
1. `README.md`
2. `docs/PRODUCT_SPEC.md`
3. `docs/IMPLEMENTATION_PLAN.md`
4. `docs/AI_PIPELINE_REQUIREMENTS.md`
5. `docs/AI_PIPELINE_BATCH_PLAN.md`
6. `docs/AGENT_WORKFLOW.md`
7. Current tool-result/context code, provider retry wrapper, Worker execution/observability, image input paths, configuration, tests, and current `main` head.

## Before editing
- Confirm exact HEAD and current CI evidence; preserve unrelated work.
- Trace existing context construction, result limits, provider retries, cancellation, Worker logging, image ingestion, and configured provider contracts.
- Provide a short file-level implementation plan and acceptance criteria before source changes.
- Do not inspect, modify, replace, or duplicate Tavily in this batch.
- Do not add dependencies, a new Worker, schema changes, secrets, or production deployment without evidence and authorization.

## Batch 2 scope
### A. Bounded context processing
- Replace unsafe prefix-only loss for oversized tool results with explicit bounded/chunked representations.
- Preserve semantic/source identity (file path, URL, item ID, image index, etc.), ordering, truncation status, and partial-failure markers.
- Deduplicate repeated records where stable identifiers exist; do not use speculative relevance scoring that can discard necessary evidence.
- Keep original user intent, tool-call/result pairing, and immutable repository/branch run context intact.
- Add tests for oversized results, item ordering, provenance, duplicate records, and partial results.

### B. Reliability and observability
- Audit existing retry/timeout/cancellation paths before changing them.
- Apply bounded concurrency and total-work limits where actual fan-out exists.
- Preserve completed work after partial failures; prevent retries from repeating unsafe side effects.
- Add structured, redacted stage timing/payload/outcome fields where they can be measured.
- Keep Worker CPU time distinct from total request duration and provider latency.
- Add deterministic tests for timeout, 429, 5xx, malformed response, cancellation, partial failure, and redaction.

### C. Image intelligence
- Verify model availability, request format, image count, image size, and quota limits from current provider documentation before configuring routes.
- Current research found Groq documents `qwen/qwen3.8-27b` as a vision model supporting up to 3 images/request and a 20 MB image-URL request limit. Groq marks `qwen/qwen3.6-27b` deprecated for free/developer tiers in favor of Qwen 3.8. Do not make Qwen 3.6 the default.
- Cloudflare documents `@cf/meta/llama-3.2-11b-vision-instruct`, but no verified maximum images per request was located. Until a hard maximum is documented, use one image per request with bounded batches rather than inventing a larger limit.
- Do not invent a second active Groq vision model. If no second currently supported Groq vision model is verified, record that constraint and stop only the second-model routing decision for owner input; continue other Batch 2 work.
- Keep provider keys server-side; batch outputs must preserve image index, provider/model provenance, uncertainty, and partial-failure status.
- Do not create a dedicated Worker unless architecture/measurements justify it; a Worker does not multiply account-level Workers AI quota.

## Acceptance and handoff
- Run focused tests, `npm run build`, `npm run typecheck:phase1`, `npm run test:phase1`, `npm run test:worker`, Wrangler dry-run, and available CI.
- Record exact commands/results, changed files, commit SHA, remaining model-selection constraint, and the separate pre-existing web dependency audit issue.
- No production deployment.
- Do not begin Batch 3 or touch Tavily until Batch 2 has an explicit handoff and acceptance evidence.
