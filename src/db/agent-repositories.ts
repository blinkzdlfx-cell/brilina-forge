import { getSql } from "./client.js";
import type { AgentAuditStore, RunRecord, RunStatus, ToolStatus } from "../agent/types.js";

export const neonAgentAuditStore: AgentAuditStore = {
  async createRun(input): Promise<RunRecord> {
    const rows = (await getSql().query(
      "INSERT INTO runs (conversation_id, user_id, status) VALUES ($1, $2, 'queued') RETURNING id, status",
      [input.conversationId, input.userId]
    )) as Record<string, unknown>[];
    if (!rows[0]) throw new Error("Failed to create agent run");
    return { id: String(rows[0].id), status: String(rows[0].status) as RunStatus };
  },
  async updateRun(id, status, errorMessage) {
    await getSql().query(
      "UPDATE runs SET status = $1, started_at = CASE WHEN $1 = 'running' AND started_at IS NULL THEN now() ELSE started_at END, finished_at = CASE WHEN $1 IN ('completed','failed','cancelled','interrupted') THEN now() ELSE finished_at END, error_message = $2 WHERE id = $3",
      [status, errorMessage ?? null, id]
    );
  },
  async createToolCall(input) {
    const rows = (await getSql().query(
      "INSERT INTO tool_calls (run_id, tool_name, status, arguments) VALUES ($1, $2, 'requested', $3::jsonb) RETURNING id",
      [input.runId, input.toolName, JSON.stringify(input.arguments)]
    )) as Record<string, unknown>[];
    if (!rows[0]) throw new Error("Failed to create tool call");
    return String(rows[0].id);
  },
  async updateToolCall(id, status: ToolStatus, result, errorMessage) {
    await getSql().query(
      "UPDATE tool_calls SET status = $1, result = $2::jsonb, error_message = $3, started_at = CASE WHEN $1 = 'running' AND started_at IS NULL THEN now() ELSE started_at END, finished_at = CASE WHEN $1 IN ('completed','failed','rejected') THEN now() ELSE finished_at END WHERE id = $4",
      [status, result === undefined ? null : JSON.stringify(result), errorMessage ?? null, id]
    );
  }
};
