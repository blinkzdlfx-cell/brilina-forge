import { createHash, randomBytes } from "node:crypto";
import { getSql } from "./client.js";
import { decryptSecret, encryptSecret } from "./crypto.js";
import type { GithubUser } from "../github/types.js";
import type { Session, SessionStore } from "../auth/session.js";

const SESSION_TTL_MS = 24 * 60 * 60_000;

function hashSessionToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function sessionExpiresAt(): number {
  return Date.now() + SESSION_TTL_MS;
}

export async function createPersistentSession(
  accessToken: string,
  githubUser: GithubUser,
  credentials: Pick<Session, "refreshToken" | "expiresAt" | "refreshTokenExpiresAt">
): Promise<Session> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashSessionToken(token);
  const access = encryptSecret(accessToken);
  const refresh = credentials.refreshToken ? encryptSecret(credentials.refreshToken) : undefined;
  const expiresAt = sessionExpiresAt();
  const workspaceSlug = "personal-" + githubUser.login.toLowerCase();
  const workspaceName = githubUser.login + "'s Forge";

  const sql = getSql();
  await sql.transaction([
    sql.query(
      "INSERT INTO forge_users (github_user_id, github_login, github_name, github_avatar_url) VALUES ($1, $2, $3, $4) ON CONFLICT (github_user_id) DO UPDATE SET github_login = EXCLUDED.github_login, github_name = EXCLUDED.github_name, github_avatar_url = EXCLUDED.github_avatar_url, updated_at = now()",
      [githubUser.id, githubUser.login, githubUser.name, githubUser.avatar_url]
    ),
    sql.query(
      "INSERT INTO workspaces (owner_user_id, name, slug) SELECT id, $1, $2 FROM forge_users WHERE github_user_id = $3 ON CONFLICT (slug) DO UPDATE SET updated_at = now()",
      [workspaceName, workspaceSlug, githubUser.id]
    ),
    sql.query(
      "INSERT INTO workspace_members (workspace_id, user_id, role) SELECT w.id, u.id, 'owner' FROM workspaces w JOIN forge_users u ON u.id = w.owner_user_id WHERE u.github_user_id = $1 ON CONFLICT (workspace_id, user_id) DO UPDATE SET role = 'owner'",
      [githubUser.id]
    ),
    sql.query(
      "INSERT INTO github_connections (user_id, github_login, access_token_ciphertext, access_token_iv, access_token_tag, refresh_token_ciphertext, refresh_token_iv, refresh_token_tag, token_expires_at, refresh_token_expires_at, scopes) SELECT id, $1, $2, $3, $4, $5, $6, $7, $8, $9, '{}'::text[] FROM forge_users WHERE github_user_id = $10 ON CONFLICT (user_id) DO UPDATE SET github_login = EXCLUDED.github_login, access_token_ciphertext = EXCLUDED.access_token_ciphertext, access_token_iv = EXCLUDED.access_token_iv, access_token_tag = EXCLUDED.access_token_tag, refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext, refresh_token_iv = EXCLUDED.refresh_token_iv, refresh_token_tag = EXCLUDED.refresh_token_tag, token_expires_at = EXCLUDED.token_expires_at, refresh_token_expires_at = EXCLUDED.refresh_token_expires_at, updated_at = now()",
      [
        githubUser.login,
        access.ciphertext,
        access.iv,
        access.tag,
        refresh?.ciphertext ?? null,
        refresh?.iv ?? null,
        refresh?.tag ?? null,
        credentials.expiresAt ? new Date(credentials.expiresAt) : null,
        credentials.refreshTokenExpiresAt ? new Date(credentials.refreshTokenExpiresAt) : null,
        githubUser.id
      ]
    ),
    sql.query(
      "INSERT INTO auth_sessions (user_id, session_token_hash, expires_at) SELECT id, $1, $2 FROM forge_users WHERE github_user_id = $3",
      [tokenHash, new Date(expiresAt), githubUser.id]
    )
  ]);

  const session = await getPersistentSession(token);
  if (!session) throw new Error("Failed to create durable Forge session");
  return session;
}

export async function getPersistentSession(token: string | undefined): Promise<Session | undefined> {
  if (!token) return undefined;
  const tokenHash = hashSessionToken(token);
  const sql = getSql();
  const rows = (await sql.query(
    "SELECT s.expires_at, u.github_login, u.github_user_id, u.github_name, u.github_avatar_url, c.access_token_ciphertext, c.access_token_iv, c.access_token_tag, c.refresh_token_ciphertext, c.refresh_token_iv, c.refresh_token_tag, c.token_expires_at, c.refresh_token_expires_at FROM auth_sessions s JOIN forge_users u ON u.id = s.user_id JOIN github_connections c ON c.user_id = u.id WHERE s.session_token_hash = $1 AND s.expires_at > now() LIMIT 1",
    [tokenHash]
  )) as Record<string, unknown>[];

  if (!rows[0]) return undefined;
  await sql.query("UPDATE auth_sessions SET last_seen_at = now() WHERE session_token_hash = $1", [tokenHash]);
  return rowToSession(token, rows[0]);
}

export async function updatePersistentSessionCredentials(
  token: string,
  credentials: Pick<Session, "accessToken" | "refreshToken" | "expiresAt" | "refreshTokenExpiresAt">
): Promise<Session | undefined> {
  const tokenHash = hashSessionToken(token);
  const sql = getSql();
  const current = (await sql.query(
    "SELECT c.refresh_token_ciphertext, c.refresh_token_iv, c.refresh_token_tag FROM auth_sessions s JOIN github_connections c ON c.user_id = s.user_id WHERE s.session_token_hash = $1 AND s.expires_at > now() LIMIT 1",
    [tokenHash]
  )) as Record<string, unknown>[];
  if (!current[0]) return undefined;

  const access = encryptSecret(credentials.accessToken);
  const refresh = credentials.refreshToken ? encryptSecret(credentials.refreshToken) : undefined;
  const currentRow = current[0];

  await sql.query(
    "UPDATE github_connections c SET access_token_ciphertext = $1, access_token_iv = $2, access_token_tag = $3, refresh_token_ciphertext = $4, refresh_token_iv = $5, refresh_token_tag = $6, token_expires_at = $7, refresh_token_expires_at = $8, updated_at = now() FROM auth_sessions s WHERE c.user_id = s.user_id AND s.session_token_hash = $9",
    [
      access.ciphertext,
      access.iv,
      access.tag,
      refresh?.ciphertext ?? currentRow.refresh_token_ciphertext,
      refresh?.iv ?? currentRow.refresh_token_iv,
      refresh?.tag ?? currentRow.refresh_token_tag,
      credentials.expiresAt ? new Date(credentials.expiresAt) : null,
      credentials.refreshTokenExpiresAt ? new Date(credentials.refreshTokenExpiresAt) : null,
      tokenHash
    ]
  );

  return getPersistentSession(token);
}

export async function deletePersistentSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = hashSessionToken(token);
  await getSql().query("DELETE FROM auth_sessions WHERE session_token_hash = $1", [tokenHash]);
}

function rowToSession(token: string, row: Record<string, unknown>): Session {
  const refreshToken = row.refresh_token_ciphertext
    ? decryptSecret({
        ciphertext: String(row.refresh_token_ciphertext),
        iv: String(row.refresh_token_iv),
        tag: String(row.refresh_token_tag)
      })
    : undefined;

  return {
    id: token,
    accessToken: decryptSecret({
      ciphertext: String(row.access_token_ciphertext),
      iv: String(row.access_token_iv),
      tag: String(row.access_token_tag)
    }),
    refreshToken,
    expiresAt: row.token_expires_at ? new Date(String(row.token_expires_at)).getTime() : undefined,
    refreshTokenExpiresAt: row.refresh_token_expires_at ? new Date(String(row.refresh_token_expires_at)).getTime() : undefined,
    githubUser: {
      id: Number(row.github_user_id),
      login: String(row.github_login),
      name: row.github_name ? String(row.github_name) : null,
      avatar_url: String(row.github_avatar_url),
      html_url: "https://github.com/" + String(row.github_login)
    },
    createdAt: new Date(String(row.expires_at)).getTime() - SESSION_TTL_MS
  };
}

export function createNeonSessionStore(): SessionStore {
  return {
    create: createPersistentSession,
    get: getPersistentSession,
    update: updatePersistentSessionCredentials,
    delete: deletePersistentSession
  };
}
