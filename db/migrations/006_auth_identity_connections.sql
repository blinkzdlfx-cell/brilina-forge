-- 006_auth_identity_connections.sql
-- Additive foundation for stable Forge identities and explicitly selected GitHub connections.
-- Safe to run repeatedly during testing. Do NOT remove legacy columns or user_id uniqueness here.
BEGIN;

CREATE TABLE IF NOT EXISTS auth_identities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES forge_users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('github', 'google', 'email')),
  provider_subject TEXT NOT NULL,
  provider_login TEXT,
  provider_name TEXT,
  provider_email TEXT,
  provider_avatar_url TEXT,
  email_verified BOOLEAN,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT auth_identities_provider_subject_unique UNIQUE (provider, provider_subject),
  CONSTRAINT auth_identities_id_user_unique UNIQUE (id, user_id)
);

-- Never silently move a provider identity between Forge users.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM forge_users u
    JOIN auth_identities i
      ON i.provider = 'github'
     AND i.provider_subject = u.github_user_id::text
    WHERE i.user_id <> u.id
  ) THEN
    RAISE EXCEPTION 'Migration 006 stopped: a GitHub identity is already linked to a different Forge user';
  END IF;
END $$;

INSERT INTO auth_identities
  (user_id, provider, provider_subject, provider_login, provider_name, provider_avatar_url, created_at, updated_at)
SELECT u.id, 'github', u.github_user_id::text, u.github_login, u.github_name, u.github_avatar_url, u.created_at, now()
FROM forge_users u
WHERE u.github_user_id IS NOT NULL
ON CONFLICT (provider, provider_subject) DO NOTHING;

ALTER TABLE github_connections
  ADD COLUMN IF NOT EXISTS auth_identity_id UUID;

UPDATE github_connections c
SET auth_identity_id = i.id,
    updated_at = now()
FROM auth_identities i
JOIN forge_users u ON u.id = i.user_id
WHERE i.provider = 'github'
  AND i.provider_subject = u.github_user_id::text
  AND c.user_id = u.id
  AND c.auth_identity_id IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM github_connections WHERE auth_identity_id IS NULL) THEN
    RAISE EXCEPTION 'Migration 006 stopped: one or more GitHub connections could not be mapped to an auth identity';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM github_connections c
    JOIN auth_identities i ON i.id = c.auth_identity_id
    WHERE c.user_id <> i.user_id
  ) THEN
    RAISE EXCEPTION 'Migration 006 stopped: a GitHub connection identity belongs to another Forge user';
  END IF;
  IF EXISTS (
    SELECT auth_identity_id FROM github_connections
    GROUP BY auth_identity_id HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'Migration 006 stopped: multiple existing connections map to the same GitHub identity';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM auth_sessions s
    LEFT JOIN github_connections c ON c.user_id = s.user_id
    WHERE c.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 006 stopped: one or more existing sessions have no GitHub connection to backfill';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_connections_auth_identity_user_fk') THEN
    ALTER TABLE github_connections
      ADD CONSTRAINT github_connections_auth_identity_user_fk
      FOREIGN KEY (auth_identity_id, user_id)
      REFERENCES auth_identities (id, user_id)
      ON DELETE RESTRICT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_connections_id_user_unique') THEN
    ALTER TABLE github_connections
      ADD CONSTRAINT github_connections_id_user_unique UNIQUE (id, user_id);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'github_connections_auth_identity_unique') THEN
    ALTER TABLE github_connections
      ADD CONSTRAINT github_connections_auth_identity_unique UNIQUE (auth_identity_id);
  END IF;
END $$;

ALTER TABLE auth_sessions
  ADD COLUMN IF NOT EXISTS active_github_connection_id UUID;

UPDATE auth_sessions s
SET active_github_connection_id = c.id
FROM github_connections c
WHERE c.user_id = s.user_id
  AND s.active_github_connection_id IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM auth_sessions s
    LEFT JOIN github_connections c
      ON c.id = s.active_github_connection_id AND c.user_id = s.user_id
    WHERE c.id IS NULL
  ) THEN
    RAISE EXCEPTION 'Migration 006 stopped: session connection ownership validation failed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_active_connection_user_fk') THEN
    ALTER TABLE auth_sessions
      ADD CONSTRAINT auth_sessions_active_connection_user_fk
      FOREIGN KEY (active_github_connection_id, user_id)
      REFERENCES github_connections (id, user_id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_auth_identities_user ON auth_identities(user_id);
CREATE INDEX IF NOT EXISTS idx_github_connections_identity ON github_connections(auth_identity_id);
CREATE INDEX IF NOT EXISTS idx_auth_sessions_active_connection ON auth_sessions(active_github_connection_id);


-- Keep the old Worker compatible during the additive rollout window. The old OAuth callback
-- does not know about auth_identities or active_github_connection_id; these triggers backfill
-- those values for new legacy-style inserts until the new Worker is deployed.
CREATE OR REPLACE FUNCTION forge_populate_github_connection_identity()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $
DECLARE
  v_github_id BIGINT;
  v_login TEXT;
  v_name TEXT;
  v_avatar TEXT;
  v_identity_id UUID;
  v_identity_user_id UUID;
BEGIN
  IF NEW.auth_identity_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT github_user_id, github_login, github_name, github_avatar_url
    INTO v_github_id, v_login, v_name, v_avatar
  FROM forge_users WHERE id = NEW.user_id;

  IF v_github_id IS NULL THEN
    RAISE EXCEPTION 'Cannot create a GitHub connection without a legacy GitHub identity during migration rollout';
  END IF;

  INSERT INTO auth_identities
    (user_id, provider, provider_subject, provider_login, provider_name, provider_avatar_url)
  VALUES
    (NEW.user_id, 'github', v_github_id::text, v_login, v_name, v_avatar)
  ON CONFLICT (provider, provider_subject) DO NOTHING;

  SELECT id, user_id INTO v_identity_id, v_identity_user_id
  FROM auth_identities
  WHERE provider = 'github' AND provider_subject = v_github_id::text;

  IF v_identity_id IS NULL OR v_identity_user_id IS DISTINCT FROM NEW.user_id THEN
    RAISE EXCEPTION 'Legacy GitHub connection identity is already owned by another Forge user';
  END IF;

  NEW.auth_identity_id := v_identity_id;
  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS github_connections_populate_auth_identity ON github_connections;
CREATE TRIGGER github_connections_populate_auth_identity
BEFORE INSERT OR UPDATE OF auth_identity_id ON github_connections
FOR EACH ROW EXECUTE FUNCTION forge_populate_github_connection_identity();

CREATE OR REPLACE FUNCTION forge_populate_session_active_github_connection()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $
BEGIN
  IF NEW.active_github_connection_id IS NULL THEN
    SELECT c.id INTO NEW.active_github_connection_id
    FROM github_connections c
    WHERE c.user_id = NEW.user_id
    ORDER BY c.created_at DESC
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$;

DROP TRIGGER IF EXISTS auth_sessions_populate_active_github_connection ON auth_sessions;
CREATE TRIGGER auth_sessions_populate_active_github_connection
BEFORE INSERT OR UPDATE OF active_github_connection_id ON auth_sessions
FOR EACH ROW EXECUTE FUNCTION forge_populate_session_active_github_connection();

COMMIT;
