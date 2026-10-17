-- Verification for db/migrations/006_auth_identity_connections.sql
-- Run on the same database after migration 006. Expected: all mismatch/orphan counts = 0.
SELECT
  (SELECT count(*) FROM forge_users) AS forge_users,
  (SELECT count(*) FROM auth_identities WHERE provider = 'github') AS github_identities,
  (SELECT count(*) FROM github_connections) AS github_connections,
  (SELECT count(*) FROM auth_sessions) AS auth_sessions,
  (SELECT count(*) FROM github_connections WHERE auth_identity_id IS NULL) AS connections_without_identity,
  (SELECT count(*) FROM auth_sessions WHERE active_github_connection_id IS NULL) AS sessions_without_active_connection,
  (SELECT count(*) FROM github_connections c JOIN auth_identities i ON i.id = c.auth_identity_id WHERE c.user_id <> i.user_id) AS connection_identity_owner_mismatches,
  (SELECT count(*) FROM auth_sessions s LEFT JOIN github_connections c ON c.id = s.active_github_connection_id AND c.user_id = s.user_id WHERE c.id IS NULL) AS session_connection_owner_mismatches;

-- Existing records must remain in place; these should match pre-migration baseline counts.
SELECT
  (SELECT count(*) FROM workspaces) AS workspaces,
  (SELECT count(*) FROM conversations) AS conversations,
  (SELECT count(*) FROM repositories) AS repositories,
  (SELECT count(*) FROM runs) AS runs;

-- Confirm legacy single-connection constraint remains until application source has been upgraded.
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'github_connections'::regclass
ORDER BY conname;
