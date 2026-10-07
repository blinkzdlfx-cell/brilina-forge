import { AiProviderError, type AiProviderErrorKind, type AiProviderErrorDetails, type AiProviderId } from "./types.js";

export function classifyHttpStatus(provider: AiProviderId, model: string, status: number, retryAfterMs: number | undefined): AiProviderErrorDetails {
  const kind: AiProviderErrorKind =
    status === 401 || status === 403 ? "authentication"
      : status === 429 ? "rate_limited"
        : status === 529 || status === 503 ? "overloaded"
          : status === 400 || status === 404 || status === 422 ? "invalid_request"
            : status === 408 || status === 504 ? "timeout"
              : status >= 500 ? "server_error"
                : "transport";

  return {
    provider,
    model,
    kind,
    retryable: kind === "rate_limited" || kind === "overloaded" || kind === "timeout" || kind === "server_error",
    retryAfterMs,
    message: `AI provider request failed with status ${status} (${kind})`
  };
}

export function parseRetryAfterMs(headers: Headers, now: number): number | undefined {
  const retryAfter = headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) return Math.round(seconds * 1000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - now);
  }

  const reset = headers.get("x-ratelimit-reset-requests") ?? headers.get("x-ratelimit-reset");
  if (reset) {
    const duration = /^([\d.]+)(ms|s|m|h)$/.exec(reset.trim());
    if (duration) {
      const value = Number(duration[1]);
      const unit = duration[2];
      const multiplier = unit === "ms" ? 1 : unit === "s" ? 1000 : unit === "m" ? 60_000 : 3_600_000;
      return Math.round(value * multiplier);
    }
    const epoch = Number(reset);
    if (Number.isFinite(epoch)) return Math.max(0, epoch * 1000 - now);
  }

  return undefined;
}

export function transportError(provider: AiProviderId, model: string, cause: unknown): AiProviderError {
  const message = cause instanceof Error ? cause.message : "AI provider request failed before a response was received";
  return new AiProviderError({
    provider,
    model,
    kind: "transport",
    retryable: true,
    message
  });
}

export function emptyUsage() {
  return { inputTokens: 0, outputTokens: 0 };
}