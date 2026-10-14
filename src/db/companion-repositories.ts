import { getSql } from "./client.js";

export type CompanionWorkStatus = "pending" | "completed" | "failed" | "timed_out";

export type CompanionWorkResult = {
  id: string;
  deviceId: string;
  runId: string;
  conversationId: string;
  command: string;
  status: CompanionWorkStatus;
  exitCode: number | null;
  output: string;
  truncated: boolean;
  errorMessage: string | null;
  createdAt: number;
  completedAt: number | null;
};

export type CreateCompanionWorkInput = {
  id: string;
  deviceId: string;
  runId: string;
  conversationId: string;
  command: string;
  timeoutMs: number;
};

/**
 * Durable companion work results. Cloudflare Workers are short-lived
 * isolates, so results are stored in Neon rather than in-isolate memory: the
 * isolate that receives the companion's result POST is rarely the same one
 * the browser polls from.
 */
export async function createCompanionWork(input: CreateCompanionWorkInput): Promise<CompanionWorkResult> {
  const rows = (await getSql().query(
    `INSERT INTO companion_work_results (id, device_id, run_id, conversation_id, command, status)
     VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING *`,
    [input.id, input.deviceId, input.runId, input.conversationId, input.command]
  )) as Record<string, unknown>[];
  if (!rows[0]) throw new Error("Failed to create companion work result");
  return mapWorkResult(rows[0]);
}

export async function completeCompanionWork(
  id: string,
  outcome: { exitCode: number | null; output: string; truncated: boolean; errorMessage?: string }
): Promise<CompanionWorkResult | undefined> {
  const status: CompanionWorkStatus = outcome.errorMessage ? "failed" : "completed";
  const rows = (await getSql().query(
    `UPDATE companion_work_results
      SET status = $1, exit_code = $2, output = $3, truncated = $4, error_message = $5, completed_at = now()
      WHERE id = $6 AND status = 'pending' RETURNING *`,
    [status, outcome.exitCode, outcome.output, outcome.truncated, outcome.errorMessage ?? null, id]
  )) as Record<string, unknown>[];
  return rows[0] ? mapWorkResult(rows[0]) : undefined;
}

export async function timeoutStaleCompanionWork(deviceId: string, olderThanMs: number): Promise<number> {
  const cutoff = Date.now() - olderThanMs;
  const result = await getSql().query(
    `UPDATE companion_work_results
      SET status = 'timed_out', completed_at = now()
      WHERE device_id = $1 AND status = 'pending' AND created_at < $2`,
    [deviceId, new Date(cutoff).toISOString()]
  );
  return (result as unknown as { count?: number }).count ?? 0;
}

export async function getCompanionWork(id: string): Promise<CompanionWorkResult | undefined> {
  const rows = (await getSql().query(
    "SELECT * FROM companion_work_results WHERE id = $1 LIMIT 1",
    [id]
  )) as Record<string, unknown>[];
  return rows[0] ? mapWorkResult(rows[0]) : undefined;
}

export async function listPendingCompanionWork(deviceId: string, limit = 10): Promise<CompanionWorkResult[]> {
  const rows = (await getSql().query(
    `SELECT * FROM companion_work_results
      WHERE device_id = $1 AND status = 'pending'
      ORDER BY created_at ASC LIMIT $2`,
    [deviceId, limit]
  )) as Record<string, unknown>[];
  return rows.map(mapWorkResult);
}

function mapWorkResult(row: Record<string, unknown>): CompanionWorkResult {
  return {
    id: String(row.id),
    deviceId: String(row.device_id),
    runId: String(row.run_id),
    conversationId: String(row.conversation_id),
    command: String(row.command),
    status: String(row.status) as CompanionWorkStatus,
    exitCode: row.exit_code === null ? null : Number(row.exit_code),
    output: String(row.output ?? ""),
    truncated: Boolean(row.truncated),
    errorMessage: row.error_message === null ? null : String(row.error_message),
    createdAt: new Date(String(row.created_at)).getTime(),
    completedAt: row.completed_at ? new Date(String(row.completed_at)).getTime() : null
  };
}