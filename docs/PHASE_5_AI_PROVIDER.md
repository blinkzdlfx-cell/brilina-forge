# Phase 5 — AI Provider Abstraction

## Status

Implemented in code. The adapter has never been run against a live provider endpoint.

## Purpose

Give the Agent Controller a real model behind a provider-neutral contract, without letting provider concerns leak into the controller.

## Scope

- provider contracts and normalized result types
- one OpenAI-compatible adapter with streaming
- model registry
- error classification, rate-limit handling and cooldown retry
- usage extraction and persistence
- key-gated activation with a deterministic fallback

## Module map

| File | Responsibility |
|---|---|
| `src/ai/types.ts` | `AiProvider`, `AiProviderError` with classified kinds, `AiMessage`, `AiStreamEvent`, `AiModelResult`, `AiModelDescriptor` |
| `src/ai/errors.ts` | `classifyHttpStatus`, `parseRetryAfterMs`, `transportError` |
| `src/ai/openai-compatible.ts` | `OpenAiCompatibleProvider` — `chat/completions`, SSE streaming, tool-call reassembly |
| `src/ai/registry.ts` | `ProviderModelRegistry` — model descriptor to provider resolution |
| `src/ai/retry.ts` | `withCooldownRetry`, `cooldownFor` |
| `src/ai/retry-model.ts` | `wrapWithCooldownRetry` — wraps any `AgentModel` with provider-aware retry |
| `src/ai/provider-model.ts` | `ProviderAgentModel`, `toAiMessages`, `toDecision` |
| `src/ai/deterministic.ts` | `DeterministicDevelopmentProvider` |
| `src/ai/factory.ts` | `createProviderRuntime` — key-gated activation |

## Provider contract

```ts
type AiProvider = {
  readonly id: AiProviderId;
  readonly models: AiModelDescriptor[];
  complete(request: AiModelRequest, model: string): Promise<AiModelResult>;
  stream(request: AiModelRequest, model: string): AsyncIterable<AiStreamEvent>;
};
```

`AiStreamEvent` is one of `text_delta`, `tool_call`, `usage`, `done`. `AiModelResult` carries normalized content, tool calls, usage, provider and model. The controller never sees any of these types: `ProviderAgentModel` converts `AiModelResult` into the controller's `ModelDecision`.

## Activation

```text
AI_PROVIDER_API_KEY unset  → DeterministicDevelopmentProvider, model forge-deterministic
AI_PROVIDER_API_KEY set   → OpenAiCompatibleProvider added, active model = AI_PROVIDER_MODEL
```

| Variable | Default | Purpose |
|---|---|---|
| `AI_PROVIDER_BASE_URL` | `https://api.openai.com/v1` | Endpoint base; any OpenAI-compatible `/chat/completions` service works |
| `AI_PROVIDER_MODEL` | `gpt-4o-mini` | Model id sent to the provider |
| `AI_PROVIDER_API_KEY` | — | Activation switch. Empty keeps the deterministic adapter |
| `AI_PROVIDER_TIMEOUT_MS` | `120000` | Per-request timeout via `AbortSignal.timeout` |

The absence of a key is not an error state. The deterministic adapter is real, unit-tested code that keeps CI and local development free and deterministic; it is simply not a production AI implementation.

## Error classification

`classifyHttpStatus` maps an HTTP status to a kind, and only some kinds are retryable:

| Status | Kind | Retryable |
|---|---|---|
| 401, 403 | `authentication` | no |
| 429 | `rate_limited` | yes |
| 503, 529 | `overloaded` | yes |
| 400, 404, 422 | `invalid_request` | no |
| 408, 504 | `timeout` | yes |
| ≥500 | `server_error` | yes |
| otherwise | `transport` | yes |

`parseRetryAfterMs` understands `Retry-After` as seconds or as an HTTP-date, then `x-ratelimit-reset-requests` / `x-ratelimit-reset` as a duration (`1.5s`, `250ms`, `2m`, `1h`) or as a Unix epoch.

Timeouts surface as `kind: "timeout"`; a fetch failure before any response surfaces as `kind: "transport"`. Neither error message ever contains the API key.

## Retry

`withCooldownRetry` retries only retryable `AiProviderError` values:

- if the provider supplied `retryAfterMs`, wait that long, clamped to `maxCooldownMs` (default 30 s)
- otherwise exponential backoff from `baseDelayMs` (default 500 ms), also clamped
- at most `maxAttempts` (default 3)
- non-provider errors are never retried

`wrapWithCooldownRetry` applies this to the controller's `AgentModel` contract, so retry policy stays out of the controller. The run handler counts retries into `usage_records.retry_count` and logs each attempt.

## Streaming

`OpenAiCompatibleProvider.stream` reads the SSE body incrementally and reassembles tool calls by `index`: the id and name arrive once, arguments arrive in fragments, and a complete `AiToolCall` is emitted once the stream ends. Usage is normalized from `usage.prompt_tokens` / `usage.completion_tokens`.

Note that the live run path currently calls `complete`, not `stream`: assistant text is chunked into `assistant.delta` events after the response is produced. Streaming provider output straight to SSE is future work.

## Persistence

- `runs.provider` and `runs.model` are written by `updateRunProvider` once the runtime resolves the active model for the run.
- A `usage_records` row is written per run through `src/db/usage-repositories.ts`, including on the failure path. A failure to record usage never fails the run.
- When the provider reports no usage, a message-length estimate is recorded. `estimated_cost_usd` is always null; no cost model exists.

## Cancellation

The run's `AbortSignal` is passed into the model and composed with the timeout via `AbortSignal.any`, so `POST /api/runs/:runId/cancel` interrupts an in-flight provider request as well as being checked at controller step boundaries.

## Out of scope

- non-OpenAI-compatible provider SDKs
- prompt caching, cost modelling, model capability routing
- streaming assistant text directly to SSE

## Acceptance

Automated: `src/ai/openai-compatible.test.ts`, `src/ai/retry.test.ts`, `src/ai/provider-model.test.ts`.

**Not accepted:** no live provider key has ever been configured for this work. Streaming tool calls, real rate-limit headers and real timeout behaviour against a live endpoint remain unverified.

## Remaining work

- live verification against a real OpenAI-compatible endpoint
- stream provider output directly to SSE instead of chunking a completed response
- per-model capability checks against `AiModelDescriptor` (context window, tool support)
- token counting and cost estimation
- additional providers registered in `createProviderRuntime`
