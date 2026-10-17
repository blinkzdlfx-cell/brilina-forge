-- 007_github_app_installations.sql
-- GitHub App installations are distinct from OAuth identities/connections.
-- Requires migration 006 to be applied first.
BEGIN;

DO $$
BEGIN
  IF to_regclass('public.auth_identities') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='auth_sessions' AND column_name='active_github_connection_id') THEN
    RAISE EXCEPTION 'Migration 007 requires migration 006 first';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'auth_sessions_id_user_unique') THEN
    ALTER TABLE auth_sessions ADD CONSTRAINT auth_sessions_id_user_unique UNIQUE (id, user_id);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS github_app_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id BIGINT NOT NULL UNIQUE,
  account_id BIGINT NOT NULL,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('User', 'Organization', 'Enterprise')),
  repository_selection TEXT NOT NULL CHECK (repository_selection IN ('all', 'selected')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  suspended_at TIMESTAMPTZ,
  uninstalled_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT github_app_installations_permissions_object CHECK (jsonb_typeof(permissions) = 'object')
);

CREATE TABLE IF NOT EXISTS github_installation_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_record_id UUID NOT NULL REFERENCES github_app_installations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES forge_users(id) ON DELETE CASCADE,
  auth_identity_id UUID NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT github_installation_access_identity_user_fk
    FOREIGN KEY (auth_identity_id, user_id)
    REFERENCES auth_identities (id, user_id) ON DELETE RESTRICT,
  CONSTRAINT github_installation_access_unique UNIQUE (installation_record_id, user_id)
);

CREATE TABLE IF NOT EXISTS github_installation_repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_record_id UUID NOT NULL REFERENCES github_app_installations(id) ON DELETE CASCADE,
  github_repository_id BIGINT NOT NULL,
  github_node_id TEXT,
  owner_login TEXT NOT NULL,
  repository_name TEXT NOT NULL,
  full_name TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  is_private BOOLEAN NOT NULL DEFAULT false,
  is_archived BOOLEAN NOT NULL DEFAULT false,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT github_installation_repositories_unique UNIQUE (installation_record_id, github_repository_id)
);

CREATE TABLE IF NOT EXISTS github_app_installation_states (
  state_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES forge_users(id) ON DELETE CASCADE,
  auth_session_id UUID NOT NULL,
  auth_identity_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT github_app_installation_state_session_user_fk
    FOREIGN KEY (auth_session_id, user_id)
    REFERENCES auth_sessions (id, user_id) ON DELETE CASCADE,
  CONSTRAINT github_app_installation_state_identity_user_fk
    FOREIGN KEY (auth_identity_id, user_id)
    REFERENCES auth_identities (id, user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS github_app_webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  action_name TEXT,
  installation_id BIGINT,
  sender_github_user_id BIGINT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT
);
ALTER TABLE github_app_webhook_deliveries ADD COLUMN IF NOT EXISTS installation_id BIGINT;
ALTER TABLE github_app_webhook_deliveries ADD COLUMN IF NOT EXISTS sender_github_user_id BIGINT;

ALTER TABLE conversations ADD COLUMN IF NOT EXISTS github_app_installation_id UUID REFERENCES github_app_installations(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS github_installation_repository_id UUID REFERENCES github_installation_repositories(id) ON DELETE SET NULL;
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS github_context_type TEXT NOT NULL DEFAULT 'oauth';
DO $
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'conversations_github_context_type_check') THEN
    ALTER TABLE conversations ADD CONSTRAINT conversations_github_context_type_check
      CHECK (github_context_type IN ('oauth', 'installation'));
  END IF;
  ALTER TABLE conversations DROP CONSTRAINT IF EXISTS conversations_installation_context_check;
  ALTER TABLE conversations ADD CONSTRAINT conversations_installation_context_check
    CHECK (
      (github_context_type = 'oauth' AND github_app_installation_id IS NULL AND github_installation_repository_id IS NULL)
      OR
      (github_context_type = 'installation' AND repository_id IS NULL AND github_app_installation_id IS NOT NULL AND github_installation_repository_id IS NOT NULL)
    );
END $;

ALTER TABLE runs ADD COLUMN IF NOT EXISTS github_connection_id_snapshot UUID;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS github_app_installation_id_snapshot UUID;
ALTER TABLE runs ADD COLUMN IF NOT EXISTS github_context_type_snapshot TEXT;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'runs_github_context_type_snapshot_check') THEN
    ALTER TABLE runs ADD CONSTRAINT runs_github_context_type_snapshot_check
      CHECK (github_context_type_snapshot IS NULL OR github_context_type_snapshot IN ('oauth', 'installation'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_github_installation_access_user
  ON github_installation_access(user_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_github_installation_access_installation
  ON github_installation_access(installation_record_id) WHERE revoked_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_github_installation_repositories_name
  ON github_installation_repositories(installation_record_id, full_name);
CREATE INDEX IF NOT EXISTS idx_github_app_installation_states_expiry
  ON github_app_installation_states(expires_at);
CREATE INDEX IF NOT EXISTS idx_github_app_webhook_installation_installer
  ON github_app_webhook_deliveries(installation_id, event_name, action_name, sender_github_user_id);
CREATE INDEX IF NOT EXISTS idx_runs_github_installation_snapshot
  ON runs(github_app_installation_id_snapshot);

COMMIT;
