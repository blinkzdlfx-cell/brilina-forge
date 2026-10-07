import type { AgentModel, ModelDecision, ModelInput } from "../agent/types.js";
import { withCooldownRetry, type RetryOptions } from "./retry.js";
import { AiProviderError } from "./types.js";

/**
 * Wraps a provider-backed AgentModel with cooldown retry. The wrapper is
 * provider-agnostic: it only reacts to normalized AiProviderError values, so
 * provider SDK code never reaches the Agent Controller.
 */
export function wrapWithCooldownRetry(
  model: AgentModel,
  options: Partial<RetryOptions> = {},
  onRetry?: (attempt: { attempt: number; kind: string; delayMs: number }) => void
): AgentModel {
  return {
    async next(input: ModelInput): Promise<ModelDecision> {
      const { value } = await withCooldownRetry(
        () => model.next(input),
        options,
        attempt => onRetry?.({ attempt: attempt.attempt, kind: attempt.error.details.kind, delayMs: attempt.delayMs })
      );
      return value;
    }
  };
}

export function isProviderFailure(error: unknown): error is AiProviderError {
  return error instanceof AiProviderError;
}