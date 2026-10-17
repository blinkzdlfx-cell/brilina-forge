import { createHash, randomBytes } from "node:crypto";
import { getSql } from "./client.js";
import type { Session } from "../auth/session.js";
import type { GithubAppInstallation, GithubAppRepository } from "../github/app.js";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export async function createGithubAppInstallationState(session: Session): Promise<string> {
  if (!session.forgeUserId || !session.authSessionRowId || !session.authIdentityId) {
    throw Object.assign(new Error("A persistent authenticated Forge session is required"), { statusCode: 401 });
  }
  const rawState = randomBytes(32).toString("base64url");
  const rows = await getSql().query(
    "INSERT INTO github_app_installation_states (state_hash, user_id, auth_session_id, auth_identity_id, expires_at) SELECT $1, s.user_id, s.id, i.id, now() + interval '10 minutes' FROM auth_sessions s JOIN github_connections c ON c.id=s.active_github_connection_id AND c.user_id=s.user_id JOIN auth_identities i ON i.id=c.auth_identity_id WHERE s.id=$2 AND s.user_id=$3 AND s.session_token_hash=$4 AND s.expires_at>now() RETURNING state_hash",
    [hash(rawState), session.authSessionRowId, session.forgeUserId, hash(session.id)]
  ) as Record<string, unknown>[];
  if (!rows[0]) throw Object.assign(new Error("The active Forge session could not be bound to installation state"), { statusCode: 401 });
  return rawState;
}

export async function consumeGithubAppInstallationState(state: string, sessionToken: string): Promise<{
  userId: string; authIdentityId: string;
} | undefined> {
  const rows = await getSql().query(
    "UPDATE github_app_installation_states st SET consumed_at=now() FROM auth_sessions s WHERE st.state_hash=$1 AND st.expires_at>now() AND st.consumed_at IS NULL AND s.id=st.auth_session_id AND s.user_id=st.user_id AND s.session_token_hash=$2 AND s.expires_at>now() RETURNING st.user_id, st.auth_identity_id",
    [hash(state), hash(sessionToken)]
  ) as Record<string, unknown>[];
  return rows[0] ? { userId: String(rows[0].user_id), authIdentityId: String(rows[0].auth_identity_id) } : undefined;
}

export async function saveGithubAppInstallation(
  userId: string,
  authIdentityId: string,
  installation: GithubAppInstallation,
  repositories: GithubAppRepository[]
): Promise<void> {
  if (!installation.account || !Number.isSafeInteger(installation.id) || installation.id <= 0) {
    throw Object.assign(new Error("GitHub returned an invalid installation account"), { statusCode: 502 });
  }
  const accountType = ["User", "Organization", "Enterprise"].includes(installation.account.type)
    ? installation.account.type
    : "User";
  const repositorySelection = installation.repository_selection === "all" ? "all" : "selected";
  const sql = getSql();
  const statements = [
    sql.query(
      "INSERT INTO github_app_installations (installation_id, account_id, account_login, account_type, repository_selection, permissions, suspended_at, uninstalled_at, last_synced_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,NULL,now()) ON CONFLICT (installation_id) DO UPDATE SET account_id=EXCLUDED.account_id, account_login=EXCLUDED.account_login, account_type=EXCLUDED.account_type, repository_selection=EXCLUDED.repository_selection, permissions=EXCLUDED.permissions, suspended_at=EXCLUDED.suspended_at, uninstalled_at=NULL, last_synced_at=now(), updated_at=now()",
      [installation.id, installation.account.id, installation.account.login, accountType, repositorySelection, JSON.stringify(installation.permissions ?? {}), installation.suspended_at ? new Date(installation.suspended_at) : null]
    ),
    sql.query(
      "INSERT INTO github_installation_access (installation_record_id,user_id,auth_identity_id) SELECT id,$2,$3 FROM github_app_installations WHERE installation_id=$1 ON CONFLICT (installation_record_id,user_id) DO UPDATE SET auth_identity_id=EXCLUDED.auth_identity_id, revoked_at=NULL, linked_at=now(), updated_at=now()",
      [installation.id, userId, authIdentityId]
    ),
    sql.query(
      "DELETE FROM github_installation_repositories r USING github_app_installations i WHERE r.installation_record_id=i.id AND i.installation_id=$1",
      [installation.id]
    ),
    ...repositories.map(repository => sql.query(
      "INSERT INTO github_installation_repositories (installation_record_id,github_repository_id,github_node_id,owner_login,repository_name,full_name,default_branch,is_private,is_archived,last_synced_at) SELECT i.id,$2,$3,$4,$5,$6,$7,$8,$9,now() FROM github_app_installations i WHERE i.installation_id=$1 ON CONFLICT (installation_record_id,github_repository_id) DO UPDATE SET github_node_id=EXCLUDED.github_node_id, owner_login=EXCLUDED.owner_login, repository_name=EXCLUDED.repository_name, full_name=EXCLUDED.full_name, default_branch=EXCLUDED.default_branch, is_private=EXCLUDED.is_private, is_archived=EXCLUDED.is_archived, last_synced_at=now(), updated_at=now()",
      [installation.id, repository.id, repository.node_id ?? null, repository.owner.login, repository.name, repository.full_name, repository.default_branch, repository.private, repository.archived]
    )),
    sql.query("UPDATE github_app_installations SET last_synced_at=now(), updated_at=now() WHERE installation_id=$1", [installation.id])
  ];
  await sql.transaction(statements);
}

export async function listGithubAppInstallationsForUser(userId: string): Promise<Array<{
  id: string; installationId: number; accountId: number; accountLogin: string; accountType: string;
  repositorySelection: string; permissions: Record<string, unknown>; suspended: boolean; repositoryCount: number;
}>> {
  const rows = await getSql().query(
    "SELECT i.id, i.installation_id, i.account_id, i.account_login, i.account_type, i.repository_selection, i.permissions, i.suspended_at, i.uninstalled_at, (SELECT count(*) FROM github_installation_repositories r WHERE r.installation_record_id=i.id) AS repository_count FROM github_app_installations i JOIN github_installation_access a ON a.installation_record_id=i.id WHERE a.user_id=$1 AND a.revoked_at IS NULL AND i.uninstalled_at IS NULL ORDER BY i.account_login",
    [userId]
  ) as Record<string, unknown>[];
  return rows.map(row => ({
    id: String(row.id), installationId: Number(row.installation_id), accountId: Number(row.account_id),
    accountLogin: String(row.account_login), accountType: String(row.account_type),
    repositorySelection: String(row.repository_selection), permissions: row.permissions as Record<string, unknown>,
    suspended: row.suspended_at != null, repositoryCount: Number(row.repository_count)
  }));
}

export async function listGithubAppRepositoriesForUser(userId: string, installationRecordId: string): Promise<Array<{
  id: string; githubRepositoryId: number; fullName: string; owner: string; name: string;
  defaultBranch: string; private: boolean; archived: boolean;
}>> {
  const rows = await getSql().query(
    "SELECT r.id, r.github_repository_id, r.full_name, r.owner_login, r.repository_name, r.default_branch, r.is_private, r.is_archived FROM github_installation_repositories r JOIN github_app_installations i ON i.id=r.installation_record_id JOIN github_installation_access a ON a.installation_record_id=i.id WHERE a.user_id=$1 AND a.revoked_at IS NULL AND i.id=$2 AND i.suspended_at IS NULL AND i.uninstalled_at IS NULL ORDER BY r.full_name",
    [userId, installationRecordId]
  ) as Record<string, unknown>[];
  return rows.map(row => ({
    id: String(row.id), githubRepositoryId: Number(row.github_repository_id), fullName: String(row.full_name),
    owner: String(row.owner_login), name: String(row.repository_name), defaultBranch: String(row.default_branch),
    private: Boolean(row.is_private), archived: Boolean(row.is_archived)
  }));
}

export async function processGithubAppWebhook(input: {
  deliveryId: string; eventName: string; action?: string; payload: Record<string, unknown>;
}): Promise<"processed" | "duplicate"> {
  const sql = getSql();
  const inserted = await sql.query(
    "INSERT INTO github_app_webhook_deliveries (delivery_id,event_name,action_name) VALUES ($1,$2,$3) ON CONFLICT (delivery_id) DO NOTHING RETURNING delivery_id",
    [input.deliveryId, input.eventName, input.action ?? null]
  ) as Record<string, unknown>[];
  if (!inserted[0]) return "duplicate";

  try {
    const installation = input.payload.installation as { id?: number } | undefined;
    if (installation?.id && Number.isSafeInteger(installation.id)) {
      if (input.eventName === "installation" && input.action === "deleted") {
        await sql.query("UPDATE github_app_installations SET uninstalled_at=now(), updated_at=now() WHERE installation_id=$1", [installation.id]);
      } else if (input.eventName === "installation" && input.action === "suspend") {
        await sql.query("UPDATE github_app_installations SET suspended_at=now(), updated_at=now() WHERE installation_id=$1", [installation.id]);
      } else if (input.eventName === "installation" && input.action === "unsuspend") {
        await sql.query("UPDATE github_app_installations SET suspended_at=NULL, updated_at=now() WHERE installation_id=$1", [installation.id]);
      } else if (input.eventName === "installation_repositories" && (input.action === "removed" || input.action === "added")) {
        const repositories = (input.payload.repositories as Array<{ id?: number }> | undefined) ?? [];
        if (input.action === "removed") {
          const ids = repositories.map(repo => repo.id).filter((id): id is number => Number.isSafeInteger(id));
          if (ids.length) await sql.query(
            "DELETE FROM github_installation_repositories r USING github_app_installations i WHERE r.installation_record_id=i.id AND i.installation_id=$1 AND r.github_repository_id = ANY($2::bigint[])",
            [installation.id, ids]
          );
        }
        // Added repositories are refreshed from GitHub on the next explicit sync; cached entries never grant access by themselves.
      }
    }
    await sql.query("UPDATE github_app_webhook_deliveries SET processed_at=now() WHERE delivery_id=$1", [input.deliveryId]);
    return "processed";
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 500) : "Unknown webhook processing error";
    await sql.query("UPDATE github_app_webhook_deliveries SET processing_error=$2 WHERE delivery_id=$1", [input.deliveryId, message]);
    throw error;
  }
}
