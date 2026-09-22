import { getSql } from "./client.js";

export type ForgeConversation = {
  id: string;
  title: string | null;
  repositoryId: string | null;
  branchName: string | null;
  updatedAt: string;
};

export async function getForgeUserContext(githubUserId: number): Promise<{ userId: string; workspaceId: string }> {
  const rows = (await getSql().query(
    "SELECT u.id AS user_id, w.id AS workspace_id FROM forge_users u JOIN workspaces w ON w.owner_user_id = u.id WHERE u.github_user_id = $1 LIMIT 1",
    [githubUserId]
  )) as Record<string, unknown>[];
  if (!rows[0]) throw new Error("Forge workspace not initialized for this GitHub account");
  return { userId: String(rows[0].user_id), workspaceId: String(rows[0].workspace_id) };
}

export async function listConversations(userId: string, workspaceId: string): Promise<ForgeConversation[]> {
  const rows = (await getSql().query(
    "SELECT id, title, repository_id, branch_name, updated_at FROM conversations WHERE user_id = $1 AND workspace_id = $2 ORDER BY updated_at DESC LIMIT 100",
    [userId, workspaceId]
  )) as Record<string, unknown>[];

  return rows.map(row => ({
    id: String(row.id),
    title: row.title === null ? null : String(row.title),
    repositoryId: row.repository_id === null ? null : String(row.repository_id),
    branchName: row.branch_name === null ? null : String(row.branch_name),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  }));
}

export async function createConversation(input: {
  userId: string;
  workspaceId: string;
  title?: string;
  repositoryId?: string;
  branchName?: string;
}): Promise<ForgeConversation> {
  const rows = (await getSql().query(
    "INSERT INTO conversations (workspace_id, user_id, repository_id, branch_name, title) VALUES ($1, $2, $3, $4, $5) RETURNING id, title, repository_id, branch_name, updated_at",
    [input.workspaceId, input.userId, input.repositoryId ?? null, input.branchName ?? null, input.title ?? "New conversation"]
  )) as Record<string, unknown>[];
  if (!rows[0]) throw new Error("Failed to create conversation");

  const row = rows[0];
  return {
    id: String(row.id),
    title: row.title === null ? null : String(row.title),
    repositoryId: row.repository_id === null ? null : String(row.repository_id),
    branchName: row.branch_name === null ? null : String(row.branch_name),
    updatedAt: new Date(String(row.updated_at)).toISOString()
  };
}

export async function getConversationForUser(id: string, userId: string, workspaceId: string): Promise<{
  id: string;
  userId: string;
  workspaceId: string;
  repositoryId: string | null;
  branchName: string | null;
} | undefined> {
  const rows = (await getSql().query(
    "SELECT id, user_id, workspace_id, repository_id, branch_name FROM conversations WHERE id = $1 AND user_id = $2 AND workspace_id = $3 LIMIT 1",
    [id, userId, workspaceId]
  )) as Record<string, unknown>[];
  if (!rows[0]) return undefined;
  return {
    id: String(rows[0].id),
    userId: String(rows[0].user_id),
    workspaceId: String(rows[0].workspace_id),
    repositoryId: rows[0].repository_id === null ? null : String(rows[0].repository_id),
    branchName: rows[0].branch_name === null ? null : String(rows[0].branch_name)
  };
}
