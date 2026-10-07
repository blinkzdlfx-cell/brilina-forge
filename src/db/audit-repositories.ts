import { getSql } from "./client.js";
import type { RunStatus, ToolStatus } from "../agent/types.js";

export type RunAuditRecord = {
  id: string;
  conversationId: string;
  status: RunStatus;
  provider: string | null;
  model: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
  toolCalls: Array<{
    id: string;
    toolName: string;
    status: ToolStatus;
    arguments: unknown;
    result: unknown;
    errorMessage: string | null;
    startedAt: string | null;
    finishedAt: string | null;
  }>;
};

/**
 * Reads one run with its tool-call audit trail. Ownership is enforced by the
 * caller joining on user and workspace; this query is scoped by conversation so
 * it can never return a run from another conversation.
 */
export async function getRunAudit(
  runId: string,
  conversationId: string
): Promise<RunAuditRecord | undefined> {
  const sql = getSql();
  const runs = (await sql.query(
    `SELECT id, conversation_id, status, provider, model, started_at, finished_at, error_message, created_at
       FROM runs WHERE id = $1 AND conversation_id = $2 LIMIT 1`,
    [runId, conversationId]
  )) as Record<string, unknown>[];
  if (!runs[0]) return undefined;

  const tools = (await sql.query(
    `SELECT id, tool_name, status, arguments, result, error_message, started_at, finished_at
       FROM tool_calls WHERE run_id = $1 ORDER BY created_at ASC LIMIT 200`,
    [runId]
  )) as Record<string, unknown>[];

  const row = runs[0];
  return {
    id: String(row.id),
    conversationId: String(row.conversation_id),
    status: String(row.status) as RunStatus,
    provider: row.provider === null ? null : String(row.provider),
    model: row.model === null ? null : String(row.model),
    startedAt: row.started_at ? new Date(String(row.started_at)).toISOString() : null,
    finishedAt: row.finished_at ? new Date(String(row.finished_at)).toISOString() : null,
    errorMessage: row.error_message === null ? null : String(row.error_message),
    createdAt: new Date(String(row.created_at)).toISOString(),
    toolCalls: tools.map(tool => ({
      id: String(tool.id),
      toolName: String(tool.tool_name),
      status: String(tool.status) as ToolStatus,
      arguments: tool.arguments ?? {},
      result: tool.result ?? null,
      errorMessage: tool.error_message === null ? null : String(tool.error_message),
      startedAt: tool.started_at ? new Date(String(tool.started_at)).toISOString() : null,
      finishedAt: tool.finished_at ? new Date(String(tool.finished_at)).toISOString() : null
    }))
  };
}

export async function listRunsForConversation(
  conversationId: string,
  limit = 20
): Promise<Array<{ id: string; status: RunStatus; provider: string | null; model: string | null; createdAt: string }>> {
  const rows = (await getSql().query(
    `SELECT id, status, provider, model, created_at FROM runs
      WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [conversationId, Math.min(Math.max(limit, 1), 100)]
  )) as Record<string, unknown>[];

  return rows.map(row => ({
    id: String(row.id),
    status: String(row.status) as RunStatus,
    provider: row.provider === null ? null : String(row.provider),
    model: row.model === null ? null : String(row.model),
    createdAt: new Date(String(row.created_at)).toISOString()
  }));
}