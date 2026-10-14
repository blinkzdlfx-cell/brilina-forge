> **Historical implementation note:** This file uses the previous internal phase numbering and records past implementation work. It is not the current five-phase product roadmap. Follow [the current roadmap](ROADMAP.md) and [current-state ledger](CURRENT_STATE_AND_CONTINUATION.md) for delivery order and verified status. A historical 'complete' label does not prove live verification.

# Brilina Forge — Phase 5 AI provider

Status: **complete in code; adapter unit-tested only, no live provider key used**

## Completed

- `AiProvider` / `AiModelResult` / `AiStreamEvent` / `AiProviderError` contracts
- OpenAI-compatible `chat/completions` adapter with SSE streaming and tool-call reassembly across chunk indices
- usage normalization
- HTTP status classification into retryable and terminal kinds
- `Retry-After` and `x-ratelimit-*` parsing (seconds, HTTP-date, durations, epochs)
- cooldown retry honoring provider-supplied retry-after with exponential fallback and a cap
- `ProviderModelRegistry`
- `ProviderAgentModel` adapter onto the controller's `AgentModel` contract
- `DeterministicDevelopmentProvider` retained as the keyless development adapter
- `createProviderRuntime` with key-gated activation
- `runs.provider` / `runs.model` recorded per run
- `usage_records` written per run

## Honest caveats

- The adapter has never been run against a real provider endpoint. All evidence is unit tests against recorded/faked response shapes.
- The deterministic adapter remains the active model unless `AI_PROVIDER_API_KEY` is set. That is intentional, not a defect.
- There is no cost estimation: `usage_records.estimated_cost_usd` is left null.
- Token accounting falls back to message-length heuristics when the provider does not return usage.

## Contract

```
createProviderRuntime()
  → DeterministicDevelopmentProvider always registered
  → OpenAiCompatibleProvider registered only when AI_PROVIDER_API_KEY is set
  → ProviderModelRegistry resolves model → provider
  → ProviderAgentModel adapts AiProvider to the AgentModel contract
  → wrapWithCooldownRetry adds provider-aware cooldown retry
```