import { getSql } from "./client.js";
import type { AiProviderId, AiUsage } from "../ai/types.js";

export type UsageRecordInput = {
  runId: string;
  provider: AiProviderId;
  model: string;
  usage: AiUsage;
  durationMs: number;
  retryCount: number;
  status: "success" | "failed" | "cancelled";
  estimatedCostUsd?: number;
};

export async function recordUsage(input: UsageRecordInput): Promise<void> {
  await getSql().query(
    "INSERT INTO usage_records (run_id, provider, model, input_tokens, output_tokens, estimated_cost_usd, duration_ms, retry_count, status) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)",
    [
      input.runId,
      input.provider,
      input.model,
      input.usage.inputTokens,
      input.usage.outputTokens,
      input.estimatedCostUsd ?? null,
      Math.round(input.durationMs),
      input.retryCount,
      input.status
    ]
  );
}