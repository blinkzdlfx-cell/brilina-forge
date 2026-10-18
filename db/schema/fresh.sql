-- Brilina Forge canonical fresh schema.
-- This file is for a new/empty Forge database only. It is not an in-place production reset.
-- It represents the complete schema expected by the current Worker, without the historical
-- additive migration sequence or legacy compatibility triggers.
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE forge_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  github_user_id BIGINT UNIQUE,
  github_login TEXT,
  github_name TEXT,
  github_avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspaces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID NOT NULL REFERENCES forge_users(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES forge_users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (workspace_id, user_id)
);

CREATE TABLE auth_identities (
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
  UNIQUE (provider, provider_subject),
  UNIQUE (id, user_id)
);

CREATE TABLE github_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES forge_users(id) ON DELETE CASCADE,
  auth_identity_id UUID NOT NULL,
  github_login TEXT NOT NULL,
  access_token_ciphertext TEXT NOT NULL,
  access_token_iv TEXT NOT NULL,
  access_token_tag TEXT NOT NULL,
  refresh_token_ciphertext TEXT,
  refresh_token_iv TEXT,
  refresh_token_tag TEXT,
  token_expires_at TIMESTAMPTZ,
  refresh_token_expires_at TIMESTAMPTZ,
  scopes TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT github_connections_auth_identity_user_fk
    FOREIGN KEY (auth_identity_id, user_id) REFERENCES auth_identities(id, user_id) ON DELETE RESTRICT,
  UNIQUE (id, user_id),
  UNIQUE (auth_identity_id)
);

CREATE TABLE auth_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES forge_users(id) ON DELETE CASCADE,
  active_github_connection_id UUID NOT NULL,
  session_token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (id, user_id),
  CONSTRAINT auth_sessions_active_connection_user_fk
    FOREIGN KEY (active_github_connection_id, user_id)
    REFERENCES github_connections(id, user_id) ON DELETE RESTRICT
);

CREATE TABLE repositories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  github_connection_id UUID NOT NULL REFERENCES github_connections(id) ON DELETE RESTRICT,
  github_node_id TEXT NOT NULL,
  github_owner TEXT NOT NULL,
  github_name TEXT NOT NULL,
  github_full_name TEXT NOT NULL,
  default_branch TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, github_node_id)
);

CREATE TABLE github_app_installations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_id BIGINT NOT NULL UNIQUE,
  account_id BIGINT NOT NULL,
  account_login TEXT NOT NULL,
  account_type TEXT NOT NULL CHECK (account_type IN ('User', 'Organization', 'Enterprise')),
  repository_selection TEXT NOT NULL CHECK (repository_selection IN ('all', 'selected')),
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(permissions) = 'object'),
  suspended_at TIMESTAMPTZ,
  uninstalled_at TIMESTAMPTZ,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE github_installation_access (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installation_record_id UUID NOT NULL REFERENCES github_app_installations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES forge_users(id) ON DELETE CASCADE,
  auth_identity_id UUID NOT NULL,
  linked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (auth_identity_id, user_id) REFERENCES auth_identities(id, user_id) ON DELETE RESTRICT,
  UNIQUE (installation_record_id, user_id)
);

CREATE TABLE github_installation_repositories (
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
  UNIQUE (installation_record_id, github_repository_id)
);

CREATE TABLE github_app_installation_states (
  state_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES forge_users(id) ON DELETE CASCADE,
  auth_session_id UUID NOT NULL,
  auth_identity_id UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (auth_session_id, user_id) REFERENCES auth_sessions(id, user_id) ON DELETE CASCADE,
  FOREIGN KEY (auth_identity_id, user_id) REFERENCES auth_identities(id, user_id) ON DELETE CASCADE
);

CREATE TABLE github_app_webhook_deliveries (
  delivery_id TEXT PRIMARY KEY,
  event_name TEXT NOT NULL,
  action_name TEXT,
  installation_id BIGINT,
  sender_github_user_id BIGINT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ,
  processing_error TEXT
);

CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES forge_users(id) ON DELETE RESTRICT,
  repository_id UUID REFERENCES repositories(id) ON DELETE SET NULL,
  branch_name TEXT,
  title TEXT,
  github_context_type TEXT NOT NULL DEFAULT 'oauth'
    CHECK (github_context_type IN ('oauth', 'installation')),
  github_app_installation_id UUID REFERENCES github_app_installations(id) ON DELETE SET NULL,
  github_installation_repository_id UUID REFERENCES github_installation_repositories(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (github_context_type = 'oauth' AND github_app_installation_id IS NULL AND github_installation_repository_id IS NULL)
    OR
    (github_context_type = 'installation' AND repository_id IS NULL AND github_app_installation_id IS NOT NULL AND github_installation_repository_id IS NOT NULL)
  )
);

CREATE TABLE runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES forge_users(id) ON DELETE RESTRICT,
  status TEXT NOT NULL CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted')),
  provider TEXT,
  model TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_message TEXT,
  repository_full_name_snapshot TEXT,
  branch_name_snapshot TEXT,
  github_connection_id_snapshot UUID,
  github_app_installation_id_snapshot UUID,
  github_context_type_snapshot TEXT CHECK (github_context_type_snapshot IS NULL OR github_context_type_snapshot IN ('oauth', 'installation')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE conversation_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system', 'tool')),
  content TEXT NOT NULL,
  tool_name TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE tool_calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES runs(id) ON DELETE CASCADE,
  tool_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('requested', 'authorized', 'running', 'completed', 'failed', 'rejected')),
  arguments JSONB NOT NULL DEFAULT '{}'::jsonb,
  result JSONB,
  error_message TEXT,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE usage_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES runs(id) ON DELETE SET NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  input_tokens INTEGER,
  output_tokens INTEGER,
  estimated_cost_usd NUMERIC(18, 8),
  duration_ms INTEGER,
  retry_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE github_tool_preferences (
  user_id UUID PRIMARY KEY REFERENCES forge_users(id) ON DELETE CASCADE,
  enabled_tool_names JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(enabled_tool_names) = 'array'),
  enabled_categories JSONB NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(enabled_categories) = 'array'),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE companion_work_results (
  id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  conversation_id TEXT NOT NULL,
  command TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'timed_out')),
  exit_code INTEGER,
  output TEXT,
  truncated BOOLEAN NOT NULL DEFAULT false,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_workspace_members_user ON workspace_members(user_id);
CREATE INDEX idx_repositories_workspace ON repositories(workspace_id);
CREATE INDEX idx_auth_sessions_user ON auth_sessions(user_id);
CREATE INDEX idx_auth_sessions_expires_at ON auth_sessions(expires_at);
CREATE INDEX idx_auth_sessions_active_connection ON auth_sessions(active_github_connection_id);
CREATE INDEX idx_auth_identities_user ON auth_identities(user_id);
CREATE INDEX idx_github_connections_identity ON github_connections(auth_identity_id);
CREATE INDEX idx_github_installation_access_user ON github_installation_access(user_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_github_installation_access_installation ON github_installation_access(installation_record_id) WHERE revoked_at IS NULL;
CREATE INDEX idx_github_installation_repositories_name ON github_installation_repositories(installation_record_id, full_name);
CREATE INDEX idx_github_app_installation_states_expiry ON github_app_installation_states(expires_at);
CREATE INDEX idx_github_app_webhook_installation_installer ON github_app_webhook_deliveries(installation_id, event_name, action_name, sender_github_user_id);
CREATE INDEX idx_conversations_workspace_updated ON conversations(workspace_id, updated_at DESC);
CREATE INDEX idx_conversation_messages_conversation_created ON conversation_messages(conversation_id, created_at, id);
CREATE INDEX idx_conversation_messages_run ON conversation_messages(run_id) WHERE run_id IS NOT NULL;
CREATE INDEX idx_runs_conversation_created ON runs(conversation_id, created_at DESC);
CREATE INDEX idx_runs_github_installation_snapshot ON runs(github_app_installation_id_snapshot);
CREATE INDEX idx_tool_calls_run_created ON tool_calls(run_id, created_at ASC);
CREATE INDEX idx_usage_records_run ON usage_records(run_id);
CREATE INDEX idx_usage_records_provider_created ON usage_records(provider, created_at DESC);
CREATE INDEX companion_work_results_pending_idx ON companion_work_results(device_id, created_at) WHERE status = 'pending';
CREATE INDEX companion_work_results_completed_idx ON companion_work_results(id, completed_at);

COMMIT;
