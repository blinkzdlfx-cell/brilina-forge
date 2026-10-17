export async function updatePersistentSessionCredentials(
  token: string,
  credentials: Pick<Session, "accessToken" | "refreshToken" | "expiresAt" | "refreshTokenExpiresAt">
): Promise<Session | undefined> {
  const tokenHash = hashSessionToken(token);
  const sql = getSql();
  const current = (await sql.query(
    "SELECT c.id AS connection_id, c.refresh_token_ciphertext, c.refresh_token_iv, c.refresh_token_tag FROM auth_sessions s JOIN github_connections c ON c.id = s.active_github_connection_id AND c.user_id = s.user_id WHERE s.session_token_hash = $1 AND s.expires_at > now() LIMIT 1",
    [tokenHash]
  )) as Record<string, unknown>[];
  if (!current[0]) return undefined;

  const access = encryptSecret(credentials.accessToken);
  const refresh = credentials.refreshToken ? encryptSecret(credentials.refreshToken) : undefined;
  const currentRow = current[0];
  await sql.query(
    "UPDATE github_connections SET access_token_ciphertext = $1, access_token_iv = $2, access_token_tag = $3, refresh_token_ciphertext = $4, refresh_token_iv = $5, refresh_token_tag = $6, token_expires_at = $7, refresh_token_expires_at = $8, updated_at = now() WHERE id = $9",
    [access.ciphertext, access.iv, access.tag, refresh?.ciphertext ?? currentRow.refresh_token_ciphertext, refresh?.iv ?? currentRow.refresh_token_iv, refresh?.tag ?? currentRow.refresh_token_tag, credentials.expiresAt ? new Date(credentials.expiresAt) : null, credentials.refreshTokenExpiresAt ? new Date(credentials.refreshTokenExpiresAt) : null, currentRow.connection_id]
  );
  return getPersistentSession(token);
}

export async function listGithubConnectionsForUser(userId: string, activeConnectionId?: string): Promise<Array<{
  id: string; login: string; name: string | null; avatarUrl: string | null; active: boolean;
}>> {
  const rows = await getSql().query(
    "SELECT c.id, COALESCE(i.provider_login, c.github_login) AS login, i.provider_name AS name, i.provider_avatar_url AS avatar_url, (c.id = $2) AS active FROM github_connections c JOIN auth_identities i ON i.id = c.auth_identity_id WHERE c.user_id = $1 ORDER BY c.created_at ASC",
    [userId, activeConnectionId ?? null]
  ) as Record<string, unknown>[];
  return rows.map(row => ({
    id: String(row.id), login: String(row.login), name: row.name == null ? null : String(row.name),
    avatarUrl: row.avatar_url == null ? null : String(row.avatar_url), active: Boolean(row.active)
  }));
}

export async function switchActiveGithubConnection(token: string, connectionId: string): Promise<Session | undefined> {
  const tokenHash = hashSessionToken(token);
  const rows = await getSql().query(
    "UPDATE auth_sessions s SET active_github_connection_id = c.id, last_seen_at = now() FROM github_connections c WHERE s.session_token_hash = $1 AND s.expires_at > now() AND c.id = $2 AND c.user_id = s.user_id RETURNING s.id",
    [tokenHash, connectionId]
  ) as Record<string, unknown>[];
  if (!rows[0]) throw Object.assign(new Error("GitHub connection is not available to this Forge user"), { statusCode: 403 });
  return getPersistentSession(token);
}

export async function linkGithubIdentityToSession(
  token: string,
  accessToken: string,
  githubUser: GithubUser,
  credentials: Pick<Session, "refreshToken" | "expiresAt" | "refreshTokenExpiresAt">
): Promise<Session | undefined> {
  const tokenHash = hashSessionToken(token);
  const sql = getSql();
  const current = await sql.query(
    "SELECT s.user_id FROM auth_sessions s WHERE s.session_token_hash = $1 AND s.expires_at > now() LIMIT 1",
    [tokenHash]
  ) as Record<string, unknown>[];
  if (!current[0]) throw Object.assign(new Error("An active Forge session is required to link another GitHub account"), { statusCode: 401 });
  const userId = String(current[0].user_id);
  const existing = await sql.query(
    "SELECT user_id FROM auth_identities WHERE provider = 'github' AND provider_subject = $1::text LIMIT 1",
    [githubUser.id]
  ) as Record<string, unknown>[];
  if (existing[0] && String(existing[0].user_id) !== userId) {
    throw Object.assign(new Error("This GitHub account is already linked to another Forge user"), { statusCode: 409 });
  }

  const access = encryptSecret(accessToken);
  const refresh = credentials.refreshToken ? encryptSecret(credentials.refreshToken) : undefined;
  await sql.transaction([
    sql.query(
      "INSERT INTO auth_identities (user_id, provider, provider_subject, provider_login, provider_name, provider_avatar_url) VALUES ($1, 'github', $2::text, $3, $4, $5) ON CONFLICT (provider, provider_subject) DO UPDATE SET provider_login = EXCLUDED.provider_login, provider_name = EXCLUDED.provider_name, provider_avatar_url = EXCLUDED.provider_avatar_url, updated_at = now()",
      [userId, githubUser.id, githubUser.login, githubUser.name, githubUser.avatar_url]
    ),
    sql.query(
      "INSERT INTO github_connections (user_id, auth_identity_id, github_login, access_token_ciphertext, access_token_iv, access_token_tag, refresh_token_ciphertext, refresh_token_iv, refresh_token_tag, token_expires_at, refresh_token_expires_at, scopes) SELECT $1, i.id, $2, $3, $4, $5, $6, $7, $8, $9, $10, '{}'::text[] FROM auth_identities i WHERE i.user_id = $1 AND i.provider = 'github' AND i.provider_subject = $11::text ON CONFLICT (auth_identity_id) DO UPDATE SET github_login = EXCLUDED.github_login, access_token_ciphertext = EXCLUDED.access_token_ciphertext, access_token_iv = EXCLUDED.access_token_iv, access_token_tag = EXCLUDED.access_token_tag, refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext, refresh_token_iv = EXCLUDED.refresh_token_iv, refresh_token_tag = EXCLUDED.refresh_token_tag, token_expires_at = EXCLUDED.token_expires_at, refresh_token_expires_at = EXCLUDED.refresh_token_expires_at, updated_at = now()",
      [userId, githubUser.login, access.ciphertext, access.iv, access.tag, refresh?.ciphertext ?? null, refresh?.iv ?? null, refresh?.tag ?? null, credentials.expiresAt ? new Date(credentials.expiresAt) : null, credentials.refreshTokenExpiresAt ? new Date(credentials.refreshTokenExpiresAt) : null, githubUser.id]
    ),
  ]);
  const linkedIdentity = await sql.query(
    "SELECT i.id FROM auth_identities i JOIN github_connections c ON c.auth_identity_id=i.id AND c.user_id=i.user_id WHERE i.provider='github' AND i.provider_subject=$1::text AND i.user_id=$2 LIMIT 1",
    [githubUser.id, userId]
  ) as Record<string, unknown>[];
  if (!linkedIdentity[0]) throw Object.assign(new Error("GitHub identity could not be safely linked to this Forge user"), { statusCode: 409 });
  // Keep the current active connection unchanged; the user explicitly switches accounts in the context panel.
  return getPersistentSession(token);
}

export type GithubConnectionCredentials = {
  id: string;
  authIdentityId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  refreshTokenExpiresAt?: number;
  githubUser: GithubUser;
};

export async function getGithubConnectionForUser(userId: string, connectionId: string): Promise<GithubConnectionCredentials | undefined> {
  const rows = await getSql().query(
    "SELECT c.id, c.access_token_ciphertext, c.access_token_iv, c.access_token_tag, c.refresh_token_ciphertext, c.refresh_token_iv, c.refresh_token_tag, c.token_expires_at, c.refresh_token_expires_at, i.id AS auth_identity_id, i.provider_subject, COALESCE(i.provider_login,c.github_login) AS github_login, i.provider_name, i.provider_avatar_url FROM github_connections c JOIN auth_identities i ON i.id=c.auth_identity_id WHERE c.id=$1 AND c.user_id=$2 AND i.provider='github' LIMIT 1",
    [connectionId, userId]
  ) as Record<string, unknown>[];
  const row = rows[0];
  if (!row) return undefined;
  const refreshToken = row.refresh_token_ciphertext
    ? decryptSecret({ ciphertext: String(row.refresh_token_ciphertext), iv: String(row.refresh_token_iv), tag: String(row.refresh_token_tag) })
    : undefined;
  return {
    id: String(row.id), authIdentityId: String(row.auth_identity_id),
    accessToken: decryptSecret({ ciphertext: String(row.access_token_ciphertext), iv: String(row.access_token_iv), tag: String(row.access_token_tag) }),
    refreshToken,
    expiresAt: row.token_expires_at ? new Date(String(row.token_expires_at)).getTime() : undefined,
    refreshTokenExpiresAt: row.refresh_token_expires_at ? new Date(String(row.refresh_token_expires_at)).getTime() : undefined,
    githubUser: {
      id: Number(row.provider_subject), login: String(row.github_login),
      name: row.provider_name == null ? null : String(row.provider_name),
      avatar_url: row.provider_avatar_url == null ? "" : String(row.provider_avatar_url),
      html_url: "https://github.com/" + String(row.github_login)
    }
  };
}

export async function updateGithubConnectionCredentialsForUser(
  userId: string,
  connectionId: string,
  credentials: Pick<Session, "accessToken" | "refreshToken" | "expiresAt" | "refreshTokenExpiresAt">
): Promise<void> {
  const access = encryptSecret(credentials.accessToken);
  const refresh = credentials.refreshToken ? encryptSecret(credentials.refreshToken) : undefined;
  const rows = await getSql().query(
    "UPDATE github_connections SET access_token_ciphertext=$1, access_token_iv=$2, access_token_tag=$3, refresh_token_ciphertext=COALESCE($4,refresh_token_ciphertext), refresh_token_iv=COALESCE($5,refresh_token_iv), refresh_token_tag=COALESCE($6,refresh_token_tag), token_expires_at=$7, refresh_token_expires_at=COALESCE($8,refresh_token_expires_at), updated_at=now() WHERE id=$9 AND user_id=$10 RETURNING id",
    [access.ciphertext, access.iv, access.tag, refresh?.ciphertext ?? null, refresh?.iv ?? null, refresh?.tag ?? null, credentials.expiresAt ? new Date(credentials.expiresAt) : null, credentials.refreshTokenExpiresAt ? new Date(credentials.refreshTokenExpiresAt) : null, connectionId, userId]
  ) as Record<string, unknown>[];
  if (!rows[0]) throw Object.assign(new Error("GitHub connection is not available to this Forge user"), { statusCode: 403 });
}

export async function deletePersistentSession(token: string | undefined): Promise<void> {
  if (!token) return;
  const tokenHash = hashSessionToken(token);
  await getSql().query("DELETE FROM auth_sessions WHERE session_token_hash = $1", [tokenHash]);
}

function rowToSession(token: string, row: Record<string, unknown>): Session {
  const refreshToken = row.refresh_token_ciphertext
    ? decryptSecret({ ciphertext: String(row.refresh_token_ciphertext), iv: String(row.refresh_token_iv), tag: String(row.refresh_token_tag) })
    : undefined;
  return {
    id: token,
    forgeUserId: String(row.forge_user_id),
    githubConnectionId: String(row.github_connection_id),
    authIdentityId: String(row.auth_identity_id),
    authSessionRowId: String(row.auth_session_row_id),
    accessToken: decryptSecret({ ciphertext: String(row.access_token_ciphertext), iv: String(row.access_token_iv), tag: String(row.access_token_tag) }),
    refreshToken,
    expiresAt: row.token_expires_at ? new Date(String(row.token_expires_at)).getTime() : undefined,
    refreshTokenExpiresAt: row.refresh_token_expires_at ? new Date(String(row.refresh_token_expires_at)).getTime() : undefined,
    githubUser: {
      id: Number(row.github_user_id),
      login: String(row.github_login),
      name: row.github_name == null ? null : String(row.github_name),
      avatar_url: row.github_avatar_url == null ? "" : String(row.github_avatar_url),
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
