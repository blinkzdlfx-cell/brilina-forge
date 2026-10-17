-- Verification for migration 008. Expected: zero single-column user_id unique constraints.
SELECT c.conname, pg_get_constraintdef(c.oid) AS definition
FROM pg_constraint c
WHERE c.conrelid = 'public.github_connections'::regclass AND c.contype = 'u'
ORDER BY c.conname;

SELECT
  (SELECT count(*) FROM github_connections WHERE auth_identity_id IS NULL) AS connections_without_identity,
  (SELECT count(*) FROM auth_sessions WHERE active_github_connection_id IS NULL) AS sessions_without_active_connection,
  (SELECT count(*) FROM github_connections c JOIN auth_identities i ON i.id=c.auth_identity_id WHERE c.user_id<>i.user_id) AS connection_identity_owner_mismatches,
  (SELECT count(*) FROM auth_sessions s LEFT JOIN github_connections c ON c.id=s.active_github_connection_id AND c.user_id=s.user_id WHERE c.id IS NULL) AS session_connection_owner_mismatches;
