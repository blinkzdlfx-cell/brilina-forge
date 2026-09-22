import { getSql } from "./client.js";

export type ForgeRepository = {
  id: string;
  githubNodeId: string;
  name: string;
  fullName: string;
  owner: string;
  defaultBranch: string;
};

export type ForgeConversation = {
  id: string;
  title: string | null;
  repositoryId: string | null;
  repositoryFullName: string | null;
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

export async function syncRepository(input: {
  userId: string;
  workspaceId: string;
  githubId: number;
  owner: string;
  name: string;
  fullName: string;
  defaultBranch: string;
}): Promise<ForgeRepository> {
  const rows = (await getSql().query(
    "INSERT INTO repositories (workspace_id, github_connection_id, github_node_id, github_owner, github_name, github_full_name, default_branch) SELECT $1, c.id, $2, $3, $4, $5, $6 FROM github_connections c WHERE c.user_id = $7 ON CONFLICT (workspace_id, github_node_id) DO UPDATE SET github_owner = EXCLUDED.github_owner, github_name = EXCLUDED.github_name, github_full_name = EXCLUDED.github_full_name, default_branch = EXCLUDED.default_branch, updated_at = now() RETURNING id, github_node_id, github_owner, github_name, github_full_name, default_branch",
    [
      input.workspaceId,
      String(input.githubId),
      input.owner,
      input.name,
      input.fullName,
      input.defaultBranch,
      input.userId
    ]
  )) as Record<string, unknown>[];

  if (!rows[0]) throw new Error("GitHub connection not found for Forge workspace");

  return {
    id: String(rows[0].id),
    githubNodeId: String(rows[0].github_node_id),
    name: String(rows[0].github_name),
    fullName: String(rows[0].github_full_name),
    owner: String(rows[0].github_owner),
    defaultBranch: String(rows[0].default_branch)
  };
}

export async function listConversations(userId: string, workspaceId: string): Promise<ForgeConversation[]> {
  const rows = (await getSql().query(
    "SELECT c.id, c.title, c.repository_id, c.branch_name, r.github_full_name AS repository_full_name, c.updated_at FROM conversations c LEFT JOIN repositories r ON r.id = c.repository_id WHERE c.user_id = $1 AND c.workspace_id = $2 ORDER BY c.updated_at DESC LIMIT 100",
    [userId, workspaceId]
  )) as Record<string, unknown>[];

  return rows.map(row => ({
    id: String(row.id),
    title: row.title === null ? null : String(row.title),
    repositoryId: row.repository_id === null ? null : String(row.repository_id),
    repositoryFullName: row.repository_full_name === null ? null : String(row.repository_full_name),
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
  if (input.repositoryId) {
    const repoRows = (await getSql().query(
      "SELECT id FROM repositories WHERE id = $1 AND workspace_id = $2 LIMIT 1",
      [input.repositoryId, input.workspaceId]
    )) as Record<string, unknown>[];
    if (!repoRows[0]) throw Object.assign(new Error("Repository is not available in this workspace"), { statusCode: 400 });
  }

  const rows = (await getSql().query(
    "INSERT INTO conversations (workspace_id, user_id, repository_id, branch_name, title) VALUES ($1, $2, $3, $4, $5) RETURNING id",
    [input.workspaceId, input.userId, input.repositoryId ?? null, input.branchName ?? null, input.title ?? "New conversation"]
  )) as Record<string, unknown>[];
  if (!rows[0]) throw new Error("Failed to create conversation");

  const conversation = await getConversationForUser(String(rows[0].id), input.userId, input.workspaceId);
  if (!conversation) throw new Error("Failed to load created conversation");
  return conversation;
}

export async function updateConversationContext(input: {
  conversationId: string;
  userId: string;
  workspaceId: string;
  repositoryId: string | null;
  branchName: string | null;
}): Promise<ForgeConversation | undefined> {
  if (input.repositoryId) {
    const repoRows = (await getSql().query(
      "SELECT id FROM repositories WHERE id = $1 AND workspace_id = $2 LIMIT 1",
      [input.repositoryId, input.workspaceId]
    )) as Record<string, unknown>[];
    if (!repoRows[0]) throw Object.assign(new Error("Repository is not available in this workspace"), { statusCode: 400 });
  }

  await getSql().query(
    "UPDATE conversations SET repository_id = $1, branch_name = $2, updated_at = now() WHERE id = $3 AND user_id = $4 AND workspace_id = $5",
    [input.repositoryId, input.branchName, input.conversationId, input.userId, input.workspaceId]
  );

  return getConversationForUser(input.conversationId, input.userId, input.workspaceId);
}

export async function getConversationForUser(id: string, userId: string, workspaceId: string): Promise<ForgeConversation | undefined> {
  const rows = (await getSql().query(
    "SELECT c.id, c.repository_id, c.branch_name, r.github_full_name AS repository_full_name, c.title, c.updated_at FROM conversations c LEFT JOIN repositories r ON r.id = c.repository_id WHERE c.id = $1 AND c.user_id = $2 AND c.workspace_id = $3 LIMIT 1",
    [id, userId, workspaceId]
  )) as Record<string, unknown>[];
  if (!rows[0]) return undefined;

  return {
    id: String(rows[0].id),
    title: rows[0].title === null ? null : String(rows[0].title),
    repositoryId: rows[0].repository_id === null ? null : String(rows[0].repository_id),
    repositoryFullName: rows[0].repository_full_name === null ? null : String(rows[0].repository_full_name),
    branchName: rows[0].branch_name === null ? null : String(rows[0].branch_name),
    updatedAt: new Date(String(rows[0].updated_at)).toISOString()
  };
}

export async function userOwnsRun(runId: string, userId: string, workspaceId: string): Promise<boolean> {
  const rows = (await getSql().query(
    "SELECT 1 FROM runs r JOIN conversations c ON c.id = r.conversation_id WHERE r.id = $1 AND r.user_id = $2 AND c.workspace_id = $3 LIMIT 1",
    [runId, userId, workspaceId]
  )) as Record<string, unknown>[];
  return Boolean(rows[0]);
}
