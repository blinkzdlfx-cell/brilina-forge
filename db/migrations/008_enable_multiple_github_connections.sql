-- 008_enable_multiple_github_connections.sql
-- Apply only after the application code has switched all session and credential operations
-- to explicit connection IDs. Requires migration 006.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.auth_identities') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='auth_sessions' AND column_name='active_github_connection_id')
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='github_connections' AND column_name='auth_identity_id') THEN
    RAISE EXCEPTION 'Migration 008 requires migration 006 first';
  END IF;
END $$;

-- Remove only the single-column UNIQUE(user_id) constraint; preserve composite ownership keys.
DO $$
DECLARE constraint_name TEXT;
BEGIN
  FOR constraint_name IN
    SELECT c.conname
    FROM pg_constraint c
    WHERE c.conrelid = 'public.github_connections'::regclass
      AND c.contype = 'u'
      AND pg_get_constraintdef(c.oid) = 'UNIQUE (user_id)'
  LOOP
    EXECUTE format('ALTER TABLE github_connections DROP CONSTRAINT %I', constraint_name);
  END LOOP;
END $$;

ALTER TABLE forge_users ALTER COLUMN github_user_id DROP NOT NULL;
ALTER TABLE forge_users ALTER COLUMN github_login DROP NOT NULL;

-- Do not remove legacy profile columns: existing workspace slugs and compatibility reads may
-- still refer to the first GitHub identity while the application is rolled forward.
COMMIT;
