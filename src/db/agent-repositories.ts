import { getSql } from "./client.js";
import { redactSecrets, redactValue } from "../security/redact.js";
import type { AgentAuditStore, RunRecord, RunStatus, ToolStatus } from "../agent/types.js";

export const neonAgentAuditStore: AgentAuditStore & { updateRunProvider(id: string, provider: string, model: string): Promise<void> } = {
  async createRun(input): Promise<RunRecord> {
    const rows = (await getSql().query(
      "INSERT INTO runs (conversation_id, user_id, status, repository_full_name_snapshot, branch_name_snapshot, github_connection_id_snapshot, github_app_installation_id_snapshot, github_context_type_snapshot) SELECT c.id, c.user_id, 'queued', CASE WHEN c.github_context_type = 'installation' THEN ir.full_name ELSE r.github_full_name END, c.branch_name, CASE WHEN c.github_context_type = 'oauth' THEN r.github_connection_id ELSE NULL END, c.github_app_installation_id, c.github_context_type FROM conversations c LEFT JOIN repositories r ON r.id = c.repository_id LEFT JOIN github_installation_repositories ir ON ir.id = c.github_installation_repository_id AND ir.installation_record_id = c.github_app_installation_id LEFT JOIN github_app_installations i ON i.id = c.github_app_installation_id LEFT JOIN github_installation_access a ON a.installation_record_id = i.id AND a.user_id = c.user_id AND a.revoked_at IS NULL WHERE c.id = $1 AND c.user_id = $2 AND (c.github_context_type = 'oauth' OR (c.github_context_type = 'installation' AND i.suspended_at IS NULL AND i.uninstalled_at IS NULL AND a.id IS NOT NULL AND ir.id IS NOT NULL)) RETURNING id, status",
      [input.conversationId, input.userId]
    )) as Record<string, unknown>[];
    if (!rows[0]) throw new Error("Failed to create agent run");
    return { id: String(rows[0].id), status: String(rows[0].status) as RunStatus };
  },
  async updateRun(id, status, errorMessage) {
    await getSql().query(
      "UPDATE runs SET status = $1, started_at = CASE WHEN $1 = 'running' AND started_at IS NULL THEN now() ELSE started_at END, finished_at = CASE WHEN $1 IN ('completed','failed','cancelled','interrupted') THEN now() ELSE finished_at END, error_message = $2 WHERE id = $3",
      [status, errorMessage ? redactSecrets(errorMessage, 2000) : null, id]
    );
  },
  async createToolCall(input) {
    const rows = (await getSql().query(
      "INSERT INTO tool_calls (run_id, tool_name, status, arguments) VALUES ($1, $2, 'requested', $3::jsonb) RETURNING id",
      [input.runId, input.toolName, JSON.stringify(redactValue(input.arguments))]
    )) as Record<string, unknown>[];
    if (!rows[0]) throw new Error("Failed to create tool call");
    return String(rows[0].id);
  },
  async updateToolCall(id, status: ToolStatus, result, errorMessage) {
    await getSql().query(
      "UPDATE tool_calls SET status = $1, result = $2::jsonb, error_message = $3, started_at = CASE WHEN $1 = 'running' AND started_at IS NULL THEN now() ELSE started_at END, finished_at = CASE WHEN $1 IN ('completed','failed','rejected') THEN now() ELSE finished_at END WHERE id = $4",
      [
        status,
        result === undefined ? null : JSON.stringify(redactValue(result)),
        errorMessage ? redactSecrets(errorMessage, 2000) : null,
        id
      ]
    );
  },
  async updateRunProvider(id, provider, model) {
    await getSql().query(
      "UPDATE runs SET provider = $1, model = $2 WHERE id = $3",
      [provider, model, id]
    );
  }
};

export async function getRunContextSnapshot(runId: string, conversationId: string): Promise<{
  repositoryFullName: string | null; branchName: string | null; githubConnectionId: string | null;
  installationRecordId: string | null; contextType: "oauth" | "installation" | null;
} | undefined> {
  const rows = await getSql().query(
    "SELECT repository_full_name_snapshot, branch_name_snapshot, github_connection_id_snapshot, github_app_installation_id_snapshot, github_context_type_snapshot FROM runs WHERE id = $1 AND conversation_id = $2 LIMIT 1",
    [runId, conversationId]
  ) as Record<string, unknown>[];
  if (!rows[0]) return undefined;
  return {
    repositoryFullName: rows[0].repository_full_name_snapshot == null ? null : String(rows[0].repository_full_name_snapshot),
    branchName: rows[0].branch_name_snapshot == null ? null : String(rows[0].branch_name_snapshot),
    githubConnectionId: rows[0].github_connection_id_snapshot == null ? null : String(rows[0].github_connection_id_snapshot),
    installationRecordId: rows[0].github_app_installation_id_snapshot == null ? null : String(rows[0].github_app_installation_id_snapshot),
    contextType: rows[0].github_context_type_snapshot == null ? null : String(rows[0].github_context_type_snapshot) as "oauth" | "installation"
  };
}
