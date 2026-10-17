-- 004_github_tool_preferences.sql
-- User preferences can narrow tool availability but never bypass server-side policy.
CREATE TABLE github_tool_preferences (
  user_id UUID PRIMARY KEY REFERENCES forge_users(id) ON DELETE CASCADE,
  enabled_tool_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT github_tool_preferences_names_array CHECK (jsonb_typeof(enabled_tool_names) = 'array'),
  CONSTRAINT github_tool_preferences_categories_array CHECK (jsonb_typeof(enabled_categories) = 'array')
);
