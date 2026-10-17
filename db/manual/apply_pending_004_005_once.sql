-- Brilina Forge: apply pending migrations 004 and 005 to Neon production.
-- Run ONLY if both migrations have not already been applied.
-- Neon Dashboard > project > Branches > production > SQL Editor > database neondb.
-- Stop if any statement errors. Do not rerun after successful completion.

BEGIN;

-- From db/migrations/004_github_tool_preferences.sql
CREATE TABLE github_tool_preferences (
  user_id UUID PRIMARY KEY
    REFERENCES forge_users(id) ON DELETE CASCADE,
  enabled_tool_names JSONB NOT NULL DEFAULT '[]'::jsonb,
  enabled_categories JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT github_tool_preferences_names_array
    CHECK (jsonb_typeof(enabled_tool_names) = 'array'),
  CONSTRAINT github_tool_preferences_categories_array
    CHECK (jsonb_typeof(enabled_categories) = 'array')
);

-- From db/migrations/005_run_context_snapshot.sql
ALTER TABLE runs
  ADD COLUMN repository_full_name_snapshot TEXT,
  ADD COLUMN branch_name_snapshot TEXT;

UPDATE runs
SET repository_full_name_snapshot = r.github_full_name,
    branch_name_snapshot = c.branch_name
FROM conversations c
LEFT JOIN repositories r ON r.id = c.repository_id
WHERE runs.conversation_id = c.id
  AND runs.repository_full_name_snapshot IS NULL
  AND runs.branch_name_snapshot IS NULL;

COMMIT;

-- Verification 1: expect public.github_tool_preferences.
SELECT to_regclass('public.github_tool_preferences') AS preferences_table;

-- Verification 2: expect two snapshot columns and four preference columns.
SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE
  (table_name = 'runs'
   AND column_name IN (
     'repository_full_name_snapshot',
     'branch_name_snapshot'
   ))
  OR
  (table_name = 'github_tool_preferences'
   AND column_name IN (
     'user_id',
     'enabled_tool_names',
     'enabled_categories',
     'updated_at'
   ))
ORDER BY table_name, column_name;

-- Verification 3: review counts. Existing runs with null repository/branch
-- context can legitimately remain null if the conversation had no selection.
SELECT
  COUNT(*) AS total_runs,
  COUNT(repository_full_name_snapshot) AS runs_with_repository,
  COUNT(branch_name_snapshot) AS runs_with_branch
FROM runs;
