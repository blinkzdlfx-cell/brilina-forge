import { AiProviderError } from "./types.js";

export type RetryOptions = {
  maxAttempts: number;
  maxCooldownMs: number;
  baseDelayMs: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

export type RetryAttempt = { attempt: number; error: AiProviderError; delayMs: number; waited: boolean };

const DEFAULTS: RetryOptions = {
  maxAttempts: 3,
  maxCooldownMs: 30_000,
  baseDelayMs: 500
};

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));

export function cooldownFor(error: AiProviderError, attempt: number, options: RetryOptions): number {
  if (error.details.retryAfterMs !== undefined) {
    return Math.min(Math.max(0, error.details.retryAfterMs), options.maxCooldownMs);
  }
  const exponential = options.baseDelayMs * 2 ** (attempt - 1);
  return Math.min(exponential, options.maxCooldownMs);
}

export async function withCooldownRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: Partial<RetryOptions> = {},
  onRetry?: (attempt: RetryAttempt) => void
): Promise<{ value: T; retries: number }> {
  const settings = { ...DEFAULTS, ...options };
  const sleep = settings.sleep ?? defaultSleep;
  let retries = 0;

  for (let attempt = 1; attempt <= settings.maxAttempts; attempt++) {
    try {
      return { value: await operation(attempt), retries };
    } catch (error) {
      if (!(error instanceof AiProviderError) || !error.details.retryable || attempt === settings.maxAttempts) {
        throw error;
      }
      retries += 1;
      const delayMs = cooldownFor(error, attempt, settings);
      onRetry?.({ attempt, error, delayMs, waited: true });
      await sleep(delayMs);
    }
  }

  throw new Error("Retry loop exited without a result");
}