-- 005_run_context_snapshot.sql
-- Bind each queued run to the repository and branch selected when it was created.
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
